/**
 * Shared types for tool registration
 */

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { MissiveClient } from '../client.js';

export type ClientResolver = (extra: { authInfo?: AuthInfo }) => MissiveClient;
