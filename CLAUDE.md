# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for the Missive email API. Supports two modes:
- **stdio** (`npm start`) — single-user local mode, reads `MISSIVE_API_TOKEN` from env
- **remote** (`npm run remote`) — hosted HTTP server with OAuth, each user provides their own Missive PAT

Single-user project — never worry about backwards compatibility.

## Commands

```bash
npm run build    # Compile TypeScript to dist/
npm run dev      # Watch mode for development
npm start        # Run stdio server (requires MISSIVE_API_TOKEN env var)
npm run remote   # Run HTTP server (requires ENCRYPTION_KEY, BASE_URL env vars)
```

No test suite.

## Architecture

### Entry Points

- `src/index.ts` — stdio mode: validates token, loads instructions.md, registers tools, connects via stdio transport
- `src/server.ts` — remote mode: Express server with OAuth, StreamableHTTPServerTransport

### API Client

`src/client.ts` — `MissiveClient` class with typed error handling (AuthError, RateLimitError, NotFoundError). Token redaction in error messages. Two access patterns:
- `getClient()` — singleton for stdio mode (reads env)
- `getClientForToken(token)` — per-token factory with WeakRef cache for remote mode

### Tools (`src/tools/`)

Each tool file exports `registerXxxTools(server: McpServer, getClient: ClientResolver)`. The `ClientResolver` type (`src/types/tools.ts`) resolves a `MissiveClient` from the request's `authInfo.extra.missiveToken`. Tool callbacks receive `(params, extra)` where `extra` contains `authInfo`.

- `reference.ts` — organizations, teams, users, contact books, labels (with per-user TTL caching)
- `conversations.ts` — list/get conversations
- `messages.ts` — `get_message` and `get_conversation_timeline` (unified view of messages/posts/comments)
- `drafts.ts` — create/send/delete drafts with per-user rate limiting (10/min, 100/hr)
- `contacts.ts` — CRUD for contacts
- `management.ts` — `create_post` for closing, labeling, assigning conversations

### Auth (`src/auth/`)

- `provider.ts` — `OAuthServerProvider` implementation. Our server IS the OAuth authorization server.
- `storage.ts` — file-based JSON storage for OAuth clients, codes, tokens, and AES-256-GCM encrypted PATs
- `authorize-page.ts` — HTML form where users paste their Missive PAT

### Other

- `src/types/missive.ts` — Missive API response types including `TimelineItem` discriminated union
- `src/cache.ts` — per-conversation cache for timeline data with smart stop-on-hit fetching (keyed by `userId:conversationId` in remote mode)
- `src/errors.ts` — typed error classes for API responses

## Tool Registration Pattern

```typescript
export function registerXxxTools(server: McpServer, getClient: ClientResolver): void {
  server.registerTool(
    'tool_name',
    {
      title: 'Human Title',
      description: 'Description with usage notes',
      inputSchema: { param: z.string().describe('...') },
    },
    async (params, extra) => {
      const client = getClient(extra);
      const data = await client.get('/path');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
```

## Environment Variables

| Variable | Mode | Description |
|---|---|---|
| `MISSIVE_API_TOKEN` | stdio | Missive API token |
| `ENCRYPTION_KEY` | remote | 32-byte hex string for AES-256-GCM PAT encryption |
| `BASE_URL` | remote | Public URL (e.g., `https://missive-mcp.example.com`) |
| `PORT` | remote | HTTP port (default 3000) |
| `DATA_DIR` | remote | Directory for JSON storage files (default `./data`) |

## API Reference

API docs: https://missiveapp.com/docs/developers/rest-api
