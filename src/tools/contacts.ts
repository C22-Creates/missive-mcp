/**
 * Contact tools: list, get, create, and update contacts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { getClient } from '../client.js';
import type { ContactsResponse, ContactResponse } from '../types/missive.js';

// Contact info schema
const ContactInfoSchema = z.object({
  type: z
    .enum([
      'email',
      'phone_number',
      'twitter',
      'facebook',
      'url',
      'physical_address',
      'custom',
    ])
    .describe('Type of contact information'),
  value: z.string().describe('The contact info value'),
  label: z.string().optional().describe('Label for this info (e.g., "Work", "Home")'),
});

export function registerContactTools(server: McpServer): void {
  // list_contacts
  server.registerTool(
    'list_contacts',
    {
      title: 'List Contacts',
      description:
        'Lists contacts in a contact book. Use the search parameter to find contacts by name or email.',
      inputSchema: {
        contact_book: z
          .string()
          .uuid()
          .describe('Contact book ID (required - use list_contact_books to find)'),
        search: z
          .string()
          .optional()
          .describe('Search contacts by name or email'),
        limit: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum contacts to return'),
        offset: z.number().min(0).default(0).describe('Offset for pagination'),
      },
    },
    async ({ contact_book, search, limit, offset }) => {
      const data = await getClient().get<ContactsResponse>('/contacts', {
        contact_book,
        search,
        limit,
        offset,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                contacts: data.contacts,
                has_more: data.contacts.length === limit,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // get_contact
  server.registerTool(
    'get_contact',
    {
      title: 'Get Contact',
      description: 'Gets a single contact by ID with all details.',
      inputSchema: {
        contact_id: z.string().uuid().describe('The contact ID to retrieve'),
      },
    },
    async ({ contact_id }) => {
      const data = await getClient().get<ContactResponse>(
        `/contacts/${contact_id}`
      );

      const contact = data.contacts?.[0];
      if (!contact) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Contact not found: ${contact_id}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(contact, null, 2),
          },
        ],
      };
    }
  );

  // create_contact
  server.registerTool(
    'create_contact',
    {
      title: 'Create Contact',
      description: `Creates a new contact in a contact book. At least one name field (first_name or last_name) is required.

Use list_contact_books first to get the contact_book ID.`,
      inputSchema: {
        contact_book: z
          .string()
          .uuid()
          .describe('Contact book ID (required)'),
        first_name: z.string().optional().describe('First name'),
        last_name: z.string().optional().describe('Last name'),
        middle_name: z.string().optional().describe('Middle name'),
        nickname: z.string().optional().describe('Nickname'),
        notes: z.string().optional().describe('Notes about the contact'),
        starred: z.boolean().optional().describe('Star/favorite the contact'),
        infos: z
          .array(ContactInfoSchema)
          .optional()
          .describe('Contact information (emails, phones, etc.)'),
      },
    },
    async (params) => {
      // Validate at least one name is provided
      if (!params.first_name && !params.last_name) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: At least first_name or last_name is required',
            },
          ],
          isError: true,
        };
      }

      const data = await getClient().post<ContactResponse>('/contacts', {
        contacts: [
          {
            contact_book: params.contact_book,
            first_name: params.first_name,
            last_name: params.last_name,
            middle_name: params.middle_name,
            nickname: params.nickname,
            notes: params.notes,
            starred: params.starred,
            infos: params.infos,
          },
        ],
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                contact: data.contacts[0],
                message: 'Contact created successfully.',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // update_contact
  server.registerTool(
    'update_contact',
    {
      title: 'Update Contact',
      description: `Updates an existing contact. Only provided fields will be updated.

WARNING: When updating infos array, you must include ALL items you want to keep.
Missing items will be deleted.`,
      inputSchema: {
        contact_id: z.string().uuid().describe('The contact ID to update'),
        first_name: z.string().optional().describe('First name'),
        last_name: z.string().optional().describe('Last name'),
        middle_name: z.string().optional().describe('Middle name'),
        nickname: z.string().optional().describe('Nickname'),
        notes: z.string().optional().describe('Notes about the contact'),
        starred: z.boolean().optional().describe('Star/favorite the contact'),
        infos: z
          .array(ContactInfoSchema)
          .optional()
          .describe(
            'Contact information - must include ALL items to keep (missing items deleted)'
          ),
      },
    },
    async ({ contact_id, ...updates }) => {
      const data = await getClient().patch<ContactResponse>(
        `/contacts/${contact_id}`,
        updates
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                contact: data.contacts[0],
                message: 'Contact updated successfully.',
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
