import { authed, notFound, forbidden } from '@/lib/api/route';
import { getSubtasks, getTask } from '@/lib/queries/tasks';

/** One task, with its subtasks. */
export const GET = authed(async ({ actor, route }) => {
  const task = await getTask(route.id!);
  if (!task) throw notFound('Task');
  if (!actor.canReadCompany(task.company_id)) throw forbidden();

  const subtasks = await getSubtasks(task.id);

  return {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueAt: task.due_at ? new Date(task.due_at).toISOString() : null,
      companyName: task.company_name,
      clientName: task.client_name,
      assigneeName: task.assignee_name,
      recurrenceRule: task.recurrence_rule,
      isDemo: task.is_demo,
    },
    subtasks: subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      dueAt: s.due_at ? new Date(s.due_at).toISOString() : null,
      isDemo: s.is_demo,
    })),
  };
});
