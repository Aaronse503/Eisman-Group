import { sql, one } from '@/lib/db/client';
import type { TaskRow, TaskViewId } from '@/lib/domain/tasks';

export type { TaskRow };

const BASE_SELECT = `
  select t.*, co.name as company_name, cl.name as client_name, p.name as project_name,
         u.name as assignee_name, d.name as delegated_by_name,
         (select count(*)::int from tasks s
           where s.parent_task_id = t.id and s.deleted_at is null) as subtask_count,
         (select count(*)::int from tasks s
           where s.parent_task_id = t.id and s.deleted_at is null and s.status = 'done') as subtasks_done,
         (select count(*)::int from task_dependencies dep
           join tasks bt on bt.id = dep.depends_on_task_id
           where dep.task_id = t.id and bt.status not in ('done','cancelled')) as blocked_by
  from tasks t
  join companies co on co.id = t.company_id
  left join clients cl on cl.id = t.client_id
  left join projects p on p.id = t.project_id
  left join users u on u.id = t.assignee_user_id
  left join users d on d.id = t.delegated_by_id`;

export async function listTasks(opts: {
  companyIds: string[];
  view?: TaskViewId;
  userId: string;
  clientId?: string;
  projectId?: string;
  assigneeId?: string;
  status?: string[];
  search?: string;
  includeSubtasks?: boolean;
  limit?: number;
}): Promise<TaskRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where: string[] = ['t.company_id = any($1)', 't.deleted_at is null', 't.archived_at is null'];
  const open = `t.status not in ('done','cancelled')`;

  // Only bind the current user when a view actually references it: Postgres
  // rejects a bind with more parameters than the statement uses.
  let userParam: string | null = null;
  const me = () => {
    if (!userParam) {
      params.push(opts.userId);
      userParam = `$${params.length}`;
    }
    return userParam;
  };

  switch (opts.view) {
    case 'my':
      where.push(`t.assignee_user_id = ${me()}`, open);
      break;
    case 'today':
      where.push(open, `t.due_at < (current_date + interval '1 day')`);
      break;
    case 'week':
      where.push(open, `t.due_at between now() and now() + interval '7 days'`);
      break;
    case 'overdue':
      where.push(open, `t.due_at < now()`);
      break;
    case 'delegated': {
      const uid = me();
      where.push(`t.delegated_by_id = ${uid}`, `t.assignee_user_id is distinct from ${uid}`, open);
      break;
    }
    case 'waiting':
      where.push(`(t.status = 'blocked' or t.waiting_on is not null)`, open);
      break;
    case 'recurring':
      where.push(`t.recurrence_rule is not null`);
      break;
    case 'personal':
      where.push(`t.is_personal = true`, `t.assignee_user_id = ${me()}`);
      break;
    case 'unassigned':
      where.push(`t.assignee_user_id is null`, open);
      break;
    case 'completed':
      where.push(`t.status = 'done'`);
      break;
    case 'all':
    default:
      where.push(open);
      break;
  }

  if (!opts.includeSubtasks) where.push('t.parent_task_id is null');
  if (opts.clientId) {
    params.push(opts.clientId);
    where.push(`t.client_id = $${params.length}`);
  }
  if (opts.projectId) {
    params.push(opts.projectId);
    where.push(`t.project_id = $${params.length}`);
  }
  if (opts.assigneeId) {
    params.push(opts.assigneeId);
    where.push(`t.assignee_user_id = $${params.length}`);
  }
  if (opts.status?.length) {
    params.push(opts.status);
    where.push(`t.status = any($${params.length})`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(t.title ilike $${params.length} or t.description ilike $${params.length})`);
  }

  const limit = Math.min(opts.limit ?? 500, 1000);
  return sql<TaskRow>(
    `${BASE_SELECT}
     where ${where.join(' and ')}
     order by
       case when t.status = 'done' then 1 else 0 end,
       case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
       t.due_at nulls last, t.position
     limit ${limit}`,
    params,
  );
}

export async function getTask(id: string) {
  return one<TaskRow & { company_slug: string }>(
    `${BASE_SELECT.replace('join companies co on co.id = t.company_id', 'join companies co on co.id = t.company_id')}
     where t.id = $1 and t.deleted_at is null`,
    [id],
  ).then(async (task) => {
    if (!task) return null;
    const slug = await one<{ slug: string }>(`select slug from companies where id = $1`, [task.company_id]);
    return { ...task, company_slug: slug?.slug ?? '' };
  });
}

export async function getSubtasks(parentId: string) {
  return sql<TaskRow>(`${BASE_SELECT} where t.parent_task_id = $1 and t.deleted_at is null order by t.position`, [parentId]);
}

export async function getTaskDependencies(taskId: string) {
  const [blockedBy, blocking] = await Promise.all([
    sql<{ id: string; title: string; status: string }>(
      `select t.id, t.title, t.status from task_dependencies d
       join tasks t on t.id = d.depends_on_task_id
       where d.task_id = $1 and t.deleted_at is null`,
      [taskId],
    ),
    sql<{ id: string; title: string; status: string }>(
      `select t.id, t.title, t.status from task_dependencies d
       join tasks t on t.id = d.task_id
       where d.depends_on_task_id = $1 and t.deleted_at is null`,
      [taskId],
    ),
  ]);
  return { blockedBy, blocking };
}

export async function getTaskCounts(companyIds: string[], userId: string) {
  if (!companyIds.length) {
    return { my: 0, today: 0, week: 0, overdue: 0, delegated: 0, waiting: 0, recurring: 0, personal: 0, unassigned: 0, all: 0, completed: 0 };
  }
  const [row] = await sql<Record<string, number>>(
    `select
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and t.assignee_user_id = $2) as my,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and t.due_at < (current_date + interval '1 day')) as today,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and t.due_at between now() and now() + interval '7 days') as week,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and t.due_at < now()) as overdue,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and t.delegated_by_id = $2
         and t.assignee_user_id is distinct from $2) as delegated,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and (t.status = 'blocked' or t.waiting_on is not null)) as waiting,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.recurrence_rule is not null) as recurring,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.is_personal = true and t.assignee_user_id = $2) as personal,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled') and t.assignee_user_id is null) as unassigned,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status not in ('done','cancelled')) as all,
       (select count(*)::int from tasks t where t.company_id = any($1) and t.deleted_at is null
         and t.status = 'done' and t.completed_at > now() - interval '30 days') as completed`,
    [companyIds, userId],
  );
  return row!;
}
