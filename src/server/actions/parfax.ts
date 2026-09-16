'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { objectsToCsv } from '@/lib/csv/client';
import type { ActionResult } from '@/lib/validation/schemas';
import { parfaxMetricSchema } from '@/lib/validation/parfax';
import { rethrowControlFlow } from '@/lib/action-errors';

/**
 * ParFax administration.
 *
 * Two rules run through everything here:
 *  1. Nothing silently changes a business metric. Every administrative change
 *     records the original value, the new value, the reason and the operator
 *     in the append-only audit log.
 *  2. Money is never edited in this system. Plan and billing changes must be
 *     made in the billing provider; this app refuses to fake them.
 */

function fail(err: unknown): ActionResult<never> {
  rethrowControlFlow(err);
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to administer ParFax users.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireParfaxAdmin() {
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:user_admin', parfax.id)) {
    throw new ForbiddenError('parfax:user_admin', parfax?.id ?? null);
  }
  return { actor, companyId: parfax.id };
}

async function requireMetricsAdmin() {
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:metrics_admin', parfax.id)) {
    throw new ForbiddenError('parfax:metrics_admin', parfax?.id ?? null);
  }
  return { actor, companyId: parfax.id };
}

const suspendSchema = z.object({
  userId: z.string().uuid(),
  suspend: z.boolean(),
  reason: z.string().trim().min(10, 'Explain why — this is recorded permanently.'),
});

