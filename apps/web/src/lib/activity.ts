import { sql } from '@/lib/db/client';
import type { Actor } from '@/lib/auth/actor';

export interface ActivityInput {
  actor?: Pick<Actor, 'user'> | null;
  companyId: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
  isDemo?: boolean;
}

/**
 * The human-readable "what happened" timeline shown on records and on the
 * dashboard. Distinct from the audit log, which is the tamper-evident
 * compliance record for sensitive operations.
 */
export async function recordActivity(input: ActivityInput) {
  await sql(
    `insert into activity_log
       (company_id, actor_user_id, entity_type, entity_id, action, summary, meta, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.companyId,
      input.actor?.user.id ?? null,
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.summary,
      JSON.stringify(input.meta ?? {}),
      input.isDemo ?? false,
    ],
  );
}

export interface ActivityEntry {
  id: string;
  company_id: string | null;
  company_name: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  meta: Record<string, unknown>;
  created_at: Date;
}

export async function listActivity(opts: {
  companyIds?: string[] | null;
  entityType?: string;
  entityId?: string;
  limit?: number;
}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.companyIds?.length) {
    params.push(opts.companyIds);
    where.push(`(a.company_id = any($${params.length}) or a.company_id is null)`);
  }
  if (opts.entityType) {
    params.push(opts.entityType);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (opts.entityId) {
    params.push(opts.entityId);
    where.push(`a.entity_id = $${params.length}`);
  }
  const limit = Math.min(opts.limit ?? 25, 200);
  return sql<ActivityEntry>(
    `select a.*, u.name as actor_name, c.name as company_name
     from activity_log a
     left join users u on u.id = a.actor_user_id
     left join companies c on c.id = a.company_id
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by a.created_at desc
     limit ${limit}`,
    params,
  );
}
