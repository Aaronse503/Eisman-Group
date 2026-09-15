'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import { memberSchema, reassignSchema } from '@/lib/validation/team';

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to change people records here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireTeamWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('team:write', companyId)) throw new ForbiddenError('team:write', companyId);
  return actor;
}

export async function createMemberAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = memberSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireTeamWrite(data.companyId);

    // Pay information may only be set by someone allowed to see compensation.
    const canSetPay = actor.can('team:compensation_read', data.companyId);
    const row = await one<{ id: string }>(
      `insert into members
         (company_id, user_id, contact_id, full_name, email, phone, kind, title, role_description,
          department_id, manager_id, employment_type, pay_rate, pay_rate_unit, pay_schedule,
          currency, start_date, end_date, status, skills, capacity_hours, location, is_vacant)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       returning id`,
      [
        data.companyId, data.userId, data.contactId, data.fullName, data.email, data.phone,
        data.kind, data.title, data.roleDescription, data.departmentId, data.managerId,
        data.employmentType, canSetPay ? data.payRate : null,
        canSetPay ? data.payRateUnit : null, canSetPay ? data.paySchedule : null,
        data.currency, data.startDate, data.endDate, data.status, data.skills,
        data.capacityHours, data.location, data.isVacant,
      ],
    );

    await recordAudit({
      actor, companyId: data.companyId, action: 'member.created',
      entityType: 'member', entityId: row!.id, entityLabel: data.fullName,
      severity: 'notice',
      after: { kind: data.kind, title: data.title, is_vacant: data.isVacant },
    });
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'member', entityId: row!.id,
      action: 'created',
      summary: data.isVacant ? `Opened the role ${data.title}` : `Added ${data.fullName} to the team`,
    });
    revalidatePath('/team');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMemberAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = memberSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const before = await one<Record<string, unknown>>(
      `select * from members where id = $1 and deleted_at is null`, [id],
    );
    if (!before) return { ok: false, error: 'Team member not found.' };
    const actor = await requireTeamWrite(before.company_id as string);
    const canSetPay = actor.can('team:compensation_read', before.company_id as string);

    await sql(
      `update members set
         user_id = $2, contact_id = $3, full_name = $4, email = $5, phone = $6, kind = $7,
         title = $8, role_description = $9, department_id = $10, employment_type = $11,
         pay_rate = case when $12 then $13 else pay_rate end,
         pay_rate_unit = case when $12 then $14 else pay_rate_unit end,
         pay_schedule = case when $12 then $15 else pay_schedule end,
         currency = $16, start_date = $17, end_date = $18, status = $19, skills = $20,
         capacity_hours = $21, location = $22, is_vacant = $23
       where id = $1`,
      [
        id, data.userId, data.contactId, data.fullName, data.email, data.phone, data.kind,
        data.title, data.roleDescription, data.departmentId, data.employmentType,
        canSetPay, data.payRate, data.payRateUnit, data.paySchedule, data.currency,
        data.startDate, data.endDate, data.status, data.skills, data.capacityHours,
        data.location, data.isVacant,
      ],
    );

    // A pay change is material and is audited on its own.
    if (canSetPay && Number(before.pay_rate ?? 0) !== Number(data.payRate ?? 0)) {
      await recordAudit({
        actor, companyId: before.company_id as string, action: 'member.pay_changed',
        entityType: 'member', entityId: id, entityLabel: data.fullName, severity: 'critical',
        before: { pay_rate: before.pay_rate, pay_rate_unit: before.pay_rate_unit },
        after: { pay_rate: data.payRate, pay_rate_unit: data.payRateUnit },
      });
    }
    await recordAudit({
      actor, companyId: before.company_id as string, action: 'member.updated',
      entityType: 'member', entityId: id, entityLabel: data.fullName,
      before: { title: before.title, status: before.status },
      after: { title: data.title, status: data.status },
    });
    revalidatePath('/team');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Reorganising the reporting line is an auditable workflow: it needs a reason,
 * refuses to create a cycle, and writes to the org change log as well as the
 * audit log.
 */
