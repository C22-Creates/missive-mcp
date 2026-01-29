/**
 * Conversation tools: list and get conversations with search capabilities
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { getClient } from '../client.js';
import type {
  ConversationsResponse,
  ConversationResponse,
} from '../types/missive.js';

export function registerConversationTools(server: McpServer): void {
  // list_conversations
  server.registerTool(
    'list_conversations',
    {
      title: 'List Conversations',
      description: `Lists conversations visible to the authenticated user. Supports multiple filters and search by email/domain.

Common filter combinations:
- inbox=true: Shows inbox conversations
- assigned=true: Shows assigned conversations
- closed=true: Shows closed conversations
- email="user@example.com": Search by exact email address
- domain="example.com": Search by email domain

Note: email and domain are mutually exclusive.`,
      inputSchema: {
        // Filters
        inbox: z
          .boolean()
          .optional()
          .describe('Filter to inbox conversations'),
        all: z.boolean().optional().describe('Show all conversations'),
        assigned: z
          .boolean()
          .optional()
          .describe('Filter to assigned conversations'),
        closed: z
          .boolean()
          .optional()
          .describe('Filter to closed conversations'),
        snoozed: z
          .boolean()
          .optional()
          .describe('Filter to snoozed conversations'),
        flagged: z
          .boolean()
          .optional()
          .describe('Filter to flagged conversations'),
        trashed: z
          .boolean()
          .optional()
          .describe('Filter to trashed conversations'),
        junked: z
          .boolean()
          .optional()
          .describe('Filter to junked conversations'),
        drafts: z
          .boolean()
          .optional()
          .describe('Filter to conversations with drafts'),
        shared_label: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by shared label ID'),
        team: z.string().uuid().optional().describe('Filter by team ID'),
        team_inbox: z.string().uuid().optional().describe('Filter by team inbox'),
        team_closed: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by team closed'),
        team_all: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by team (all conversations)'),
        organization: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by organization ID'),
        // Search
        email: z
          .string()
          .email()
          .optional()
          .describe('Search by exact email address (mutually exclusive with domain)'),
        domain: z
          .string()
          .optional()
          .describe('Search by email domain (mutually exclusive with email)'),
        // Pagination
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(25)
          .describe('Maximum conversations to return (max 50)'),
        until: z
          .string()
          .optional()
          .describe('Cursor for pagination (last_activity_at timestamp)'),
      },
    },
    async (params) => {
      // Validate mutually exclusive params
      if (params.email && params.domain) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: email and domain parameters are mutually exclusive',
            },
          ],
          isError: true,
        };
      }

      const data = await getClient().get<ConversationsResponse>(
        '/conversations',
        {
          inbox: params.inbox,
          all: params.all,
          assigned: params.assigned,
          closed: params.closed,
          snoozed: params.snoozed,
          flagged: params.flagged,
          trashed: params.trashed,
          junked: params.junked,
          drafts: params.drafts,
          shared_label: params.shared_label,
          team: params.team,
          team_inbox: params.team_inbox,
          team_closed: params.team_closed,
          team_all: params.team_all,
          organization: params.organization,
          email: params.email,
          domain: params.domain,
          limit: params.limit,
          until: params.until,
        }
      );

      const result = {
        conversations: data.conversations,
        has_more: data.conversations.length === params.limit,
        next_cursor:
          data.conversations.length > 0
            ? String(
                data.conversations[data.conversations.length - 1].last_activity_at
              )
            : undefined,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // get_conversation
  server.registerTool(
    'get_conversation',
    {
      title: 'Get Conversation',
      description:
        'Gets a single conversation by ID. Returns conversation details including assignees, labels, and metadata.',
      inputSchema: {
        conversation_id: z
          .string()
          .uuid()
          .describe('The conversation ID to retrieve'),
      },
    },
    async ({ conversation_id }) => {
      const data = await getClient().get<ConversationResponse>(
        `/conversations/${conversation_id}`
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data.conversations[0], null, 2),
          },
        ],
      };
    }
  );
}
