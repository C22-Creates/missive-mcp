/**
 * Reference data tools: organizations, teams, users, contact books, shared labels
 * These tools include in-memory caching with TTL
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { getClient } from '../client.js';
import type {
  OrganizationsResponse,
  TeamsResponse,
  UsersResponse,
  ContactBooksResponse,
  SharedLabelsResponse,
} from '../types/missive.js';

// Simple TTL cache
interface CacheEntry<T> {
  data: T;
  expires: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expires: Date.now() + ttlMs });
  }
}

const cache = new Cache();

// Cache TTLs
const TTL_1_HOUR = 60 * 60 * 1000;
const TTL_15_MIN = 15 * 60 * 1000;
const TTL_5_MIN = 5 * 60 * 1000;

export function registerReferenceTools(server: McpServer): void {
  // list_organizations
  server.registerTool(
    'list_organizations',
    {
      title: 'List Organizations',
      description:
        'Lists all organizations the authenticated user belongs to. Organizations are the top-level entity in Missive.',
      inputSchema: {},
    },
    async () => {
      const cacheKey = 'organizations';
      let data = cache.get<OrganizationsResponse>(cacheKey);

      if (!data) {
        data = await getClient().get<OrganizationsResponse>('/organizations');
        cache.set(cacheKey, data, TTL_1_HOUR);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data.organizations, null, 2),
          },
        ],
      };
    }
  );

  // list_teams
  server.registerTool(
    'list_teams',
    {
      title: 'List Teams',
      description:
        'Lists all teams the authenticated user has access to. Filter by organization if needed.',
      inputSchema: {
        organization: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by organization ID'),
        limit: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum number of teams to return'),
        offset: z.number().min(0).default(0).describe('Offset for pagination'),
      },
    },
    async ({ organization, limit, offset }) => {
      const cacheKey = `teams:${organization ?? 'all'}:${limit}:${offset}`;
      let data = cache.get<TeamsResponse>(cacheKey);

      if (!data) {
        data = await getClient().get<TeamsResponse>('/teams', {
          organization,
          limit,
          offset,
        });
        cache.set(cacheKey, data, TTL_15_MIN);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data.teams, null, 2),
          },
        ],
      };
    }
  );

  // list_users
  server.registerTool(
    'list_users',
    {
      title: 'List Users',
      description:
        'Lists all users in organizations the authenticated user belongs to. Use this to find user IDs for assignments.',
      inputSchema: {
        organization: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by organization ID'),
        limit: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum number of users to return'),
        offset: z.number().min(0).default(0).describe('Offset for pagination'),
      },
    },
    async ({ organization, limit, offset }) => {
      const cacheKey = `users:${organization ?? 'all'}:${limit}:${offset}`;
      let data = cache.get<UsersResponse>(cacheKey);

      if (!data) {
        data = await getClient().get<UsersResponse>('/users', {
          organization,
          limit,
          offset,
        });
        cache.set(cacheKey, data, TTL_15_MIN);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data.users, null, 2),
          },
        ],
      };
    }
  );

  // list_contact_books
  server.registerTool(
    'list_contact_books',
    {
      title: 'List Contact Books',
      description:
        'Lists all contact books the authenticated user has access to. Required before creating contacts.',
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum number of contact books to return'),
        offset: z.number().min(0).default(0).describe('Offset for pagination'),
      },
    },
    async ({ limit, offset }) => {
      const cacheKey = `contact_books:${limit}:${offset}`;
      let data = cache.get<ContactBooksResponse>(cacheKey);

      if (!data) {
        data = await getClient().get<ContactBooksResponse>('/contact_books', {
          limit,
          offset,
        });
        cache.set(cacheKey, data, TTL_15_MIN);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data.contact_books, null, 2),
          },
        ],
      };
    }
  );

  // list_shared_labels
  server.registerTool(
    'list_shared_labels',
    {
      title: 'List Shared Labels',
      description:
        'Lists all shared labels available for tagging conversations. Use label IDs to filter conversations or apply labels.',
      inputSchema: {
        organization: z
          .string()
          .uuid()
          .optional()
          .describe('Filter by organization ID'),
        limit: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum number of labels to return'),
        offset: z.number().min(0).default(0).describe('Offset for pagination'),
      },
    },
    async ({ organization, limit, offset }) => {
      const cacheKey = `shared_labels:${organization ?? 'all'}:${limit}:${offset}`;
      let data = cache.get<SharedLabelsResponse>(cacheKey);

      if (!data) {
        data = await getClient().get<SharedLabelsResponse>('/shared_labels', {
          organization,
          limit,
          offset,
        });
        cache.set(cacheKey, data, TTL_5_MIN);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data.shared_labels, null, 2),
          },
        ],
      };
    }
  );
}
