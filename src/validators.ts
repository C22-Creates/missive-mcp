/**
 * UUID validators against the authenticated token's accessible resources.
 *
 * Why: the bot (and any model-driven caller) can fabricate plausible-looking
 * UUIDs that aren't real in the connected Missive token. The Missive API
 * accepts them silently and the resulting create_post call destroys the
 * underlying conversation. This module catches that before the API call.
 *
 * Approach: lazy in-memory cache per authenticated user, refreshed every
 * 30 minutes. On unknown ID we throw with the actual valid values so the
 * agent gets immediate, actionable feedback instead of fake success.
 */

import type { ClientResolver } from './types/tools.js';
import type {
  OrganizationsResponse,
  TeamsResponse,
  UsersResponse,
  SharedLabelsResponse,
} from './types/missive.js';

type ExtraArg = Parameters<ClientResolver>[0];

interface IdSets {
  orgs: Set<string>;
  users: Set<string>;
  teams: Set<string>;
  labels: Set<string>;
  labelNames: Map<string, string>;
  expires: number;
}

const cacheByUser = new Map<string, IdSets>();
const VALIDATOR_TTL_MS = 30 * 60 * 1000;

function userKey(extra: ExtraArg): string {
  const authExtra = (extra.authInfo as unknown as { extra?: Record<string, unknown> } | undefined)?.extra;
  return (authExtra?.userId as string) || 'default';
}

async function loadIdSets(extra: ExtraArg, getClient: ClientResolver): Promise<IdSets> {
  const key = userKey(extra);
  const cached = cacheByUser.get(key);
  if (cached && cached.expires > Date.now()) return cached;

  const client = getClient(extra);
  const [orgs, users, teams, labels] = await Promise.all([
    client.get<OrganizationsResponse>('/organizations'),
    client.get<UsersResponse>('/users', { limit: 200 }),
    client.get<TeamsResponse>('/teams', { limit: 200 }),
    client.get<SharedLabelsResponse>('/shared_labels', { limit: 200 }),
  ]);

  const labelNames = new Map<string, string>();
  for (const label of labels.shared_labels) {
    labelNames.set(label.id, label.name ?? '(unnamed)');
  }

  const sets: IdSets = {
    orgs: new Set(orgs.organizations.map((o) => o.id)),
    users: new Set(users.users.map((u) => u.id)),
    teams: new Set(teams.teams.map((t) => t.id)),
    labels: new Set(labels.shared_labels.map((l) => l.id)),
    labelNames,
    expires: Date.now() + VALIDATOR_TTL_MS,
  };
  cacheByUser.set(key, sets);
  return sets;
}

export interface ValidatableIds {
  organization?: string;
  team?: string;
  add_assignees?: string[];
  add_shared_labels?: string[];
  remove_shared_labels?: string[];
}

/**
 * Validate every UUID-bearing field on a Missive write call against the
 * authenticated token's actual resources. Throws a single combined error
 * listing every miss with the valid alternatives, so the caller gets one
 * round-trip of feedback rather than N retries.
 */
export async function validateIds(
  extra: ExtraArg,
  getClient: ClientResolver,
  params: ValidatableIds
): Promise<void> {
  const hasAnything =
    Boolean(params.organization) ||
    Boolean(params.team) ||
    (params.add_assignees && params.add_assignees.length > 0) ||
    (params.add_shared_labels && params.add_shared_labels.length > 0) ||
    (params.remove_shared_labels && params.remove_shared_labels.length > 0);
  if (!hasAnything) return;

  const sets = await loadIdSets(extra, getClient);
  const errors: string[] = [];

  if (params.organization && !sets.orgs.has(params.organization)) {
    errors.push(
      `organization "${params.organization}" is not in the authenticated user's organizations. Valid: [${Array.from(sets.orgs).join(', ')}]`
    );
  }
  if (params.team && !sets.teams.has(params.team)) {
    errors.push(
      `team "${params.team}" is not in the authenticated user's accessible teams. Valid: [${Array.from(sets.teams).join(', ')}]`
    );
  }
  for (const id of params.add_assignees ?? []) {
    if (!sets.users.has(id)) {
      errors.push(
        `assignee "${id}" is not in the authenticated user's accessible users. Valid: [${Array.from(sets.users).join(', ')}]`
      );
    }
  }
  for (const id of params.add_shared_labels ?? []) {
    if (!sets.labels.has(id)) {
      const known = Array.from(sets.labels)
        .map((lid) => `${lid} (${sets.labelNames.get(lid)})`)
        .join(', ');
      errors.push(
        `add_shared_labels "${id}" is not a real label in this organization. Valid: [${known}]`
      );
    }
  }
  for (const id of params.remove_shared_labels ?? []) {
    if (!sets.labels.has(id)) {
      errors.push(
        `remove_shared_labels "${id}" is not a real label in this organization.`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Missive ID validation failed (call rejected before reaching the API to prevent silent draft loss):\n - ${errors.join('\n - ')}`
    );
  }
}

export function _resetValidatorCacheForTests(): void {
  cacheByUser.clear();
}
