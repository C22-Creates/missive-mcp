# Missive MCP Server

An MCP (Model Context Protocol) server that interfaces with the [Missive API](https://missiveapp.com/docs/developers/rest-api/endpoints), enabling Claude to manage email conversations, contacts, and team collaboration.

## Prerequisites

- Node.js 18+
- Missive account with **Productive plan** (required for API access)
- Missive API token

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the `MISSIVE_API_TOKEN` environment variable:

```bash
export MISSIVE_API_TOKEN="your_api_token_here"
```

To get your API token:
1. Open Missive
2. Go to Settings > API
3. Click "Create a new token"

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "missive": {
      "command": "node",
      "args": ["/path/to/missive-mcp/dist/index.js"],
      "env": {
        "MISSIVE_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

## Tools

### Reference Data

| Tool | Description |
|------|-------------|
| `list_organizations` | List organizations you belong to |
| `list_teams` | List teams (for assignments) |
| `list_users` | List users (for assignments) |
| `list_contact_books` | List contact books (required before creating contacts) |
| `list_shared_labels` | List labels (for filtering and tagging) |

### Conversations

| Tool | Description |
|------|-------------|
| `list_conversations` | List conversations with filters (inbox, assigned, closed, team, label, email, domain) |
| `get_conversation` | Get a single conversation by ID |

### Messages

| Tool | Description |
|------|-------------|
| `list_messages` | List messages in a conversation |
| `get_message` | Get full message content (with body truncation options) |

### Drafts

| Tool | Description |
|------|-------------|
| `list_drafts` | List drafts in a conversation |
| `create_draft` | Create a draft (not sent) |
| `send_message` | Send a message immediately (rate limited) |
| `delete_draft` | Delete an unsent draft |

### Contacts

| Tool | Description |
|------|-------------|
| `list_contacts` | List contacts in a book (with search) |
| `get_contact` | Get a single contact |
| `create_contact` | Create a new contact |
| `update_contact` | Update an existing contact |

### Management

| Tool | Description |
|------|-------------|
| `create_post` | Add a post to a conversation; close, label, assign, or move to team |

## Examples

### Read inbox
```
Use list_conversations with inbox=true to see recent conversations.
```

### Reply to an email
```
1. Use list_conversations to find the conversation
2. Use list_messages to see the thread
3. Use send_message with the conversation ID to reply
```

### Search for emails from a domain
```
Use list_conversations with domain="example.com"
```

### Assign a conversation
```
1. Use list_users to find the user ID
2. Use list_organizations to get the org ID
3. Use create_post with add_assignees=[user_id]
```

## Rate Limits

- `send_message`: 10 per minute, 100 per hour (client-enforced)
- Missive API rate limits are undocumented; the client handles 429 responses

## Security

- API token is validated on startup
- Token is never logged or included in error messages
- Email body content is never logged
- Input validation on all tool parameters

## License

MIT
