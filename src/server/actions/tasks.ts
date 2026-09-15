'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import { quickTaskSchema, taskSchema } from '@/lib/validation/tasks';
import { TASK_STATUSES } from '@/lib/domain/tasks';

function fail(err: unknown): ActionResult<never> {
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to change tasks in this company.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireTaskWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('task:write', companyId)) throw new ForbiddenError('task:write', companyId);
  return actor;
}

/**
 * Contractors may only touch work assigned to them. Everyone else with
 * `task:write` may edit any task in their company.
 */
async function assertCanEditTask(taskId: string) {
  const task = await one<{
    company_id: string; title: string; assignee_user_id: string | null;
    status: string; due_at: Date | null;
  }>(
    `select company_id, title, assignee_user_id, status, due_at
     from tasks where id = $1 and deleted_at is null`,
    [taskId],
  );
  if (!task) throw new Error('Task not found.');
  const actor = await requireTaskWrite(task.company_id);
  const roles = actor.rolesFor(task.company_id);
  const contractorOnly = roles.length === 1 && roles[0] === 'contractor';
  if (contractorOnly && task.assignee_user_id !== actor.user.id) {
    throw new ForbiddenError('task:write', task.company_id);
  }
  return { actor, task };
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireTaskWrite(data.companyId);

    const row = await one<{ id: string }>(
      `insert into tasks
         (company_id, project_id, client_id, parent_task_id, title, description, status, priority,
          assignee_user_id, created_by_id, delegated_by_id, waiting_on, start_at, due_at,
          estimate_hours, is_personal, recurrence_rule)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       returning id`,
      [
        data.companyId, data.projectId, data.clientId, data.parentTaskId, data.title,
        data.description, data.status, data.priority, data.assigneeUserId, actor.user.id,
        // Assigning to someone else records you as the delegator.
        data.assigneeUserId && data.assigneeUserId !== actor.user.id ? actor.user.id : null,
        data.waitingOn, data.startAt, data.dueAt, data.estimateHours, data.isPersonal,
        data.recurrenceRule,
      ],
    );

    if (data.assigneeUserId && data.assigneeUserId !== actor.user.id) {
      await sql(
        `insert into notifications (user_id, company_id, kind, title, body, entity_type, entity_id, href)
         values ($1,$2,'assignment','New task assigned to you',$3,'task',$4,$5)`,
        [data.assigneeUserId, data.companyId, data.title, row!.id, `/tasks/${row!.id}`],
      );
    }

    await recordActivity({
      actor, companyId: data.companyId, entityType: 'task', entityId: row!.id,
      action: 'created', summary: `Created the task “${data.title}”`,
    });
    revalidatePath('/tasks');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function quickCreateTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = quickTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter a task title.' };
  }
  return createTaskAction({ ...parsed.data, status: 'todo', priority: 'normal' });
}

export async function updateTaskAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const { actor, task } = await assertCanEditTask(id);

    await sql(
      `update tasks set
         project_id = $2, client_id = $3, title = $4, description = $5, status = $6, priority = $7,
         assignee_user_id = $8, waiting_on = $9, start_at = $10, due_at = $11, estimate_hours = $12,
         is_personal = $13, recurrence_rule = $14,
         completed_at = case when $6 = 'done' then coalesce(completed_at, now()) else null end
       where id = $1`,
      [
        id, data.projectId, data.clientId, data.title, data.description, data.status, data.priority,
        data.assigneeUserId, data.waitingOn, data.startAt, data.dueAt, data.estimateHours,
        data.isPersonal, data.recurrenceRule,
      ],
    );

    if (data.assigneeUserId && data.assigneeUserId !== task.assignee_user_id && data.assigneeUserId !== actor.user.id) {
      await sql(`update tasks set delegated_by_id = $2 where id = $1`, [id, actor.user.id]);
      await sql(
        `insert into notifications (user_id, company_id, kind, title, body, entity_type, entity_id, href)
         values ($1,$2,'assignment','Task assigned to you',$3,'task',$4,$5)`,
        [data.assigneeUserId, task.company_id, data.title, id, `/tasks/${id}`],
      );
    }

    await recordActivity({
      actor, companyId: task.company_id, entityType: 'task', entityId: id,
      action: 'updated', summary: `Updated the task “${data.title}”`,
    });
    revalidatePath('/tasks');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

