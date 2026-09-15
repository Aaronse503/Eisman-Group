'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Check, LayoutGrid, Link2, Plus, Repeat, Table2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { KanbanBoard } from '@/components/kanban';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { PriorityBadge, StatusBadge } from '@/components/ui/status';
import { cn, titleCase } from '@/lib/utils';
import { fmtDate, isOverdue } from '@/lib/dates';
import {
  bulkUpdateTasksAction, quickCreateTaskAction, setTaskStatusAction,
} from '@/server/actions/tasks';
import { BOARD_STATUSES, TASK_PRIORITIES, describeRecurrence, type TaskRow } from '@/lib/domain/tasks';

export function TasksView({
  tasks,
  canWrite,
  showCompany,
  users,
  clients,
  defaultCompanyId,
}: {
  tasks: TaskRow[];
  canWrite: boolean;
  showCompany: boolean;
  users: { id: string; name: string }[];
  clients: { id: string; name: string; company_id: string }[];
  defaultCompanyId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [assignee, setAssignee] = React.useState(search.get('assignee') ?? 'all');
  const [priority, setPriority] = React.useState('all');
  const [clientId, setClientId] = React.useState(search.get('client') ?? 'all');
  const [quick, setQuick] = React.useState('');
  const [quickPending, setQuickPending] = React.useState(false);

  const filtered = React.useMemo(
    () =>
      tasks.filter((t) => {
        if (assignee === 'unassigned' && t.assignee_user_id) return false;
        if (assignee !== 'all' && assignee !== 'unassigned' && t.assignee_user_id !== assignee) return false;
        if (priority !== 'all' && t.priority !== priority) return false;
        if (clientId !== 'all' && t.client_id !== clientId) return false;
        return true;
      }),
    [tasks, assignee, priority, clientId],
  );

  const toggle = async (task: TaskRow) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    const result = await setTaskStatusAction(task.id, next);
    if (result.ok) {
      toast.success(next === 'done' ? 'Task completed' : 'Task reopened');
      router.refresh();
    } else toast.error(result.error);
  };

  const submitQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quick.trim() || !defaultCompanyId) return;
    setQuickPending(true);
    const result = await quickCreateTaskAction({
      companyId: defaultCompanyId,
      title: quick,
      clientId: clientId !== 'all' ? clientId : undefined,
    });
    setQuickPending(false);
    if (result.ok) {
      setQuick('');
      toast.success('Task added');
      router.refresh();
    } else toast.error(result.error);
  };

  const columns = React.useMemo<ColumnDef<TaskRow, unknown>[]>(() => {
    const cols: ColumnDef<TaskRow, unknown>[] = [
      {
        id: 'done',
        header: '',
        size: 36,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Checkbox
            aria-label={row.original.status === 'done' ? 'Reopen task' : 'Complete task'}
            checked={row.original.status === 'done'}
            disabled={!canWrite}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={() => toggle(row.original)}
          />
        ),
      },
      {
        id: 'title',
        header: 'Task',
        accessorKey: 'title',
        cell: ({ row }) => (
          <Link
            href={`/tasks/${row.original.id}`}
            className={cn(
              'font-medium hover:text-[var(--accent)] hover:underline',
              row.original.status === 'done' && 'text-[var(--fg-subtle)] line-through',
            )}
          >
            {row.original.title}
            {row.original.subtask_count > 0 ? (
              <span className="tnum ml-1.5 text-xs font-normal text-[var(--fg-subtle)]">
                {row.original.subtasks_done}/{row.original.subtask_count}
              </span>
            ) : null}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <StatusBadge
            status={
              isOverdue(row.original.due_at, row.original.completed_at) ? 'overdue' : row.original.status
            }
          />
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        accessorKey: 'priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'due_at',
        header: 'Due',
        accessorKey: 'due_at',
        cell: ({ row }) => (
          <span
            className={cn(
              'tnum text-sm',
              isOverdue(row.original.due_at, row.original.completed_at) && 'font-medium text-[var(--danger)]',
            )}
          >
            {fmtDate(row.original.due_at)}
          </span>
        ),
      },
      {
        id: 'assignee_name',
        header: 'Assignee',
        accessorKey: 'assignee_name',
        cell: ({ row }) => row.original.assignee_name ?? <span className="text-[var(--fg-subtle)]">Unassigned</span>,
      },
      {
        id: 'client_name',
        header: 'Client',
        accessorKey: 'client_name',
        cell: ({ row }) =>
          row.original.client_id ? (
            <Link href={`/crm/clients/${row.original.client_id}`} className="text-[var(--accent)] hover:underline">
              {row.original.client_name}
            </Link>
          ) : (
            <span className="text-[var(--fg-subtle)]">—</span>
          ),
      },
      {
        id: 'flags',
        header: 'Flags',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-1">
            {row.original.recurrence_rule ? (
              <Badge tone="outline" title={describeRecurrence(row.original.recurrence_rule) ?? ''}>
                <Repeat className="size-3" />
              </Badge>
            ) : null}
            {row.original.blocked_by > 0 ? (
              <Badge tone="danger" title={`Blocked by ${row.original.blocked_by} task(s)`}>
                <Link2 className="size-3" /> {row.original.blocked_by}
              </Badge>
            ) : null}
            {row.original.external_source ? (
              <Badge tone="accent">{titleCase(row.original.external_source)}</Badge>
            ) : null}
            {row.original.waiting_on ? <Badge tone="warning">Waiting</Badge> : null}
          </span>
        ),
      },
    ];
    if (showCompany) {
      cols.splice(2, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompany, canWrite]);

  const toolbar = (
    <>
      <NativeSelect
        aria-label="Filter by assignee"
        value={assignee}
        onChange={(e) => {
          setAssignee(e.target.value);
          const params = new URLSearchParams(search.toString());
          if (e.target.value === 'all') params.delete('assignee');
          else params.set('assignee', e.target.value);
          router.replace(`${pathname}?${params.toString()}`);
        }}
        className="h-9 w-[10rem]"
      >
        <option value="all">Anyone</option>
        <option value="unassigned">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="h-9 w-[8.5rem]"
      >
        <option value="all">Any priority</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>{titleCase(p)}</option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by client"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="h-9 w-[11rem]"
      >
        <option value="all">Any client</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </NativeSelect>
    </>
  );

  return (
    <Tabs defaultValue="list">
      <div className="mb-4 flex items-center justify-between gap-2">
        <TabsList className="w-auto">
          <TabsTrigger value="list">
            <Table2 className="size-3.5" /> List
          </TabsTrigger>
          <TabsTrigger value="board">
            <LayoutGrid className="size-3.5" /> Board
          </TabsTrigger>
        </TabsList>
        <p className="text-sm text-[var(--fg-muted)]">
          {filtered.length} of {tasks.length}
        </p>
      </div>

      {canWrite && defaultCompanyId ? (
        <form onSubmit={submitQuick} className="mb-4 flex gap-2">
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Add a task and press Enter…"
            aria-label="Quick add a task"
          />
          <Button type="submit" variant="secondary" loading={quickPending} disabled={!quick.trim()}>
            <Plus /> Add
          </Button>
        </form>
      ) : null}

      <TabsContent value="list">
        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="Search tasks…"
          toolbar={toolbar}
          exportFilename="tasks"
          enableSelection={canWrite}
          bulkActions={(rows, clear) => (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const result = await bulkUpdateTasksAction(rows.map((r) => r.id), { status: 'done' });
                  if (result.ok) {
                    toast.success(`${result.data.updated} task(s) completed`);
                    clear();
                    router.refresh();
                  } else toast.error(result.error);
                }}
              >
                <Check /> Mark complete
              </Button>
              <NativeSelect
                aria-label="Set priority for selected tasks"
                className="h-8 w-[9rem]"
                defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  const result = await bulkUpdateTasksAction(rows.map((r) => r.id), { priority: e.target.value });
                  if (result.ok) {
                    toast.success(`${result.data.updated} task(s) updated`);
                    clear();
                    router.refresh();
                  } else toast.error(result.error);
                }}
              >
                <option value="">Set priority…</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{titleCase(p)}</option>
                ))}
              </NativeSelect>
            </>
          )}
          emptyTitle="Nothing here"
          emptyDescription="This view has no tasks. Try another view, or add one above."
        />
      </TabsContent>

      <TabsContent value="board">
        <div className="mb-3 flex flex-wrap items-center gap-2">{toolbar}</div>
        <KanbanBoard
          columns={BOARD_STATUSES.map((s) => ({ id: s, title: titleCase(s) }))}
          items={filtered.map((t) => ({ ...t, columnId: t.status }))}
          readOnly={!canWrite}
          emptyMessage="No tasks in this view."
          onMove={
            canWrite
              ? async (id, status) => {
                  const result = await setTaskStatusAction(id, status);
                  if (result.ok) router.refresh();
                  else toast.error(result.error);
                }
              : undefined
          }
          renderCard={(task) => (
            <Link
              href={`/tasks/${task.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition-colors hover:border-[var(--accent)]/50"
            >
              <p className="text-sm font-medium">{task.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={task.priority} />
                {task.due_at ? (
                  <Badge tone={isOverdue(task.due_at, task.completed_at) ? 'danger' : 'neutral'}>
                    {isOverdue(task.due_at, task.completed_at) ? <AlertTriangle className="size-3" /> : null}
                    {fmtDate(task.due_at, 'MMM d')}
                  </Badge>
                ) : null}
                {task.client_name ? <Badge tone="outline">{task.client_name}</Badge> : null}
              </div>
              {task.assignee_name ? (
                <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">{task.assignee_name}</p>
              ) : null}
            </Link>
          )}
        />
      </TabsContent>
    </Tabs>
  );
}
