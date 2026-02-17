/**
 * OAuthServerProvider implementation for the Missive MCP server.
 *
 * Since Missive has no OAuth provider, our server IS the authorization server.
 * Users paste their Missive PAT into a form, we validate it, encrypt+store it,
 * and issue OAuth tokens that map back to the stored PAT.
 */

import { randomBytes, timingSafeEqual, createHash } from 'crypto';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import * as storage from './storage.js';

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Validate PKCE: SHA256(code_verifier) base64url-encoded must match stored code_challenge
 */
function validatePkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
  } catch {
    return false;
  }
}

// --- Clients Store ---

class ClientsStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return storage.getClient(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): OAuthClientInformationFull {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomBytes(16).toString('hex'),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    } as OAuthClientInformationFull;
    storage.registerClient(full);
    return full;
  }
}

// --- Provider ---

export class MissiveOAuthProvider implements OAuthServerProvider {
  private readonly _clientsStore = new ClientsStore();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Redirect the browser to our PAT form page, passing OAuth params as query parameters.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const query = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
    });
    if (params.state) query.set('state', params.state);

    res.redirect(`/authorize-form?${query.toString()}`);
  }

  /**
   * Return the stored code challenge for PKCE validation.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const code = storage.getCode(authorizationCode);
    if (!code) throw new Error('Invalid or expired authorization code');
    return code.codeChallenge;
  }

  /**
   * Exchange authorization code for tokens. Validates PKCE, generates access+refresh tokens.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    _redirectUri?: string,
  ): Promise<OAuthTokens> {
    const code = storage.getCode(authorizationCode);
    if (!code) throw new Error('Invalid or expired authorization code');
    if (code.clientId !== client.client_id) throw new Error('Client mismatch');

    // PKCE validation
    if (codeVerifier) {
      if (!validatePkce(codeVerifier, code.codeChallenge)) {
        throw new Error('PKCE validation failed');
      }
    }

    // Generate tokens
    const accessToken = generateToken();
    const refreshToken = generateToken();

    storage.storeToken({
      accessToken,
      refreshToken,
      clientId: client.client_id,
      userId: code.userId,
      scopes: [],
    });

    // Consume the code
    storage.deleteCode(authorizationCode);

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: storage.ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
    };
  }

  /**
   * Exchange refresh token for a new access token.
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    const existing = storage.getTokenByRefresh(refreshToken);
    if (!existing) throw new Error('Invalid refresh token');
    if (existing.clientId !== client.client_id) throw new Error('Client mismatch');

    // Check refresh token expiry
    if (Date.now() > existing.refreshExpiresAt) {
      storage.deleteToken(existing.accessToken);
      throw new Error('Refresh token expired');
    }

    // Delete old token
    storage.deleteToken(existing.accessToken);

    // Issue new tokens
    const newAccessToken = generateToken();
    const newRefreshToken = generateToken();

    storage.storeToken({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      clientId: client.client_id,
      userId: existing.userId,
      scopes: existing.scopes,
    });

    return {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: storage.ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
    };
  }

  /**
   * Verify an access token and return AuthInfo with the Missive PAT in extra.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = storage.getTokenByAccess(token);
    if (!stored) throw new Error('Invalid access token');
    if (Date.now() > stored.accessExpiresAt) {
      storage.deleteToken(stored.accessToken);
      throw new Error('Access token expired');
    }

    const missiveToken = storage.getUserPat(stored.userId);
    if (!missiveToken) throw new Error('User PAT not found');

    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.accessExpiresAt / 1000),
      extra: {
        missiveToken,
        userId: stored.userId,
      },
    };
  }
}
