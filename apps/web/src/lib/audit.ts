import { sql } from '@/lib/db/client';
import { redact } from '@/lib/crypto';
import type { Actor } from '@/lib/auth/actor';

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical';

export interface AuditInput {
  actor: Pick<Actor, 'user'> | null;
  companyId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  severity?: AuditSeverity;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends an immutable audit record. The table blocks UPDATE and DELETE at the
 * database level, so a record written here cannot later be altered by the
 * application. Sensitive keys are redacted from before/after snapshots.
 */
export async function recordAudit(input: AuditInput) {
  const rows = await sql<{ id: string }>(
    `insert into audit_log
       (company_id, actor_user_id, actor_email, actor_ip, user_agent, action,
        entity_type, entity_id, entity_label, reason, before_value, after_value, severity)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id`,
    [
      input.companyId ?? null,
      input.actor?.user.id ?? null,
      input.actor?.user.email ?? null,
      input.ip ?? null,
      input.userAgent?.slice(0, 500) ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.entityLabel ?? null,
      input.reason ?? null,
      input.before === undefined ? null : JSON.stringify(redact(input.before)),
      input.after === undefined ? null : JSON.stringify(redact(input.after)),
      input.severity ?? 'info',
    ],
  );
  return rows[0]!.id;
}

export interface AuditEntry {
  id: string;
  company_id: string | null;
  company_name: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  reason: string | null;
  before_value: unknown;
  after_value: unknown;
  severity: AuditSeverity;
  created_at: Date;
}

export async function listAudit(opts: {
  companyIds?: string[] | null;
  entityType?: string;
  entityId?: string;
  action?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (opts.companyIds?.length)
    where.push(`(a.company_id = any(${p(opts.companyIds)}) or a.company_id is null)`);
  if (opts.entityType) where.push(`a.entity_type = ${p(opts.entityType)}`);
  if (opts.entityId) where.push(`a.entity_id = ${p(opts.entityId)}`);
  if (opts.action) where.push(`a.action = ${p(opts.action)}`);
  if (opts.search) {
    const needle = p(`%${opts.search}%`);
    where.push(
      `(a.entity_label ilike ${needle} or a.action ilike ${needle} or a.actor_email ilike ${needle})`,
    );
  }

  const limit = Math.min(opts.limit ?? 50, 500);
  const offset = Math.max(opts.offset ?? 0, 0);

  return sql<AuditEntry>(
    `select a.*, u.name as actor_name, c.name as company_name
     from audit_log a
     left join users u on u.id = a.actor_user_id
     left join companies c on c.id = a.company_id
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by a.created_at desc
     limit ${limit} offset ${offset}`,
    params,
  );
}
