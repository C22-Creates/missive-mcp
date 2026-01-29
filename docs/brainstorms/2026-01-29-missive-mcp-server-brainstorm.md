# Missive MCP Server Brainstorm

**Date:** 2026-01-29
**Status:** Design Complete

## What We're Building

A local MCP server that interfaces with the [Missive API](https://missiveapp.com/docs/developers/) to enable Claude to:
- Read and search conversations and messages
- Compose and send emails/messages
- Manage contacts (full CRUD)
- Handle team collaboration (assignments, labels, teams)

**Primary use cases:** AI email assistant + team collaboration tooling

## Why This Approach

**Flat tool structure** with ~12-15 single-purpose tools:
- Standard MCP pattern, well-supported
- Easy to maintain and extend incrementally
- Claude composes multiple tools naturally for complex workflows
- Clear mapping from tools to API endpoints

**TypeScript/Node.js stack:**
- Best MCP SDK support (official `@modelcontextprotocol/sdk`)
- Abundant examples to reference
- Type safety for API responses

**Environment variable auth:**
- `MISSIVE_API_TOKEN` - standard, secure approach
- Easy to configure in Claude Desktop or CLI

## Proposed Tools (MVP)

### Conversations & Messages (Read)

| Tool | Description | API Endpoint |
|------|-------------|--------------|
| `list_conversations` | List conversations with filters (inbox, assigned, closed, team, label, email/domain) | GET /conversations |
| `get_conversation` | Get a single conversation by ID | GET /conversations/:id |
| `list_messages` | List messages in a conversation | GET /conversations/:id/messages |
| `get_message` | Get full message content by ID | GET /messages/:id |
| `search_conversations` | Search by email address or domain | GET /conversations?email= |

### Drafts & Sending (Write)

| Tool | Description | API Endpoint |
|------|-------------|--------------|
| `create_draft` | Create a draft (can optionally send immediately) | POST /drafts |
| `send_message` | Convenience wrapper for create_draft with send:true | POST /drafts |
| `delete_draft` | Delete a scheduled or unsent draft | DELETE /drafts/:id |

### Contacts (CRUD)

| Tool | Description | API Endpoint |
|------|-------------|--------------|
| `list_contacts` | List contacts in a contact book | GET /contacts |
| `get_contact` | Get a single contact | GET /contacts/:id |
| `create_contact` | Create one or more contacts | POST /contacts |
| `update_contact` | Update contact details | PATCH /contacts/:id |

### Conversation Management

| Tool | Description | API Endpoint |
|------|-------------|--------------|
| `create_post` | Add a post to conversation (recommended for state changes) | POST /conversations/:id/posts |
| `assign_conversation` | Assign users to a conversation (via post) | POST /conversations/:id/posts |

### Reference Data

| Tool | Description | API Endpoint |
|------|-------------|--------------|
| `list_organizations` | List organizations user belongs to | GET /organizations |
| `list_teams` | List teams in an organization | GET /teams |

## Deferred (Post-MVP)

These can be added after the core is working:

- **Analytics:** `create_analytics_report`, `get_analytics_report`
- **Responses:** CRUD for canned responses
- **Tasks:** `list_tasks`, `get_task`
- **Comments:** `list_comments`
- **Contact Groups:** `list_contact_groups`
- **Webhooks:** Configuration and management
- **Merge conversations:** `merge_conversations`

## MCP Resources (Optional)

Resources provide read-only context. Consider adding:

| Resource | URI Pattern | Description |
|----------|-------------|-------------|
| `conversation` | `missive://conversation/{id}` | Full conversation with recent messages |
| `contact` | `missive://contact/{id}` | Contact details |

Resources are lower priority than tools for this use case.

## MCP Prompts (Optional)

Pre-built prompts for common workflows:

| Prompt | Description |
|--------|-------------|
| `summarize_inbox` | Summarize unread/recent conversations |
| `draft_reply` | Draft a reply to a specific conversation |
| `find_emails_from` | Search for all emails from a person/domain |

Prompts are nice-to-have, not essential for MVP.

## Key Decisions

1. **MVP scope:** ~15 tools covering conversations, drafts, contacts, basic management
2. **Flat structure:** One tool per operation, no grouping
3. **TypeScript:** Best SDK support, type safety
4. **Env var auth:** `MISSIVE_API_TOKEN`
5. **Defer analytics, webhooks, responses** to post-MVP

## Open Questions

1. **Rate limiting:** Missive docs don't specify limits - may need to discover through usage
2. **Pagination:** Should tools return all results or support pagination params?
3. **Error handling:** How verbose should error messages be?

## API Reference

- Base URL: `https://public.missiveapp.com/v1/`
- Auth: Bearer token in Authorization header
- Requires: Productive plan subscription
- All responses are JSON
- [Full documentation](https://missiveapp.com/docs/developers/rest-api/endpoints)

## Next Steps

Run `/workflows:plan` to create the implementation plan.
