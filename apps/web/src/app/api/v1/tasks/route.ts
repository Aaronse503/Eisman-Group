import type { TaskSummary } from '@eisman/shared';
import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { listTasks } from '@/lib/queries/tasks';
import { createTaskAction } from '@/server/actions/tasks';
import type { TaskViewId } from '@eisman/shared';

/** Tasks, through the same views the web application offers. */
export const GET = authed<{ items: TaskSummary[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const rows = await listTasks({
    companyIds: scope.companyIds,
    userId: actor.user.id,
    view: (params.get('view') ?? undefined) as TaskViewId | undefined,
    clientId: params.get('client') ?? undefined,
    search: params.get('q') ?? undefined,
    limit: Math.min(Number(params.get('limit') ?? 100), 200),
  });

  const now = Date.now();
  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
      companyId: r.company_id,
      companyName: r.company_name,
      clientName: r.client_name,
      assigneeName: r.assignee_name,
      isOverdue: Boolean(r.due_at && new Date(r.due_at).getTime() < now && !r.completed_at),
      subtaskCount: r.subtask_count,
      subtasksDone: r.subtasks_done,
      isDemo: r.is_demo,
    })),
  };
});

/** Creates a task. The same action the web form uses. */
export const POST = authed(async ({ request }) => {
  const result = await createTaskAction(await jsonBody(request));
  if (!result.ok) throw badRequest(result.error, result.fields);
  return { id: result.data.id };
});
