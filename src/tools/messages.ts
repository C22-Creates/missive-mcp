/**
 * Message tools: list and get messages with body truncation options
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { getClient } from '../client.js';
import type {
  MessagesResponse,
  MessageResponse,
  PostsResponse,
  CommentsResponse,
} from '../types/missive.js';

/**
 * Strip HTML tags and normalize whitespace
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Process message body based on format options
 */
function processBody(
  body: string | undefined,
  format: 'full' | 'truncated' | 'preview',
  stripHtmlFlag: boolean,
  maxLength: number
): string {
  if (!body) return '';

  let processed = stripHtmlFlag ? stripHtml(body) : body;

  if (format === 'preview') {
    return processed.substring(0, 500) + (processed.length > 500 ? '...' : '');
  }

  if (format === 'truncated' && processed.length > maxLength) {
    return (
      processed.substring(0, maxLength) +
      `\n\n[... truncated, ${processed.length - maxLength} more characters]`
    );
  }

  return processed;
}

export function registerMessageTools(server: McpServer): void {
  // list_messages
  server.registerTool(
    'list_messages',
    {
      title: 'List Messages',
      description:
        'Lists messages in a conversation. Returns messages ordered from newest to oldest. Use limit and until for pagination.',
      inputSchema: {
        conversation_id: z
          .string()
          .uuid()
          .describe('The conversation ID to get messages from'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum messages to return (max 50)'),
        until: z
          .string()
          .optional()
          .describe('Cursor for pagination (message delivered_at timestamp)'),
      },
    },
    async ({ conversation_id, limit, until }) => {
      const data = await getClient().get<MessagesResponse>(
        `/conversations/${conversation_id}/messages`,
        { limit, until }
      );

      const result = {
        messages: data.messages.map((m) => ({
          id: m.id,
          subject: m.subject,
          preview: m.preview,
          from_field: m.from_field,
          to_fields: m.to_fields,
          delivered_at: m.delivered_at,
          attachments: m.attachments?.map((a) => ({
            id: a.id,
            filename: a.filename,
            size: a.size,
            content_type: a.content_type,
          })),
        })),
        has_more: data.messages.length === limit,
        next_cursor:
          data.messages.length > 0
            ? String(data.messages[data.messages.length - 1].delivered_at)
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

  // get_message
  server.registerTool(
    'get_message',
    {
      title: 'Get Message',
      description: `Gets a single message by ID with full body content. Supports body processing options to manage size.

Body format options:
- full: Returns complete body (may be large for HTML emails)
- truncated: Truncates body to max_body_length (default)
- preview: Returns first 500 characters only

Use strip_html=true (default) to convert HTML to plain text.`,
      inputSchema: {
        message_id: z.string().uuid().describe('The message ID to retrieve'),
        body_format: z
          .enum(['full', 'truncated', 'preview'])
          .default('truncated')
          .describe('How to process the message body'),
        strip_html: z
          .boolean()
          .default(true)
          .describe('Convert HTML body to plain text'),
        max_body_length: z
          .number()
          .min(100)
          .max(50000)
          .default(5000)
          .describe('Maximum body length for truncated format'),
      },
    },
    async ({ message_id, body_format, strip_html, max_body_length }) => {
      const data = await getClient().get<MessageResponse>(
        `/messages/${message_id}`
      );

      const message = data.messages[0];
      const processedBody = processBody(
        message.body,
        body_format,
        strip_html,
        max_body_length
      );

      const result = {
        id: message.id,
        subject: message.subject,
        body: processedBody,
        from_field: message.from_field,
        to_fields: message.to_fields,
        cc_fields: message.cc_fields,
        delivered_at: message.delivered_at,
        attachments: message.attachments?.map((a) => ({
          id: a.id,
          filename: a.filename,
          size: a.size,
          content_type: a.content_type,
        })),
        conversation: message.conversation,
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

  // list_posts
  server.registerTool(
    'list_posts',
    {
      title: 'List Posts',
      description: `Lists posts in a conversation. Posts are internal notes and state changes (close, assign, label) made by team members.

IMPORTANT: Always check posts in addition to messages - team comments and activity won't appear in messages.

Posts include:
- Internal notes/comments from team members
- State change notifications (closed, assigned, labeled)
- Integration notifications

Returns posts ordered from newest to oldest.`,
      inputSchema: {
        conversation_id: z
          .string()
          .uuid()
          .describe('The conversation ID to get posts from'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum posts to return'),
        until: z
          .string()
          .optional()
          .describe('Cursor for pagination (post created_at timestamp)'),
      },
    },
    async ({ conversation_id, limit, until }) => {
      const data = await getClient().get<PostsResponse>(
        `/conversations/${conversation_id}/posts`,
        { limit, until }
      );

      const result = {
        posts: data.posts.map((p) => ({
          id: p.id,
          text: p.text,
          author: p.author,
          created_at: p.created_at,
          notification: p.notification,
          attachments: p.attachments?.map((a) => ({
            id: a.id,
            filename: a.filename,
            size: a.size,
            content_type: a.content_type,
          })),
        })),
        has_more: data.posts.length === limit,
        next_cursor:
          data.posts.length > 0
            ? String(data.posts[data.posts.length - 1].created_at)
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

  // list_comments
  server.registerTool(
    'list_comments',
    {
      title: 'List Comments',
      description: `Lists comments in a conversation. Comments are team discussions that appear in the sidebar.

IMPORTANT: Always check comments in addition to messages - team discussions won't appear in messages.

Comments may include:
- Team member discussions
- @mentions of other users
- Attached files
- Associated tasks

Returns comments ordered from newest to oldest.`,
      inputSchema: {
        conversation_id: z
          .string()
          .uuid()
          .describe('The conversation ID to get comments from'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum comments to return'),
        until: z
          .string()
          .optional()
          .describe('Cursor for pagination (comment created_at timestamp)'),
      },
    },
    async ({ conversation_id, limit, until }) => {
      const data = await getClient().get<CommentsResponse>(
        `/conversations/${conversation_id}/comments`,
        { limit, until }
      );

      const result = {
        comments: data.comments.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author,
          created_at: c.created_at,
          mentions: c.mentions,
          task: c.task,
          attachments: c.attachments?.map((a) => ({
            id: a.id,
            filename: a.filename,
            size: a.size,
            content_type: a.content_type,
          })),
        })),
        has_more: data.comments.length === limit,
        next_cursor:
          data.comments.length > 0
            ? String(data.comments[data.comments.length - 1].created_at)
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
}