/** Advances a recurring task by creating the next occurrence when completed. */
function nextOccurrence(rule: string, from: Date): Date | null {
  const freq = /FREQ=(\w+)/.exec(rule)?.[1]?.toUpperCase();
  const interval = Number(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? '1');
  const next = new Date(from);
  switch (freq) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + interval);
      return next;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7 * interval);
      return next;
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + interval);
      return next;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      return next;
    default:
      return null;
  }
}

export async function setTaskStatusAction(id: string, status: string): Promise<ActionResult<null>> {
  try {
    if (!(TASK_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: 'Unknown status.' };
    }
    const { actor, task } = await assertCanEditTask(id);

    // Refuse to complete a task whose blockers are still open.
    if (status === 'done') {
      const [{ count }] = await sql<{ count: number }>(
        `select count(*)::int as count from task_dependencies d
         join tasks b on b.id = d.depends_on_task_id
         where d.task_id = $1 and b.status not in ('done','cancelled') and b.deleted_at is null`,
        [id],
      );
      if (count > 0) {
        return {
          ok: false,
          error: `This task is blocked by ${count} unfinished task${count === 1 ? '' : 's'}.`,
        };
      }
    }

    await sql(
      `update tasks set status = $2,
         completed_at = case when $2 = 'done' then now() else null end
       where id = $1`,
      [id, status],
    );

    // A completed recurring task spawns its next occurrence.
    if (status === 'done') {
      const full = await one<{
        recurrence_rule: string | null; due_at: Date | null; company_id: string; title: string;
        description: string | null; priority: string; assignee_user_id: string | null;
        client_id: string | null; project_id: string | null; is_personal: boolean;
      }>(`select * from tasks where id = $1`, [id]);
      if (full?.recurrence_rule) {
        const base = full.due_at ?? new Date();
        const next = nextOccurrence(full.recurrence_rule, base);
        if (next) {
          await sql(
            `insert into tasks
               (company_id, project_id, client_id, title, description, status, priority,
                assignee_user_id, created_by_id, due_at, is_personal, recurrence_rule, recurrence_parent_id)
             values ($1,$2,$3,$4,$5,'todo',$6,$7,$8,$9,$10,$11,$12)`,
            [
              full.company_id, full.project_id, full.client_id, full.title, full.description,
              full.priority, full.assignee_user_id, actor.user.id, next, full.is_personal,
              full.recurrence_rule, id,
            ],
          );
        }
      }
    }

    await recordActivity({
      actor, companyId: task.company_id, entityType: 'task', entityId: id,
      action: status === 'done' ? 'completed' : 'status_changed',
      summary: `${status === 'done' ? 'Completed' : `Moved to ${status.replace(/_/g, ' ')}`}: “${task.title}”`,
      meta: { from: task.status, to: status },
    });
    revalidatePath('/tasks');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function assignTaskAction(id: string, userId: string | null): Promise<ActionResult<null>> {
  try {
    const { actor, task } = await assertCanEditTask(id);
    if (!actor.can('task:assign', task.company_id)) {
      return { ok: false, error: 'You cannot reassign tasks in this company.' };
    }
    await sql(
      `update tasks set assignee_user_id = $2, delegated_by_id = $3 where id = $1`,
      [id, userId, userId && userId !== actor.user.id ? actor.user.id : null],
    );
    if (userId && userId !== actor.user.id) {
      await sql(
        `insert into notifications (user_id, company_id, kind, title, body, entity_type, entity_id, href)
         values ($1,$2,'assignment','Task assigned to you',$3,'task',$4,$5)`,
        [userId, task.company_id, task.title, id, `/tasks/${id}`],
      );
    }
    await recordActivity({
      actor, companyId: task.company_id, entityType: 'task', entityId: id,
      action: 'assigned', summary: userId ? `Reassigned “${task.title}”` : `Unassigned “${task.title}”`,
    });
    revalidatePath('/tasks');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveTaskAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = z
      .object({ id: z.string().uuid(), archived: z.boolean(), reason: z.string().trim().min(1) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: 'A reason is required.' };
    const { actor, task } = await assertCanEditTask(parsed.data.id);
    await sql(`update tasks set archived_at = $2 where id = $1`, [
      parsed.data.id,
      parsed.data.archived ? new Date() : null,
    ]);
    await recordActivity({
      actor, companyId: task.company_id, entityType: 'task', entityId: parsed.data.id,
      action: parsed.data.archived ? 'archived' : 'restored',
      summary: `${parsed.data.archived ? 'Archived' : 'Restored'} “${task.title}”`,
      meta: { reason: parsed.data.reason },
    });
    revalidatePath('/tasks');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function addDependencyAction(taskId: string, dependsOnId: string): Promise<ActionResult<null>> {
  try {
    if (taskId === dependsOnId) return { ok: false, error: 'A task cannot depend on itself.' };
    const { task } = await assertCanEditTask(taskId);

    // Reject a cycle before inserting.
    const [{ cycle }] = await sql<{ cycle: boolean }>(
      `with recursive chain as (
         select depends_on_task_id as id from task_dependencies where task_id = $1
         union
         select d.depends_on_task_id from task_dependencies d join chain c on d.task_id = c.id
       ) select exists (select 1 from chain where id = $2) as cycle`,
      [dependsOnId, taskId],
    );
    if (cycle) return { ok: false, error: 'That would create a circular dependency.' };

    await sql(
      `insert into task_dependencies (task_id, depends_on_task_id) values ($1,$2)
       on conflict do nothing`,
      [taskId, dependsOnId],
    );
    revalidatePath(`/tasks/${taskId}`);
    void task;
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function removeDependencyAction(taskId: string, dependsOnId: string): Promise<ActionResult<null>> {
  try {
    await assertCanEditTask(taskId);
    await sql(`delete from task_dependencies where task_id = $1 and depends_on_task_id = $2`, [
      taskId,
      dependsOnId,
    ]);
    revalidatePath(`/tasks/${taskId}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function addSubtaskAction(parentId: string, title: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { actor, task } = await assertCanEditTask(parentId);
    if (!title.trim()) return { ok: false, error: 'Enter a title.' };
    const row = await one<{ id: string }>(
      `insert into tasks (company_id, parent_task_id, title, created_by_id, status)
       values ($1,$2,$3,$4,'todo') returning id`,
      [task.company_id, parentId, title.trim(), actor.user.id],
    );
    revalidatePath(`/tasks/${parentId}`);
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function bulkUpdateTasksAction(
  ids: string[],
  patch: { status?: string; priority?: string; assigneeUserId?: string | null },
): Promise<ActionResult<{ updated: number }>> {
  try {
    await requireActor();
    let updated = 0;
    for (const id of ids.slice(0, 200)) {
      try {
        if (patch.status) {
          const result = await setTaskStatusAction(id, patch.status);
          if (result.ok) updated++;
          continue;
        }
        const { task } = await assertCanEditTask(id);
        if (patch.priority) {
          await sql(`update tasks set priority = $2 where id = $1`, [id, patch.priority]);
        }
        if (patch.assigneeUserId !== undefined) {
          await sql(`update tasks set assignee_user_id = $2 where id = $1`, [id, patch.assigneeUserId]);
        }
        void task;
        updated++;
      } catch {
        // Skip individual tasks the caller cannot edit rather than failing all.
      }
    }
    revalidatePath('/tasks');
    return { ok: true, data: { updated } };
  } catch (err) {
    return fail(err);
  }
}