export async function reassignManagerAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = reassignSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { memberId, managerId, reason } = parsed.data;
    const member = await one<{ company_id: string; full_name: string; manager_id: string | null }>(
      `select company_id, full_name, manager_id from members where id = $1 and deleted_at is null`,
      [memberId],
    );
    if (!member) return { ok: false, error: 'Team member not found.' };
    const actor = await requireTeamWrite(member.company_id);

    if (managerId === memberId) return { ok: false, error: 'Someone cannot report to themselves.' };

    if (managerId) {
      const manager = await one<{ company_id: string; full_name: string }>(
        `select company_id, full_name from members where id = $1 and deleted_at is null`,
        [managerId],
      );
      if (!manager) return { ok: false, error: 'Manager not found.' };
      if (manager.company_id !== member.company_id) {
        return { ok: false, error: 'A reporting line cannot cross companies.' };
      }
      // Walk up from the proposed manager: reaching this member means a cycle.
      const [{ cycle }] = await sql<{ cycle: boolean }>(
        `with recursive chain as (
           select id, manager_id from members where id = $1
           union
           select m.id, m.manager_id from members m join chain c on m.id = c.manager_id
         ) select exists (select 1 from chain where id = $2) as cycle`,
        [managerId, memberId],
      );
      if (cycle) return { ok: false, error: 'That would create a circular reporting line.' };
    }

    const fromName = member.manager_id
      ? (await one<{ full_name: string }>(`select full_name from members where id = $1`, [member.manager_id]))?.full_name
      : null;
    const toName = managerId
      ? (await one<{ full_name: string }>(`select full_name from members where id = $1`, [managerId]))?.full_name
      : null;

    await sql(`update members set manager_id = $2 where id = $1`, [memberId, managerId]);
    await sql(
      `insert into org_chart_changes (company_id, member_id, from_manager_id, to_manager_id, reason, actor_user_id)
       values ($1,$2,$3,$4,$5,$6)`,
      [member.company_id, memberId, member.manager_id, managerId, reason, actor.user.id],
    );
    await recordAudit({
      actor, companyId: member.company_id, action: 'org_chart.reassigned',
      entityType: 'member', entityId: memberId, entityLabel: member.full_name,
      reason, severity: 'warning',
      before: { manager: fromName }, after: { manager: toName },
    });
    await recordActivity({
      actor, companyId: member.company_id, entityType: 'member', entityId: memberId,
      action: 'reassigned',
      summary: `${member.full_name} now reports to ${toName ?? 'nobody'}`,
      meta: { reason, from: fromName, to: toName },
    });
    revalidatePath('/team');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function assignMemberToClientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = z
      .object({
        memberId: z.string().uuid(),
        clientId: z.string().uuid(),
        role: z.string().trim().max(80).default('contributor'),
        allocationPct: z.coerce.number().int().min(0).max(100).default(0),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid assignment.' };
    const { memberId, clientId, role, allocationPct } = parsed.data;
    const member = await one<{ company_id: string; full_name: string }>(
      `select company_id, full_name from members where id = $1 and deleted_at is null`,
      [memberId],
    );
    if (!member) return { ok: false, error: 'Team member not found.' };
    const actor = await requireTeamWrite(member.company_id);

    const row = await one<{ id: string }>(
      `insert into member_assignments (member_id, client_id, role, allocation_pct, start_date)
       values ($1,$2,$3,$4, current_date) returning id`,
      [memberId, clientId, role, allocationPct],
    );
    await recordActivity({
      actor, companyId: member.company_id, entityType: 'member', entityId: memberId,
      action: 'assigned', summary: `Assigned ${member.full_name} to a client`,
    });
    revalidatePath('/team');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeAssignmentAction(assignmentId: string): Promise<ActionResult<null>> {
  try {
    const row = await one<{ company_id: string }>(
      `select m.company_id from member_assignments a join members m on m.id = a.member_id
       where a.id = $1`,
      [assignmentId],
    );
    if (!row) return { ok: false, error: 'Assignment not found.' };
    await requireTeamWrite(row.company_id);
    await sql(`delete from member_assignments where id = $1`, [assignmentId]);
    revalidatePath('/team');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
