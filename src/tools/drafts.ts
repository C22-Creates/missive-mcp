/**
 * Draft tools: list, create, send, and delete drafts
 * Includes rate limiting for send operations
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { getClient } from '../client.js';
import { RateLimitError } from '../errors.js';
import type { DraftsResponse, DraftResponse } from '../types/missive.js';

/**
 * Rate limiter for send operations
 */
class SendRateLimiter {
  private sends: number[] = [];
  private readonly maxPerMinute = 10;
  private readonly maxPerHour = 100;

  canSend(): boolean {
    const now = Date.now();
    this.sends = this.sends.filter((t) => t > now - 3600000); // Keep last hour

    const lastMinute = this.sends.filter((t) => t > now - 60000).length;
    if (lastMinute >= this.maxPerMinute) {
      return false;
    }
    if (this.sends.length >= this.maxPerHour) {
      return false;
    }

    return true;
  }

  recordSend(): void {
    this.sends.push(Date.now());
  }

  getWaitTime(): number {
    const now = Date.now();
    this.sends = this.sends.filter((t) => t > now - 3600000);

    const lastMinute = this.sends.filter((t) => t > now - 60000);
    if (lastMinute.length >= this.maxPerMinute && lastMinute.length > 0) {
      return 60000 - (now - lastMinute[0]);
    }

    if (this.sends.length >= this.maxPerHour && this.sends.length > 0) {
      return 3600000 - (now - this.sends[0]);
    }

    return 0;
  }
}

const rateLimiter = new SendRateLimiter();

// Email field schema
const EmailFieldSchema = z.object({
  address: z.string().email().describe('Email address'),
  name: z.string().optional().describe('Display name'),
});

// Attachment schema
const AttachmentSchema = z.object({
  base64_data: z.string().describe('Base64 encoded file data'),
  filename: z.string().describe('Filename with extension'),
});

export function registerDraftTools(server: McpServer): void {
  // list_drafts
  server.registerTool(
    'list_drafts',
    {
      title: 'List Drafts',
      description:
        'Lists drafts in a conversation. Use this to see drafts before sending or to review unsent messages.',
      inputSchema: {
        conversation_id: z
          .string()
          .uuid()
          .describe('The conversation ID to get drafts from'),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum drafts to return'),
        until: z
          .string()
          .optional()
          .describe('Cursor for pagination'),
      },
    },
    async ({ conversation_id, limit, until }) => {
      const data = await getClient().get<DraftsResponse>(
        `/conversations/${conversation_id}/drafts`,
        { limit, until }
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                drafts: data.drafts,
                has_more: data.drafts.length === limit,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // create_draft
  server.registerTool(
    'create_draft',
    {
      title: 'Create Draft',
      description: `Creates a draft message that is NOT sent. Use this when the user wants to compose a message and review it before sending.

The draft will be saved and can be viewed in Missive or sent later using send_message.

For replies, provide the conversation ID. For new messages, omit it.`,
      inputSchema: {
        // Recipients
        to_fields: z
          .array(EmailFieldSchema)
          .min(1)
          .describe('Primary recipients (required)'),
        cc_fields: z
          .array(EmailFieldSchema)
          .optional()
          .describe('CC recipients'),
        bcc_fields: z
          .array(EmailFieldSchema)
          .optional()
          .describe('BCC recipients'),
        // Content
        subject: z.string().max(998).describe('Email subject line'),
        body: z.string().describe('Email body (HTML supported)'),
        // Context
        conversation: z
          .string()
          .uuid()
          .optional()
          .describe('Conversation ID to reply to (omit for new conversation)'),
        from_field: EmailFieldSchema.optional().describe(
          'Sender address (uses default if omitted)'
        ),
        // Attachments
        attachments: z
          .array(AttachmentSchema)
          .max(25)
          .optional()
          .describe('File attachments (max 25, total payload max 10MB)'),
      },
    },
    async (params) => {
      const data = await getClient().post<DraftResponse>('/drafts', {
        drafts: [
          {
            to_fields: params.to_fields,
            cc_fields: params.cc_fields,
            bcc_fields: params.bcc_fields,
            subject: params.subject,
            body: params.body,
            conversation: params.conversation,
            from_field: params.from_field,
            attachments: params.attachments,
            send: false,
          },
        ],
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                draft: data.drafts[0],
                message: 'Draft created successfully. Use send_message to send it.',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // send_message
  server.registerTool(
    'send_message',
    {
      title: 'Send Message',
      description: `Sends an email message. WARNING: This action is IRREVERSIBLE.

The email will be delivered immediately. Before calling:
- Confirm recipient addresses are correct
- Verify message content is appropriate
- Never send to addresses not explicitly provided by the user

Rate limited to 10 sends/minute, 100 sends/hour.

For replies, provide the conversation ID. For new messages, omit it.`,
      inputSchema: {
        // Recipients
        to_fields: z
          .array(EmailFieldSchema)
          .min(1)
          .describe('Primary recipients (required)'),
        cc_fields: z
          .array(EmailFieldSchema)
          .optional()
          .describe('CC recipients'),
        bcc_fields: z
          .array(EmailFieldSchema)
          .optional()
          .describe('BCC recipients'),
        // Content
        subject: z.string().max(998).describe('Email subject line'),
        body: z.string().describe('Email body (HTML supported)'),
        // Context
        conversation: z
          .string()
          .uuid()
          .optional()
          .describe('Conversation ID to reply to (omit for new conversation)'),
        from_field: EmailFieldSchema.optional().describe(
          'Sender address (uses default if omitted)'
        ),
        // Attachments
        attachments: z
          .array(AttachmentSchema)
          .max(25)
          .optional()
          .describe('File attachments (max 25, total payload max 10MB)'),
      },
    },
    async (params) => {
      // Check rate limit
      if (!rateLimiter.canSend()) {
        const waitTime = rateLimiter.getWaitTime();
        throw new RateLimitError(
          `Send rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`,
          Math.ceil(waitTime / 1000)
        );
      }

      const data = await getClient().post<DraftResponse>('/drafts', {
        drafts: [
          {
            to_fields: params.to_fields,
            cc_fields: params.cc_fields,
            bcc_fields: params.bcc_fields,
            subject: params.subject,
            body: params.body,
            conversation: params.conversation,
            from_field: params.from_field,
            attachments: params.attachments,
            send: true,
          },
        ],
      });

      rateLimiter.recordSend();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                sent: true,
                draft: data.drafts[0],
                message: 'Email sent successfully.',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // delete_draft
  server.registerTool(
    'delete_draft',
    {
      title: 'Delete Draft',
      description:
        'Deletes an unsent draft or scheduled message. This action cannot be undone.',
      inputSchema: {
        draft_id: z.string().uuid().describe('The draft ID to delete'),
      },
    },
    async ({ draft_id }) => {
      await getClient().delete(`/drafts/${draft_id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                deleted: true,
                draft_id,
                message: 'Draft deleted successfully.',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