export async function setParfaxUserStatusAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = suspendSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { userId, suspend, reason } = parsed.data;
    const { actor, companyId } = await requireParfaxAdmin();

    const before = await one<{ email: string; status: string; source: string }>(
      `select email, status, source from parfax_users where id = $1 and deleted_at is null`,
      [userId],
    );
    if (!before) return { ok: false, error: 'User not found.' };

    const status = suspend ? 'suspended' : 'active';
    await sql(`update parfax_users set status = $2 where id = $1`, [userId, status]);

    await recordAudit({
      actor, companyId, action: suspend ? 'parfax_user.suspended' : 'parfax_user.reactivated',
      entityType: 'parfax_user', entityId: userId, entityLabel: before.email,
      reason, severity: 'critical',
      before: { status: before.status }, after: { status },
    });
    await recordActivity({
      actor, companyId, entityType: 'parfax_user', entityId: userId,
      action: suspend ? 'suspended' : 'reactivated',
      summary: `${suspend ? 'Suspended' : 'Reactivated'} ${before.email}`, meta: { reason },
    });

    const warning =
      before.source === 'parfax_crm'
        ? 'This account is mirrored from the ParFax CRM. The change is recorded here, but it will not reach production until write-back is enabled for that connection.'
        : null;
    revalidatePath('/parfax/users');
    return warning
      ? { ok: false, error: `Status updated locally. ${warning}` }
      : { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const promoSchema = z.object({
  userId: z.string().uuid(),
  promoAccess: z.string().trim().max(120).nullable(),
  expiresAt: z.string().optional(),
  reason: z.string().trim().min(10, 'Explain why this promotional access is being granted.'),
});

/**
 * Grants promotional access. This is an entitlement flag owned by this system —
 * it deliberately does not touch `plan`, because the billing provider owns that
 * and a display-only change would corrupt revenue reporting.
 */
export async function grantPromoAccessAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = promoSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { userId, promoAccess, expiresAt, reason } = parsed.data;
    const { actor, companyId } = await requireParfaxAdmin();

    const before = await one<{ email: string; promo_access: string | null; promo_expires_at: Date | null; plan: string }>(
      `select email, promo_access, promo_expires_at, plan from parfax_users where id = $1 and deleted_at is null`,
      [userId],
    );
    if (!before) return { ok: false, error: 'User not found.' };

    const expires = expiresAt ? new Date(expiresAt) : null;
    if (expires && Number.isNaN(expires.getTime())) {
      return { ok: false, error: 'Enter a valid expiry date.' };
    }

    await sql(`update parfax_users set promo_access = $2, promo_expires_at = $3 where id = $1`, [
      userId, promoAccess, expires,
    ]);
    await recordAudit({
      actor, companyId, action: promoAccess ? 'parfax_user.promo_granted' : 'parfax_user.promo_revoked',
      entityType: 'parfax_user', entityId: userId, entityLabel: before.email,
      reason, severity: 'critical',
      before: { promo_access: before.promo_access, promo_expires_at: before.promo_expires_at, plan: before.plan },
      after: { promo_access: promoAccess, promo_expires_at: expires, plan: before.plan },
    });
    await recordActivity({
      actor, companyId, entityType: 'parfax_user', entityId: userId,
      action: 'promo_changed',
      summary: promoAccess
        ? `Granted promotional access (${promoAccess}) to ${before.email}`
        : `Revoked promotional access for ${before.email}`,
      meta: { reason },
    });
    revalidatePath('/parfax/users');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const correctionSchema = z.object({
  userId: z.string().uuid(),
  field: z.enum(['name', 'handle', 'email', 'country', 'region', 'acquisition_source']),
  value: z.string().trim().max(200),
  reason: z.string().trim().min(10, 'Explain the correction.'),
});

/** Corrects a narrowly defined set of administrative fields. Never plan or LTV. */
export async function correctParfaxUserFieldAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = correctionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { userId, field, value, reason } = parsed.data;
    const { actor, companyId } = await requireParfaxAdmin();

    const before = await one<Record<string, string | null>>(
      `select email, name, handle, country, region, acquisition_source
       from parfax_users where id = $1 and deleted_at is null`,
      [userId],
    );
    if (!before) return { ok: false, error: 'User not found.' };

    if (field === 'email') {
      const clash = await one<{ id: string }>(
        `select id from parfax_users where lower(email) = lower($1) and id <> $2 and deleted_at is null`,
        [value, userId],
      );
      if (clash) return { ok: false, error: 'Another ParFax account already uses that email.' };
    }

    // `field` comes from a fixed enum, so this identifier cannot be injected.
    await sql(`update parfax_users set ${field} = $2 where id = $1`, [userId, value || null]);

    await recordAudit({
      actor, companyId, action: 'parfax_user.field_corrected',
      entityType: 'parfax_user', entityId: userId, entityLabel: before.email ?? userId,
      reason, severity: 'warning',
      before: { [field]: before[field] }, after: { [field]: value || null },
    });
    revalidatePath(`/parfax/users/${userId}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const mergeSchema = z.object({
  keepId: z.string().uuid(),
  mergeId: z.string().uuid(),
  reason: z.string().trim().min(10, 'Explain why these are the same person.'),
});

/**
 * Resolves a duplicate by pointing the duplicate at the surviving record and
 * moving its scans, subscriptions, issues and notes across. The duplicate is
 * kept (marked merged) rather than deleted, so the decision is reversible and
 * the original identifiers are preserved.
 */
export async function mergeParfaxUsersAction(input: unknown): Promise<ActionResult<{ moved: number }>> {
  try {
    const parsed = mergeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { keepId, mergeId, reason } = parsed.data;
    if (keepId === mergeId) return { ok: false, error: 'Choose two different accounts.' };
    const { actor, companyId } = await requireParfaxAdmin();

    const [keep, merge] = await Promise.all([
      one<{ email: string }>(`select email from parfax_users where id = $1 and deleted_at is null`, [keepId]),
      one<{ email: string; merged_into_id: string | null }>(
        `select email, merged_into_id from parfax_users where id = $1 and deleted_at is null`, [mergeId],
      ),
    ]);
    if (!keep || !merge) return { ok: false, error: 'One of those accounts no longer exists.' };
    if (merge.merged_into_id) return { ok: false, error: 'That account has already been merged.' };

    const moved = { scans: 0, subscriptions: 0, issues: 0, marketplace: 0, notes: 0 };
    const count = async (text: string) => {
      const rows = await sql<{ count: number }>(text, [keepId, mergeId]);
      return rows[0]?.count ?? 0;
    };
    moved.scans = await count(
      `with m as (update parfax_scans set parfax_user_id = $1 where parfax_user_id = $2 returning 1)
       select count(*)::int as count from m`,
    );
    moved.subscriptions = await count(
      `with m as (update subscriptions set parfax_user_id = $1 where parfax_user_id = $2 returning 1)
       select count(*)::int as count from m`,
    );
    moved.issues = await count(
      `with m as (update parfax_support_issues set parfax_user_id = $1 where parfax_user_id = $2 returning 1)
       select count(*)::int as count from m`,
    );
    moved.marketplace = await count(
      `with m as (update parfax_marketplace_events set parfax_user_id = $1 where parfax_user_id = $2 returning 1)
       select count(*)::int as count from m`,
    );
    moved.notes = await count(
      `with m as (update notes set entity_id = $1
                  where entity_type = 'parfax_user' and entity_id = $2 returning 1)
       select count(*)::int as count from m`,
    );

    await sql(`update parfax_users set merged_into_id = $2, status = 'deleted' where id = $1`, [
      mergeId, keepId,
    ]);

    const total = Object.values(moved).reduce((a, b) => a + b, 0);
    await recordAudit({
      actor, companyId, action: 'parfax_user.merged',
      entityType: 'parfax_user', entityId: mergeId, entityLabel: merge.email,
      reason, severity: 'critical',
      before: { email: merge.email, merged_into_id: null, status: 'active' },
      after: { merged_into_id: keepId, kept_email: keep.email, moved },
    });
    await recordActivity({
      actor, companyId, entityType: 'parfax_user', entityId: keepId,
      action: 'merged', summary: `Merged ${merge.email} into ${keep.email}`, meta: { reason, moved },
    });
    revalidatePath('/parfax/users');
    return { ok: true, data: { moved: total } };
  } catch (err) {
    return fail(err);
  }
}

const issueSchema = z.object({
  parfaxUserId: z.string().uuid().optional(),
  subject: z.string().trim().min(4, 'Describe the issue').max(300),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  category: z.string().trim().max(60).optional(),
});

export async function recordSupportIssueAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = issueSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const data = parsed.data;
    const { actor, companyId } = await requireParfaxAdmin();
    const row = await one<{ id: string }>(
      `insert into parfax_support_issues
         (parfax_user_id, subject, description, priority, category, assigned_user_id)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [
        data.parfaxUserId ?? null, data.subject, data.description ?? null,
        data.priority, data.category ?? null, actor.user.id,
      ],
    );
    await recordActivity({
      actor, companyId, entityType: 'parfax_support_issue', entityId: row!.id,
      action: 'created', summary: `Logged a support issue: ${data.subject}`,
    });
    revalidatePath('/parfax/support');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function setSupportIssueStatusAction(
  id: string,
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed',
): Promise<ActionResult<null>> {
  try {
    const { actor, companyId } = await requireParfaxAdmin();
    await sql(
      `update parfax_support_issues set status = $2,
         resolved_at = case when $2 in ('resolved','closed') then now() else null end
       where id = $1`,
      [id, status],
    );
    await recordActivity({
      actor, companyId, entityType: 'parfax_support_issue', entityId: id,
      action: 'status_changed', summary: `Support issue moved to ${status.replace('_', ' ')}`,
    });
    revalidatePath('/parfax/support');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}


/**
 * Records a target, forecast or manual historical figure.
 *
 * `raw` and `calculated` are deliberately not accepted: those kinds are
 * reserved for values derived from production data, and letting an operator
 * write one by hand is exactly the silent metric manipulation this system
 * is built to prevent.
 */
export async function upsertParfaxMetricAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = parfaxMetricSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const data = parsed.data;
    const { actor, companyId } = await requireMetricsAdmin();

    const before = await one<{ id: string; value: number }>(
      `select id, value from parfax_metrics
       where metric_key = $1 and period_start = $2 and period_end = $3 and kind = $4`,
      [data.metricKey, data.periodStart, data.periodEnd, data.kind],
    );

    const row = await one<{ id: string }>(
      `insert into parfax_metrics
         (metric_key, period_start, period_end, value, unit, kind, source_label, note, created_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (metric_key, period_start, period_end, kind) do update
         set value = excluded.value, unit = excluded.unit, source_label = excluded.source_label,
             note = excluded.note, updated_at = now()
       returning id`,
      [
        data.metricKey, data.periodStart, data.periodEnd, data.value, data.unit ?? null,
        data.kind, data.sourceLabel, data.note ?? null, actor.user.id,
      ],
    );

    await recordAudit({
      actor, companyId, action: 'parfax_metric.recorded',
      entityType: 'parfax_metric', entityId: row!.id,
      entityLabel: `${data.metricKey} (${data.kind})`,
      reason: data.sourceLabel, severity: 'notice',
      before: before ? { value: before.value } : undefined,
      after: { value: data.value, kind: data.kind, source: data.sourceLabel },
    });
    revalidatePath('/parfax/metrics');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function addMetricAnnotationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = z
      .object({
        metricKey: z.string().trim().max(60).optional(),
        occurredOn: z.string().min(1, 'Choose a date'),
        title: z.string().trim().min(3, 'Give the annotation a title').max(200),
        body: z.string().trim().max(2000).optional(),
      })
      .safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { actor } = await requireMetricsAdmin();
    const row = await one<{ id: string }>(
      `insert into parfax_annotations (metric_key, occurred_on, title, body, created_by_id)
       values ($1,$2,$3,$4,$5) returning id`,
      [
        parsed.data.metricKey ?? null, parsed.data.occurredOn, parsed.data.title,
        parsed.data.body ?? null, actor.user.id,
      ],
    );
    revalidatePath('/parfax/metrics');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Exports the permitted subset of user data. Deliberately excludes anything
 * that is not needed for operations, and the export itself is audited.
 */
export async function exportParfaxUsersAction(reason: string): Promise<ActionResult<{ csv: string; rows: number }>> {
  try {
    if (reason.trim().length < 10) {
      return { ok: false, error: 'Explain why this export is needed — exports are audited.' };
    }
    const { actor, companyId } = await requireParfaxAdmin();
    if (!actor.can('export:run', companyId)) {
      return { ok: false, error: 'You do not have permission to export data.' };
    }
    const rows = await sql<Record<string, unknown>>(
      `select u.external_id, u.email, u.name, u.handle, u.plan, u.status,
              u.signup_at, u.last_active_at, u.country, u.region, u.acquisition_source,
              u.promo_access,
              (select count(*)::int from parfax_scans s where s.parfax_user_id = u.id) as scan_count
       from parfax_users u where u.deleted_at is null order by u.signup_at desc`,
    );
    await recordAudit({
      actor, companyId, action: 'parfax_users.exported',
      entityType: 'parfax_user', entityLabel: `${rows.length} accounts`,
      reason, severity: 'critical', after: { rows: rows.length },
    });
    return { ok: true, data: { csv: objectsToCsv(rows), rows: rows.length } };
  } catch (err) {
    return fail(err);
  }
}
