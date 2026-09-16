import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getTask } from '@/lib/queries/tasks';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { TaskForm } from '../../new/task-form';

export const dynamic = 'force-dynamic';

const local = (d: Date | null) =>
  d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const task = await getTask(id);
  if (!task) notFound();
  if (!actor.can('task:write', task.company_id)) {
    return <ForbiddenState permission="task:write" backHref={`/tasks/${id}`} />;
  }
  const options = await getFormOptions([task.company_id]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: task.title, href: `/tasks/${id}` }, { label: 'Edit' }]}
        title="Edit task"
      />
      <TaskForm
        taskId={id}
        options={{
          companies: [{ id: task.company_id, name: task.company_name }],
          users: options.users,
          clients: options.clients,
          projects: options.projects,
        }}
        defaults={{
          companyId: task.company_id,
          title: task.title,
          description: task.description ?? '',
          status: task.status as 'todo',
          priority: task.priority as 'normal',
          assigneeUserId: task.assignee_user_id ?? 'none',
          clientId: task.client_id ?? 'none',
          projectId: task.project_id ?? 'none',
          waitingOn: task.waiting_on ?? '',
          startAt: local(task.start_at),
          dueAt: local(task.due_at),
          estimateHours: task.estimate_hours ?? '',
          isPersonal: task.is_personal,
          recurrenceRule: task.recurrence_rule ?? '',
        }}
      />
    </>
  );
}
