/**
 * Conversation management tools: create posts, close, label, assign
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ClientResolver } from '../types/tools.js';
import type { PostResponse } from '../types/missive.js';

export function registerManagementTools(server: McpServer, getClient: ClientResolver): void {
  // create_post
  server.registerTool(
    'create_post',
    {
      title: 'Create Post',
      description: `Adds a post to a conversation and optionally changes its state.

This tool can:
- Close a conversation: set close=true
- Add labels: set add_shared_labels=[label_ids]
- Remove labels: set remove_shared_labels=[label_ids]
- Assign users: set add_assignees=[user_ids]
- Move to team: set team=team_id (use force_team=true to override existing team)
- Add a visible note: set text="your message"

Posts leave a visible trace showing what triggered the action.

Required: conversation and organization IDs.
Use list_organizations to get org ID, list_users for user IDs, list_shared_labels for label IDs.`,
      inputSchema: {
        // Required
        conversation: z
          .string()
          .uuid()
          .describe('Conversation ID (required)'),
        organization: z
          .string()
          .uuid()
          .describe('Organization ID (required)'),

        // State changes
        close: z
          .boolean()
          .optional()
          .describe('Set to true to close the conversation'),
        add_shared_labels: z
          .array(z.string().uuid())
          .optional()
          .describe('Label IDs to add to the conversation'),
        remove_shared_labels: z
          .array(z.string().uuid())
          .optional()
          .describe('Label IDs to remove from the conversation'),
        add_assignees: z
          .array(z.string().uuid())
          .optional()
          .describe('User IDs to assign to the conversation'),
        team: z
          .string()
          .uuid()
          .optional()
          .describe('Team ID to move conversation to'),
        force_team: z
          .boolean()
          .optional()
          .describe('Force team change even if already in another team'),

        // Content
        text: z
          .string()
          .optional()
          .describe('Post body text (visible in conversation)'),
        notification: z
          .object({
            title: z.string().describe('Notification title'),
            body: z.string().describe('Notification body'),
          })
          .optional()
          .describe('Optional notification to display'),
      },
    },
    async (params, extra) => {
      const data = await getClient(extra).post<PostResponse>('/posts', {
        posts: [
          {
            conversation: params.conversation,
            organization: params.organization,
            close: params.close,
            add_shared_labels: params.add_shared_labels,
            remove_shared_labels: params.remove_shared_labels,
            add_assignees: params.add_assignees,
            team: params.team,
            force_team: params.force_team,
            text: params.text,
            notification: params.notification,
          },
        ],
      });

      const actions: string[] = [];
      if (params.close) actions.push('closed');
      if (params.add_shared_labels?.length)
        actions.push(`added ${params.add_shared_labels.length} label(s)`);
      if (params.remove_shared_labels?.length)
        actions.push(`removed ${params.remove_shared_labels.length} label(s)`);
      if (params.add_assignees?.length)
        actions.push(`assigned ${params.add_assignees.length} user(s)`);
      if (params.team) actions.push('moved to team');
      if (params.text) actions.push('added note');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                post: data.posts[0],
                actions_performed: actions.length > 0 ? actions : ['created post'],
                message: 'Post created successfully.',
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
