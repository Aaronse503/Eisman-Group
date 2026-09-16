import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Pencil, Repeat } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getTask, getSubtasks, getTaskDependencies } from '@/lib/queries/tasks';
import { getRecordSidecars } from '@/lib/queries/records';
import { getFormOptions } from '@/lib/queries/options';
import { listActivity } from '@/lib/activity';
import { fmtDateTime, fmtRelative, isOverdue } from '@/lib/dates';
import { titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge, StatusBadge } from '@/components/ui/status';
import { ForbiddenState } from '@/components/ui/states';
import {
  ActivityTimeline, AttachmentsPanel, CommentsPanel, NotesPanel, TagsPanel,
} from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';
import { describeRecurrence } from '@/lib/domain/tasks';
import { TaskControls } from './task-controls';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  return { title: task?.title ?? 'Task' };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const task = await getTask(id);
  if (!task) notFound();
  if (!actor.canReadCompany(task.company_id) || !actor.can('task:read', task.company_id)) {
    return <ForbiddenState permission="task:read" backHref="/tasks" />;
  }

  const roles = actor.rolesFor(task.company_id);
  const contractorOnly = roles.length === 1 && roles[0] === 'contractor';
  const canWrite =
    actor.can('task:write', task.company_id) &&
    (!contractorOnly || task.assignee_user_id === actor.user.id);

  const [subtasks, deps, sidecars, activity, options] = await Promise.all([
    getSubtasks(id),
    getTaskDependencies(id),
    getRecordSidecars('task', id, task.company_id),
    listActivity({ entityType: 'task', entityId: id, limit: 30 }),
    getFormOptions([task.company_id]),
  ]);

  const overdue = isOverdue(task.due_at, task.completed_at);

  return (
    <>
      <TrackView entityType="task" entityId={id} label={task.title} href={`/tasks/${id}`} companyId={task.company_id} />
      <PageHeader
        breadcrumbs={[
          { label: 'Tasks', href: '/tasks' },
          ...(task.client_id ? [{ label: task.client_name!, href: `/crm/clients/${task.client_id}` }] : []),
          { label: task.title },
        ]}
        title={task.title}
        description={task.description ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={overdue ? 'overdue' : task.status} />
            <PriorityBadge priority={task.priority} />
            <Badge tone="outline">{task.company_name}</Badge>
            {task.recurrence_rule ? (
              <Badge tone="accent">
                <Repeat className="size-3" /> {describeRecurrence(task.recurrence_rule)}
              </Badge>
            ) : null}
            {task.external_source ? (
              <Badge tone="accent">Synced from {titleCase(task.external_source)}</Badge>
            ) : null}
            {task.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <Button asChild variant="secondary">
              <Link href={`/tasks/${id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <TaskControls
            taskId={id}
            status={task.status}
            assigneeUserId={task.assignee_user_id}
            canWrite={canWrite}
            canAssign={actor.can('task:assign', task.company_id)}
            users={options.users}
            subtasks={subtasks.map((s) => ({ id: s.id, title: s.title, status: s.status }))}
            blockedBy={deps.blockedBy}
            blocking={deps.blocking}
            candidates={options.projects.length ? [] : []}
          />

          <NotesPanel
            target={{ entityType: 'task', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', task.company_id)}
          />
          <CommentsPanel
            target={{ entityType: 'task', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={1}
                items={[
                  { label: 'Assignee', value: task.assignee_name ?? 'Unassigned' },
                  {
                    label: 'Due',
                    value: task.due_at ? (
                      <span className={overdue ? 'font-medium text-[var(--danger)]' : ''}>
                        {fmtDateTime(task.due_at)}
                      </span>
                    ) : '—',
                  },
                  { label: 'Start', value: task.start_at ? fmtDateTime(task.start_at) : '—' },
                  { label: 'Estimate', value: task.estimate_hours ? `${task.estimate_hours} h` : '—' },
                  {
                    label: 'Client',
                    value: task.client_id ? (
                      <Link href={`/crm/clients/${task.client_id}`} className="text-[var(--accent)] hover:underline">
                        {task.client_name}
                      </Link>
                    ) : '—',
                  },
                  { label: 'Project', value: task.project_name ?? '—' },
                  { label: 'Waiting on', value: task.waiting_on ?? '—' },
                  { label: 'Delegated by', value: task.delegated_by_name ?? '—' },
                  {
                    label: 'Completed',
                    value: task.completed_at ? fmtDateTime(task.completed_at) : 'Not yet',
                  },
                  {
                    label: 'Source',
                    value: task.external_url ? (
                      <a href={task.external_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        Open in {titleCase(task.external_source ?? 'source')} <ExternalLink className="size-3" />
                      </a>
                    ) : 'Created here',
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagsPanel
                target={{ entityType: 'task', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=task&id=${id}&company=${task.company_slug}`}
            canWrite={actor.can('knowledge:write', task.company_id)}
          />

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
              <p className="mt-3 text-xs text-[var(--fg-subtle)]">Created {fmtRelative(task.created_at)}.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
