import type { NoteSummary } from '@eisman/shared';
import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { sql } from '@/lib/db/client';
import { addNoteAction } from '@/server/actions/records';

/**
 * Notes attached to clients, partnerships, investors and meetings.
 *
 * Filtered to one record with ?entityType and ?entityId, or the most recent
 * across everything the caller can read.
 */
export const GET = authed<{ items: NoteSummary[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const entityType = params.get('entityType');
  const entityId = params.get('entityId');

  const filters: unknown[] = [scope.companyIds];
  let where = 'n.company_id = any($1) and n.deleted_at is null';
  if (entityType && entityId) {
    filters.push(entityType, entityId);
    where += ` and n.entity_type = $2 and n.entity_id = $3`;
  }
  filters.push(Math.min(Number(params.get('limit') ?? 50), 200));

  const rows = await sql<{
    id: string; title: string; body: string; entity_type: string | null;
    entity_id: string | null; author_name: string | null; created_at: Date; is_demo: boolean;
  }>(
    `select n.id, n.title, n.body, n.entity_type, n.entity_id,
            u.name as author_name, n.created_at, n.is_demo
     from notes n
     left join users u on u.id = n.author_user_id
     where ${where}
     order by n.pinned desc, n.created_at desc
     limit $${filters.length}`,
    filters,
  );

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityLabel: null,
      authorName: r.author_name,
      createdAt: new Date(r.created_at).toISOString(),
      isDemo: r.is_demo,
    })),
  };
});

/**
 * Writes a note against a record.
 *
 * This is the endpoint behind voice-to-text on the phone: the device does the
 * transcription and sends text, so no audio leaves the device and nothing new
 * is stored beyond the note itself.
 */
export const POST = authed(async ({ request }) => {
  const result = await addNoteAction(await jsonBody(request));
  if (!result.ok) throw badRequest(result.error);
  return { id: result.data.id };
});
