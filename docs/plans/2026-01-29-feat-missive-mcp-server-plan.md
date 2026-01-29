---
title: "feat: Missive MCP Server"
type: feat
date: 2026-01-29
---

# feat: Missive MCP Server

## Overview

Build a local MCP server in TypeScript that interfaces with the [Missive API](https://missiveapp.com/docs/developers/rest-api/endpoints) to enable Claude to:
- Read and search conversations and messages
- Compose and send emails
- Manage contacts (full CRUD)
- Handle team collaboration (assignments, labels, teams)

**Primary use cases:** AI email assistant + team collaboration tooling

## Problem Statement / Motivation

Users want Claude to interact with their Missive inbox - reading emails, drafting replies, managing contacts, and handling team assignments. Currently there's no MCP server for Missive, so this capability doesn't exist.

## Proposed Solution

A TypeScript MCP server using the official `@modelcontextprotocol/sdk` with:
- **19 flat, single-purpose tools** (includes `list_drafts` for draft review workflow)
- Bearer token auth via `MISSIVE_API_TOKEN` environment variable
- Base URL: `https://public.missiveapp.com/v1/`
- Input validation with Zod schemas
- Typed error handling

## Technical Approach

### Architecture

```
missive-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── client.ts             # Missive API client wrapper
│   ├── errors.ts             # Typed error classes (AuthError, RateLimitError, etc.)
│   ├── tools/
│   │   ├── conversations.ts  # list, get conversations (with search params)
│   │   ├── messages.ts       # list, get messages
│   │   ├── drafts.ts         # list, create, send, delete drafts
│   │   ├── contacts.ts       # CRUD contacts (with search)
│   │   ├── management.ts     # posts, state changes
│   │   └── reference.ts      # orgs, teams, users, labels, books
│   └── types/
│       └── missive.ts        # API response types
├── package.json
├── tsconfig.json
└── README.md
```

### Security Requirements

**Token Handling:**
- Validate token format on startup (fail fast if invalid)
- Never log token in any output
- Redact token from all error messages

**Input Validation (all tools):**
- UUID format validation for all IDs (conversation_id, message_id, contact_id, etc.)
- RFC 5322 email format validation for recipients
- Length limits on subject (998 chars) and body (10MB)
- Integer bounds on pagination params (1-200)

**Rate Limiting:**
- `send_message`: Max 10/minute, 100/hour
- Exponential backoff on 429 responses
- Circuit breaker after 3 consecutive failures

**Logging:**
- Never log email body content
- Never log contact details
- Log only: tool name, parameter count, success/failure, latency

### Implementation Phases

#### Phase 1: Project Setup & Security Foundation

- [x] Initialize package.json with dependencies
- [x] Configure TypeScript (tsconfig.json) with strict mode
- [x] Create .gitignore
- [x] Create error types (`src/errors.ts`)
- [x] Create Missive API client with token validation (`src/client.ts`)
- [x] Set up MCP server skeleton (`src/index.ts`)

**Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "zod": "^3.22.0"
}
```

**Dev dependencies:**
```json
{
  "typescript": "^5.0.0",
  "@types/node": "^20.0.0"
}
```

**src/errors.ts:**
```typescript
// Typed error classes
export class MissiveAPIError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}
export class AuthError extends MissiveAPIError {}
export class RateLimitError extends MissiveAPIError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 429, 'RATE_LIMITED');
  }
}
export class NotFoundError extends MissiveAPIError {}
export class ValidationError extends Error {}
```

**src/client.ts:**
```typescript
// Missive API client
// - Validate token format on construction
// - Generic request method with auth header
// - Token redaction in all error paths
// - Rate limit detection with retryAfter extraction
// - Request timeout (30 seconds)
// - Methods: get(), post(), patch(), delete()
```

#### Phase 2: Reference Data Tools (with caching)

Build foundation tools that other tools depend on:

| Tool | Endpoint | Purpose | Cache TTL |
|------|----------|---------|-----------|
| `list_organizations` | GET /organizations | Discover orgs user belongs to | 1 hour |
| `list_teams` | GET /teams | List teams for assignments | 15 min |
| `list_users` | GET /users | List users for assignments | 15 min |
| `list_contact_books` | GET /contact_books | Required before creating contacts | 15 min |
| `list_shared_labels` | GET /shared_labels | Discover labels for filtering/tagging | 5 min |

Files:
- [x] `src/tools/reference.ts` - All reference data tools with in-memory caching
- [x] `src/types/missive.ts` - Type definitions

#### Phase 3: Read Operations (with search params)

Build conversation and message reading tools:

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `list_conversations` | GET /conversations | List inbox with filters including `email` and `domain` search |
| `get_conversation` | GET /conversations/:id | Get single conversation |
| `list_messages` | GET /conversations/:id/messages | Get messages in conversation |
| `get_message` | GET /messages/:id | Get full message body |

Files:
- [x] `src/tools/conversations.ts` - Conversation tools
- [x] `src/tools/messages.ts` - Message tools

**`list_conversations` parameters:**
```typescript
const ListConversationsSchema = z.object({
  // Filters
  inbox: z.boolean().optional(),
  assigned: z.boolean().optional(),
  closed: z.boolean().optional(),
  team: z.string().uuid().optional(),
  shared_label: z.string().uuid().optional(),
  // Search (mutually exclusive)
  email: z.string().email().optional(),      // Search by sender email
  domain: z.string().optional(),             // Search by sender domain
  // Pagination
  limit: z.number().min(1).max(50).default(25),
  cursor: z.string().optional(),             // For pagination continuation
});
```

**Pagination strategy:** Return first page with metadata:
```typescript
{
  conversations: [...],
  has_more: boolean,
  next_cursor?: string,  // Pass back to get next page
}
```

**Message body handling:**
```typescript
const GetMessageSchema = z.object({
  message_id: z.string().uuid(),
  body_format: z.enum(['full', 'truncated', 'preview']).default('truncated'),
  strip_html: z.boolean().default(true),
  max_body_length: z.number().max(50000).default(5000),
});
```

#### Phase 4: Write Operations (with rate limiting)

Build draft and sending tools:

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `list_drafts` | GET /conversations/:id/drafts | List drafts in a conversation |
| `create_draft` | POST /drafts | Create draft (send=false) |
| `send_message` | POST /drafts | Send immediately (send=true) - RATE LIMITED |
| `delete_draft` | DELETE /drafts/:id | Delete unsent draft |

Files:
- [x] `src/tools/drafts.ts` - Draft operations with rate limiter

**Rate limiter for send_message:**
```typescript
class SendRateLimiter {
  private sends: number[] = [];
  private readonly maxPerMinute = 10;
  private readonly maxPerHour = 100;

