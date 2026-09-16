import type { ActivityEntry } from '@eisman/shared';
import { authed } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { listActivity } from '@/lib/activity';

/** Where a record of this kind lives, so a notification can open it. */
const HREF: Record<string, (id: string) => string> = {
  client: (id) => `/crm/clients/${id}`,
  contact: (id) => `/crm/contacts/${id}`,
  organization: (id) => `/crm/organizations/${id}`,
  task: (id) => `/tasks/${id}`,
  meeting: (id) => `/calendar/${id}`,
  document: (id) => `/knowledge/documents/${id}`,
  note: (id) => `/knowledge/notes/${id}`,
  partnership: (id) => `/partnerships/${id}`,
  investor: (id) => `/investors/${id}`,
  member: (id) => `/team/${id}`,
};

/** What changed recently, across the companies the caller can read. */
export const GET = authed<{ items: ActivityEntry[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const rows = await listActivity({
    companyIds: scope.companyIds,
    limit: Math.min(Number(params.get('limit') ?? 25), 100),
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      summary: row.summary,
      action: row.action,
      actorName: row.actor_name,
      companyName: row.company_name,
      entityType: row.entity_type,
      entityId: row.entity_id,
      href: row.entity_id ? (HREF[row.entity_type]?.(row.entity_id) ?? null) : null,
      at: new Date(row.created_at).toISOString(),
      // Activity rows describe a change rather than being a record themselves,
      // so they carry no demo flag of their own.
      isDemo: false,
    })),
  };
});
