import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { TaskForm } from './task-form';

export const metadata: Metadata = { title: 'New task' };
export const dynamic = 'force-dynamic';

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('task:write', scope.companyId)) {
    return <ForbiddenState permission="task:write" backHref="/tasks" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('task:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));
  const clientId = Array.isArray(params.client) ? params.client[0] : params.client;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: 'New' }]}
        title="New task"
      />
      <TaskForm
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          users: options.users,
          clients: options.clients,
          projects: options.projects,
        }}
        defaults={{
          companyId: scope.companyId ?? writable[0]?.id ?? '',
          clientId: clientId ?? 'none',
          assigneeUserId: actor.user.id,
        }}
      />
    </>
  );
}