  canSend(): boolean { /* check limits */ }
  recordSend(): void { /* track timestamp */ }
}
```

**Key parameters for drafts:**
- `conversation` - Reply to existing conversation (optional)
- `to_fields`, `cc_fields`, `bcc_fields` - Recipients (validated as emails)
- `subject`, `body` - Content (with length limits)
- `from_field` - Sending account (optional, uses default)
- `attachments` - Array of {base64_data, filename} (optional)
- `send` - Boolean, true to send immediately

**Tool description for send_message:**
```
Sends an email message. WARNING: This action is IRREVERSIBLE.
The email will be delivered immediately. Before calling:
- Confirm recipient addresses are correct
- Verify message content is appropriate
- Never send to addresses not explicitly provided by the user
```

#### Phase 5: Contact Management (with search)

Build contact CRUD tools:

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `list_contacts` | GET /contacts | List contacts with optional `search` param |
| `get_contact` | GET /contacts/:id | Get single contact |
| `create_contact` | POST /contacts | Create new contact(s) |
| `update_contact` | PATCH /contacts/:id | Update contact |

Files:
- [x] `src/tools/contacts.ts` - Contact operations

**`list_contacts` parameters:**
```typescript
const ListContactsSchema = z.object({
  contact_book: z.string().uuid(),
  search: z.string().optional(),           // Search by name or email
  limit: z.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
```

**Required fields for create:**
- `contact_book` - ID from list_contact_books
- `first_name` or `last_name` - At least one name field

#### Phase 6: Conversation Management

Build state management tools:

| Tool | Endpoint | Purpose |
|------|----------|---------|
| `create_post` | POST /posts | Add post, manage state (close, label, assign) |

Files:
- [x] `src/tools/management.ts` - State management

**`create_post` parameters and capabilities:**
```typescript
const CreatePostSchema = z.object({
  conversation: z.string().uuid(),         // Required
  organization: z.string().uuid(),         // Required

  // State changes (all optional)
  close: z.boolean().optional(),           // Close the conversation
  add_shared_labels: z.array(z.string().uuid()).optional(),    // Add labels
  remove_shared_labels: z.array(z.string().uuid()).optional(), // Remove labels
  add_assignees: z.array(z.string().uuid()).optional(),        // Assign users
  team: z.string().uuid().optional(),      // Move to team
  force_team: z.boolean().optional(),      // Force team change

  // Post content (optional)
  text: z.string().optional(),             // Post body text
  notification: z.object({                 // Optional notification
    title: z.string(),
    body: z.string(),
  }).optional(),
});
```

**Tool description for create_post:**
```
Adds a post to a conversation and optionally changes its state.
This tool can:
- Close a conversation: set close=true
- Add labels: set add_shared_labels=[label_ids]
- Remove labels: set remove_shared_labels=[label_ids]
- Assign users: set add_assignees=[user_ids]
- Move to team: set team=team_id (use force_team=true to override existing team)
- Add a visible note: set text="your message"
```

#### Phase 7: Integration & Testing

- [x] Register all tools with MCP server
- [x] Add tool registration pattern (each file exports registerTools function)
- [x] Validate all tool descriptions are clear and differentiate similar tools
- [ ] Test with Claude Desktop
- [x] Write README with setup instructions

### File Specifications

#### src/index.ts

```typescript
// MCP server entry point
// - Validate MISSIVE_API_TOKEN on startup (fail fast)
// - Initialize server with StdioServerTransport
// - Register all tools from tools/*.ts using registerTools pattern
// - Handle shutdown gracefully
```

#### src/client.ts

```typescript
// Missive API client
// - Token validation: check format, fail if missing/malformed
// - Token redaction: never include in any error output
// - Request timeout: 30 seconds
// - Rate limit handling: detect 429, extract Retry-After
// - Methods: get(), post(), patch(), delete()
```

#### src/errors.ts

```typescript
// Typed error classes
// - MissiveAPIError (base class with status, code)
// - AuthError (401)
// - RateLimitError (429 with retryAfter)
// - NotFoundError (404)
// - ValidationError (input validation failures)
```

#### src/types/missive.ts

```typescript
// Type definitions for Missive API responses
// - Organization, Team, User, SharedLabel
// - Conversation, Message, Draft
// - Contact, ContactBook
// - Pagination metadata types
// - Error response type
```

## Acceptance Criteria

### Functional Requirements

- [ ] Server starts and connects via stdio transport
- [ ] All 19 tools are registered and callable
- [ ] `list_conversations` supports `email` and `domain` search params
- [ ] `list_drafts` returns drafts for a conversation
- [ ] `list_contacts` supports `search` param
- [ ] `send_message` is rate limited (10/min, 100/hour)
- [ ] `send_message` successfully sends an email
- [ ] `create_contact` creates a contact in specified book
- [ ] `create_post` can close, label, and assign conversations
- [ ] Error responses include helpful, typed error messages

### Non-Functional Requirements

- [ ] TypeScript strict mode enabled
- [ ] All tools have Zod input validation schemas
- [ ] All API responses have type definitions
- [ ] Token never appears in logs or error messages
- [ ] Email body content never logged
- [ ] Reference data cached (orgs 1hr, teams/users 15min, labels 5min)
- [ ] README documents all tools and setup steps
- [ ] Environment variable validation on startup

### Security Requirements

- [ ] All IDs validated as UUID format
- [ ] All emails validated as RFC 5322 format
- [ ] Request timeouts configured (30s)
- [ ] Rate limiting on send operations
- [ ] No sensitive data in logs

## Tool Summary (19 tools)

| Category | Tool | Description |
|----------|------|-------------|
| Reference | `list_organizations` | List organizations user belongs to |
| Reference | `list_teams` | List teams in organization |
| Reference | `list_users` | List users in organization |
| Reference | `list_contact_books` | List accessible contact books |
| Reference | `list_shared_labels` | List shared labels |
| Conversations | `list_conversations` | List with filters (inbox, team, label, **email, domain**) |
| Conversations | `get_conversation` | Get single conversation |
| Messages | `list_messages` | List messages in conversation |
| Messages | `get_message` | Get full message content (with truncation options) |
| Drafts | `list_drafts` | **List drafts in a conversation** |
| Drafts | `create_draft` | Create a draft (not sent) |
| Drafts | `send_message` | Send message immediately (RATE LIMITED) |
| Drafts | `delete_draft` | Delete unsent draft |
| Contacts | `list_contacts` | List contacts with **search** |
| Contacts | `get_contact` | Get single contact |
| Contacts | `create_contact` | Create contact(s) |
| Contacts | `update_contact` | Update contact |
| Management | `create_post` | Add post, close, label, assign, move to team |

**Deferred to post-MVP:**
- Analytics (create/get reports)
- Canned responses (CRUD)
- Tasks (list/get)
- Comments (list)
- Contact groups (list)
- Merge conversations
- Webhooks

## Known Limitations

1. **Attachments:** Claude cannot read attachment file contents - only metadata (filename, size, type)
2. **Draft editing:** No API to update an existing draft - must delete and recreate
3. **Rate limits:** Undocumented by Missive - implemented conservative client-side limits
4. **Pagination:** Returns first page; pass `cursor` to get more results
5. **Email body size:** Large HTML emails truncated by default to prevent context bloat

## Dependencies & Prerequisites

- Node.js 18+
- Missive Productive plan (required for API access)
- Missive API token (from Settings > API)

## References

- [Missive REST API Endpoints](https://missiveapp.com/docs/developers/rest-api/endpoints)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Brainstorm document](../brainstorms/2026-01-29-missive-mcp-server-brainstorm.md)

## Review Findings Addressed

This plan was updated based on multi-agent review. Key changes:

| Finding | Resolution |
|---------|------------|
| Missing search capability | Added `email`, `domain` params to `list_conversations` |
| No `list_drafts` tool | Added `list_drafts` (GET /conversations/:id/drafts) |
| Contact search not exposed | Added `search` param to `list_contacts` |
| No input validation | Added Zod schemas for all tools |
| Token could leak | Added token redaction requirements |
| No rate limiting on sends | Added 10/min, 100/hr limits |
| Email body payloads unbounded | Added body truncation options |
| `create_post` unclear | Expanded description with all capabilities |
| Missing error types | Added `src/errors.ts` with typed errors |
| No reference caching | Added TTL caching for reference data |
