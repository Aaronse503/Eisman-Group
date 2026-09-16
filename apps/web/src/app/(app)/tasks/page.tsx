import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listTasks, getTaskCounts } from '@/lib/queries/tasks';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { TASK_VIEWS, type TaskViewId } from '@/lib/domain/tasks';
import { TasksView } from './tasks-view';
import { TaskViewRail } from './task-view-rail';

export const metadata: Metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('task:read', scope.companyId)) return <ForbiddenState permission="task:read" />;

  const raw = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = (TASK_VIEWS.find((v) => v.id === raw)?.id ?? 'my') as TaskViewId;
  const clientId = Array.isArray(params.client) ? params.client[0] : params.client;

  const [tasks, counts, options] = await Promise.all([
    listTasks({ companyIds: scope.companyIds, view, userId: actor.user.id, clientId }),
    getTaskCounts(scope.companyIds, actor.user.id),
    getFormOptions(scope.companyIds),
  ]);

  const canWrite = actor.can('task:write', scope.companyId);
  const current = TASK_VIEWS.find((v) => v.id === view)!;
  const defaultCompanyId =
    scope.companyId ?? actor.companies.find((c) => !c.archived_at && actor.can('task:write', c.id))?.id ?? null;

  return (
    <>
      <PageHeader
        title="Tasks"
        description={current.description}
        actions={
          canWrite ? (
            <Button asChild variant="primary">
              <Link href={`/tasks/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                <Plus /> New task
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-5 lg:flex-row">
        <TaskViewRail active={view} counts={counts} scopeSlug={scope.slug} />
        <div className="min-w-0 flex-1">
          <TasksView
            tasks={tasks}
            canWrite={canWrite}
            showCompany={scope.isHoldings}
            users={options.users}
            clients={options.clients}
            defaultCompanyId={defaultCompanyId}
          />
        </div>
      </div>
    </>
  );
}
