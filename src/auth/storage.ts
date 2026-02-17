/**
 * File-based storage for OAuth data: clients, authorization codes, tokens, and encrypted user PATs.
 *
 * Data is stored as JSON files in a configurable directory (DATA_DIR env, default ./data).
 * Writes are atomic (write-to-temp-then-rename). Expired codes/tokens are cleaned periodically.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

const DATA_DIR = process.env.DATA_DIR || './data';

// TTLs
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Encryption
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required');
  return Buffer.from(key, 'hex');
}

export interface EncryptedValue {
  iv: string;
  encrypted: string;
  tag: string;
}

export function encrypt(plaintext: string): EncryptedValue {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64url'),
    encrypted: encrypted.toString('base64url'),
    tag: tag.toString('base64url'),
  };
}

export function decrypt(value: EncryptedValue): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(value.iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  return decipher.update(Buffer.from(value.encrypted, 'base64url')) + decipher.final('utf8');
}

/** Hash a PAT to derive a stable userId */
export function hashPat(pat: string): string {
  return createHash('sha256').update(pat).digest('hex').slice(0, 16);
}

// --- Storage types ---

export interface StoredCode {
  clientId: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
}

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  userId: string;
  scopes: string[];
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export interface StoredUser {
  userId: string;
  encryptedPat: EncryptedValue;
}

// --- File I/O helpers ---

function ensureDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name: string): string {
  return join(DATA_DIR, name);
}

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath(name), 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(name: string, data: unknown): void {
  ensureDir();
  const target = filePath(name);
  const tmp = target + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, target);
}

// --- In-memory stores loaded from disk ---

let clients: Record<string, OAuthClientInformationFull> = {};
let codes: Record<string, StoredCode> = {};
let tokens: Record<string, StoredToken> = {}; // keyed by accessToken
let refreshTokenIndex: Record<string, string> = {}; // refreshToken -> accessToken
let users: Record<string, StoredUser> = {}; // keyed by userId

function loadAll(): void {
  ensureDir();
  clients = readJson('clients.json', {});
  codes = readJson('codes.json', {});
  tokens = readJson('tokens.json', {});
  users = readJson('users.json', {});
  // Rebuild refresh token index
  refreshTokenIndex = {};
  for (const [accessToken, token] of Object.entries(tokens)) {
    refreshTokenIndex[token.refreshToken] = accessToken;
  }
}

// Load on import
loadAll();

// --- Clients ---

export function getClient(clientId: string): OAuthClientInformationFull | undefined {
  return clients[clientId];
}

export function registerClient(client: OAuthClientInformationFull): void {
  clients[client.client_id] = client;
  writeJson('clients.json', clients);
}

// --- Authorization Codes ---

export function storeCode(code: string, data: Omit<StoredCode, 'expiresAt'>): void {
  codes[code] = { ...data, expiresAt: Date.now() + CODE_TTL_MS };
  writeJson('codes.json', codes);
}

export function getCode(code: string): StoredCode | undefined {
  const stored = codes[code];
  if (!stored) return undefined;
  if (Date.now() > stored.expiresAt) {
    delete codes[code];
    writeJson('codes.json', codes);
    return undefined;
  }
  return stored;
}

export function deleteCode(code: string): void {
  delete codes[code];
  writeJson('codes.json', codes);
}

// --- Tokens ---

export function storeToken(data: Omit<StoredToken, 'accessExpiresAt' | 'refreshExpiresAt'>): StoredToken {
  const token: StoredToken = {
    ...data,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    refreshExpiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
  };
  tokens[token.accessToken] = token;
  refreshTokenIndex[token.refreshToken] = token.accessToken;
  writeJson('tokens.json', tokens);
  return token;
}

export function getTokenByAccess(accessToken: string): StoredToken | undefined {
  return tokens[accessToken];
}

export function getTokenByRefresh(refreshToken: string): StoredToken | undefined {
  const accessToken = refreshTokenIndex[refreshToken];
  if (!accessToken) return undefined;
  return tokens[accessToken];
}

export function deleteToken(accessToken: string): void {
  const token = tokens[accessToken];
  if (token) {
    delete refreshTokenIndex[token.refreshToken];
  }
  delete tokens[accessToken];
  writeJson('tokens.json', tokens);
}

// --- Users (encrypted PATs) ---

export function storeUser(userId: string, pat: string): void {
  users[userId] = { userId, encryptedPat: encrypt(pat) };
  writeJson('users.json', users);
}

export function getUserPat(userId: string): string | undefined {
  const user = users[userId];
  if (!user) return undefined;
  return decrypt(user.encryptedPat);
}

// --- Cleanup ---

function cleanup(): void {
  const now = Date.now();
  let codesChanged = false;
  let tokensChanged = false;

  for (const [code, stored] of Object.entries(codes)) {
    if (now > stored.expiresAt) {
      delete codes[code];
      codesChanged = true;
    }
  }

  for (const [accessToken, stored] of Object.entries(tokens)) {
    if (now > stored.refreshExpiresAt) {
      delete refreshTokenIndex[stored.refreshToken];
      delete tokens[accessToken];
      tokensChanged = true;
    }
  }

  if (codesChanged) writeJson('codes.json', codes);
  if (tokensChanged) writeJson('tokens.json', tokens);
}

setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();

// --- Constants re-exported for token generation ---

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MS / 1000;
