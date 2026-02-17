# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for the Missive email API. Single-user project — never worry about backwards compatibility.

## Commands

```bash
npm run build    # Compile TypeScript to dist/
npm run dev      # Watch mode for development
npm start        # Run the server (requires MISSIVE_API_TOKEN env var)
```

No test suite. Requires `MISSIVE_API_TOKEN` environment variable.

## Architecture

**Entry point:** `src/index.ts` — validates token, loads instructions.md, registers all tools, connects via stdio transport.

**API client:** `src/client.ts` — singleton `MissiveClient` with typed error handling (AuthError, RateLimitError, NotFoundError). Token redaction in error messages.

**Tools are organized by domain in `src/tools/`:**
- `reference.ts` — organizations, teams, users, contact books, labels (with TTL caching)
- `conversations.ts` — list/get conversations
- `messages.ts` — `get_message` and `get_conversation_timeline` (unified view of messages/posts/comments)
- `drafts.ts` — create/send/delete drafts with client-side rate limiting (10/min, 100/hr)
- `contacts.ts` — CRUD for contacts
- `management.ts` — `create_post` for closing, labeling, assigning conversations

**Types:** `src/types/missive.ts` — Missive API response types including `TimelineItem` discriminated union.

**Caching:** `src/cache.ts` — per-conversation cache for timeline data (messages, posts, comments) with smart stop-on-hit fetching.

## Tool Registration Pattern

Each tool file exports a `register*Tools(server: McpServer)` function. Tools use zod schemas for input validation:

```typescript
server.registerTool(
  'tool_name',
  {
    title: 'Human Title',
    description: 'Description with usage notes',
    inputSchema: { param: z.string().describe('...') },
  },
  async (params) => {
    // Implementation
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);
```

## API Reference

API docs: https://missiveapp.com/docs/developers/rest-api
