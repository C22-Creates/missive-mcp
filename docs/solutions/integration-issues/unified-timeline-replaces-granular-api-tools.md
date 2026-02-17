---
title: Replace granular API list tools with unified timeline
date: 2026-02-17
category: integration-issues
module: tools/messages
tags: [mcp-tools, api-design, caching, timeline]
symptoms:
  - LLM needs 3 separate tool calls to read a conversation
  - Context lost between messages, posts, and comments
  - Mental model mismatch with Missive UI
---

# Replace Granular API List Tools with Unified Timeline

## Problem Statement

The original MCP tool design mirrored the Missive REST API 1:1, exposing `list_messages`, `list_posts`, and `list_comments` as separate tools. This created three problems:

1. **3 calls per conversation** — LLM had to call each tool separately to see the full picture
2. **Lost temporal context** — a post closing a conversation appeared disconnected from the messages it related to
3. **Mental model mismatch** — Missive displays conversations as a single interleaved timeline; the tools didn't

## Root Cause

API-first design instead of consumer-first design. The tools were shaped around the REST endpoints rather than around how the LLM (the consumer) needs to understand conversations.

## Solution

Replace all three tools with a single `get_conversation_timeline` that:

- Fetches messages, posts, and comments in parallel (3 concurrent API calls)
- Merges them into a chronological timeline sorted by timestamp
- Tags each item with a `type` discriminated union (`message` | `post` | `comment`)
- Returns previews by default (use `get_message` for full bodies)

### Key implementation details

**Discriminated union type** (`src/types/missive.ts`):
```typescript
export type TimelineItem =
  | { type: 'message'; data: Message; timestamp: number }
  | { type: 'post'; data: Post; timestamp: number }
  | { type: 'comment'; data: Comment; timestamp: number };
```

**Per-conversation caching** (`src/cache.ts`):
- In-memory `Map<string, ConversationCache>` keyed by conversation ID
- Each cache tracks items by ID and maintains timestamp bounds
- `addToCache` returns `{ newItems, hitCache }` — when `hitCache` is true, stop fetching (we've reached previously-seen data)
- Subsequent calls only fetch what's new

**Pagination**: `older_than` parameter for scrolling back in time. The response includes `oldest_timestamp` for the next page cursor.

**Dead code handling**: Old tool implementations commented out in source (not deleted) in case granular access is needed later.

### Files changed

| File | Change |
|------|--------|
| `src/tools/messages.ts` | New `get_conversation_timeline` tool, old tools commented out |
| `src/cache.ts` | New file — per-conversation timeline cache |
| `src/types/missive.ts` | Added `TimelineItem` discriminated union |
| `src/index.ts` | Load and pass `instructions.md` to MCP server |
| `instructions.md` | Server-level instructions explaining Missive concepts |
| `README.md` | Updated tool table |

## Prevention / Lessons

- **Design tools for the consumer, not the API.** MCP tools should match how the LLM needs to think about the domain, not how the underlying REST API is structured.
- **Parallel fetch + merge** is a good pattern when the underlying API splits data the consumer needs together.
- **Cache with stop-on-hit** avoids redundant fetches without complex cache invalidation — just stop when you see IDs you already have.
- **Keep `instructions.md`** as a server-level brief so the LLM understands the domain model (conversations contain messages + posts + comments) before it ever calls a tool.
