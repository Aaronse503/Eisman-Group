'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, ForbiddenError } from '@/lib/auth/actor';
import { recordAudit } from '@/lib/audit';
import { hashPassword, generateToken } from '@/lib/crypto';
import { revokeAllSessionsForUser } from '@/lib/auth/session';
import { ROLES, type Role } from '@/lib/rbac/permissions';
import type { ActionResult } from '@/lib/validation/schemas';
import { rethrowControlFlow } from '@/lib/action-errors';

/**
 * User and role administration.
 *
 * Only a Holdings Owner may grant holdings-wide roles or the Holdings Owner
 * role itself — a Company Admin can manage people inside their own company but
 * cannot escalate anyone (or themselves) beyond it.
 */

function fail(err: unknown): ActionResult<never> {
  rethrowControlFlow(err);
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to manage members here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  name: z.string().trim().min(2, 'Enter a name').max(120),
  title: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
  companyId: z.string().uuid().nullable(),
});

export async function inviteMemberAction(input: unknown): Promise<ActionResult<{ id: string; temporaryPassword: string }>> {
  try {
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { email, name, title, role, companyId } = parsed.data;
    const actor = await requireActor();

    if (!actor.can('user:manage', companyId)) throw new ForbiddenError('user:manage', companyId);
    if ((companyId === null || role === 'holdings_owner') && !actor.isHoldingsOwner) {
      return {
        ok: false,
        error: 'Only a Holdings Owner can grant a holdings-wide role or the Holdings Owner role.',
      };
    }

    const existing = await one<{ id: string }>(`select id from users where lower(email) = $1`, [email]);
    let userId = existing?.id;
    let temporaryPassword = '';

    if (!userId) {
      temporaryPassword = generateToken(9);
      const created = await one<{ id: string }>(
        `insert into users (email, name, title, password_hash, status, must_change_password)
         values ($1,$2,$3,$4,'active',true) returning id`,
        [email, name, title ?? null, await hashPassword(temporaryPassword)],
      );
      userId = created!.id;
    }

    await sql(
      `insert into user_company_roles (user_id, company_id, role) values ($1,$2,$3)
       on conflict (user_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role)
       do nothing`,
      [userId, companyId, role],
    );

    await recordAudit({
      actor, companyId, action: existing ? 'user.role_granted' : 'user.invited',
      entityType: 'user', entityId: userId, entityLabel: email,
      severity: 'critical',
      after: { role, company_id: companyId },
    });
    revalidatePath('/settings/members');
    return { ok: true, data: { id: userId!, temporaryPassword } };
  } catch (err) {
    return fail(err);
  }
}

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
  companyId: z.string().uuid().nullable(),
  grant: z.boolean(),
});

export async function setRoleAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid role change.' };
    const { userId, role, companyId, grant } = parsed.data;
    const actor = await requireActor();

    if (!actor.can('user:manage', companyId)) throw new ForbiddenError('user:manage', companyId);
    if ((companyId === null || role === 'holdings_owner') && !actor.isHoldingsOwner) {
      return { ok: false, error: 'Only a Holdings Owner can change holdings-wide roles.' };
    }

    const target = await one<{ email: string }>(`select email from users where id = $1`, [userId]);
    if (!target) return { ok: false, error: 'User not found.' };

    // Never allow the last holdings owner to be removed.
    if (!grant && role === 'holdings_owner' && companyId === null) {
      const [{ count }] = await sql<{ count: number }>(
        `select count(*)::int as count from user_company_roles
         where role = 'holdings_owner' and company_id is null`,
      );
      if (count <= 1) {
        return { ok: false, error: 'There must always be at least one Holdings Owner.' };
      }
    }

    if (grant) {
      await sql(
        `insert into user_company_roles (user_id, company_id, role) values ($1,$2,$3)
         on conflict (user_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role)
         do nothing`,
        [userId, companyId, role],
      );
    } else {
      await sql(
        `delete from user_company_roles where user_id = $1 and role = $3
           and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
        [userId, companyId, role],
      );
    }

    await recordAudit({
      actor, companyId, action: grant ? 'user.role_granted' : 'user.role_revoked',
      entityType: 'user', entityId: userId, entityLabel: target.email,
      severity: 'critical',
      after: { role, company_id: companyId, granted: grant },
    });
    revalidatePath('/settings/members');
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const deactivateSchema = z.object({
  userId: z.string().uuid(),
  deactivate: z.boolean(),
  reason: z.string().trim().min(4, 'Give a reason — this is audited.'),
});

export async function setUserActiveAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = deactivateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { userId, deactivate, reason } = parsed.data;
    const actor = await requireActor();
    if (!actor.can('user:manage')) throw new ForbiddenError('user:manage', null);
    if (userId === actor.user.id) {
      return { ok: false, error: 'You cannot deactivate your own account.' };
    }

    const target = await one<{ email: string; status: string }>(
      `select email, status from users where id = $1`, [userId],
    );
    if (!target) return { ok: false, error: 'User not found.' };

    const isOwner = await one<{ id: string }>(
      `select id from user_company_roles where user_id = $1 and role = 'holdings_owner' and company_id is null`,
      [userId],
    );
    if (isOwner && deactivate && !actor.isHoldingsOwner) {
      return { ok: false, error: 'Only a Holdings Owner can deactivate another Holdings Owner.' };
    }

    await sql(`update users set status = $2 where id = $1`, [
      userId, deactivate ? 'deactivated' : 'active',
    ]);
    // Deactivation takes effect immediately on every device.
    if (deactivate) await revokeAllSessionsForUser(userId);

    await recordAudit({
      actor, action: deactivate ? 'user.deactivated' : 'user.reactivated',
      entityType: 'user', entityId: userId, entityLabel: target.email,
      reason, severity: 'critical',
      before: { status: target.status }, after: { status: deactivate ? 'deactivated' : 'active' },
    });
    revalidatePath('/settings/members');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function resetMemberPasswordAction(
  userId: string,
  reason: string,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  try {
    if (reason.trim().length < 4) return { ok: false, error: 'Give a reason.' };
    const actor = await requireActor();
    if (!actor.can('user:manage')) throw new ForbiddenError('user:manage', null);

    const target = await one<{ email: string }>(`select email from users where id = $1`, [userId]);
    if (!target) return { ok: false, error: 'User not found.' };

    const temporaryPassword = generateToken(9);
    await sql(
      `update users set password_hash = $2, must_change_password = true where id = $1`,
      [userId, await hashPassword(temporaryPassword)],
    );
    await revokeAllSessionsForUser(userId);

    await recordAudit({
      actor, action: 'user.password_reset',
      entityType: 'user', entityId: userId, entityLabel: target.email,
      reason, severity: 'critical',
    });
    revalidatePath('/settings/members');
    return { ok: true, data: { temporaryPassword } };
  } catch (err) {
    return fail(err);
  }
}

export async function listMembersAction() {
  const actor = await requireActor();
  if (!actor.can('user:manage')) throw new ForbiddenError('user:manage', null);
  const users = await sql<{
    id: string; email: string; name: string; title: string | null; status: string;
    is_demo: boolean; last_login_at: Date | null; created_at: Date;
  }>(
    `select id, email, name, title, status, is_demo, last_login_at, created_at
     from users order by status, name`,
  );
  const grants = await sql<{ user_id: string; company_id: string | null; role: Role }>(
    `select user_id, company_id, role from user_company_roles`,
  );
  return { users, grants };
}
