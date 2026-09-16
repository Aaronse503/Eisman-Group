'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Link2, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status';
import { cn, titleCase } from '@/lib/utils';
import { TASK_STATUSES } from '@/lib/domain/tasks';
import {
  addSubtaskAction, assignTaskAction, removeDependencyAction, setTaskStatusAction,
} from '@/server/actions/tasks';

interface Simple {
  id: string;
  title: string;
  status: string;
}

export function TaskControls({
  taskId,
  status,
  assigneeUserId,
  canWrite,
  canAssign,
  users,
  subtasks,
  blockedBy,
  blocking,
}: {
  taskId: string;
  status: string;
  assigneeUserId: string | null;
  canWrite: boolean;
  canAssign: boolean;
  users: { id: string; name: string }[];
  subtasks: Simple[];
  blockedBy: Simple[];
  blocking: Simple[];
  candidates?: unknown[];
}) {
  const router = useRouter();
  const [newSubtask, setNewSubtask] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const done = subtasks.filter((s) => s.status === 'done').length;
  const openBlockers = blockedBy.filter((b) => b.status !== 'done' && b.status !== 'cancelled');

  const changeStatus = async (next: string) => {
    const result = await setTaskStatusAction(taskId, next);
    if (result.ok) {
      toast.success(`Status set to ${titleCase(next)}`);
      router.refresh();
    } else toast.error(result.error);
  };

  const toggleSubtask = async (sub: Simple) => {
    const result = await setTaskStatusAction(sub.id, sub.status === 'done' ? 'todo' : 'done');
    if (result.ok) router.refresh();
    else toast.error(result.error);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {openBlockers.length > 0 ? (
            <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning)]">
              Blocked by {openBlockers.length} unfinished task{openBlockers.length === 1 ? '' : 's'}. It cannot be
              completed until those are done.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label="Task status"
              value={status}
              disabled={!canWrite}
              onChange={(e) => changeStatus(e.target.value)}
              className="w-[10rem]"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>

            <NativeSelect
              aria-label="Assignee"
              value={assigneeUserId ?? 'none'}
              disabled={!canAssign}
              onChange={async (e) => {
                const value = e.target.value === 'none' ? null : e.target.value;
                const result = await assignTaskAction(taskId, value);
                if (result.ok) {
                  toast.success('Assignee updated');
                  router.refresh();
                } else toast.error(result.error);
              }}
              className="w-[12rem]"
            >
              <option value="none">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>

            {status !== 'done' && canWrite ? (
              <Button variant="primary" size="sm" onClick={() => changeStatus('done')}>
                Mark complete
              </Button>
            ) : null}
          </div>

          {subtasks.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Subtasks</span>
                <span className="tnum text-[var(--fg-subtle)]">
                  {done}/{subtasks.length}
                </span>
              </div>
              <Progress value={(done / subtasks.length) * 100} tone={done === subtasks.length ? 'success' : 'accent'} />
              <ul className="space-y-1">
                {subtasks.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={sub.status === 'done'}
                      disabled={!canWrite}
                      onCheckedChange={() => toggleSubtask(sub)}
                      aria-label={`Complete ${sub.title}`}
                    />
                    <Link
                      href={`/tasks/${sub.id}`}
                      className={cn(
                        'flex-1 truncate text-sm hover:underline',
                        sub.status === 'done' && 'text-[var(--fg-subtle)] line-through',
                      )}
                    >
                      {sub.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canWrite ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newSubtask.trim()) return;
                setPending(true);
                const result = await addSubtaskAction(taskId, newSubtask);
                setPending(false);
                if (result.ok) {
                  setNewSubtask('');
                  router.refresh();
                } else toast.error(result.error);
              }}
              className="flex gap-2"
            >
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add a subtask…"
                aria-label="Add a subtask"
                className="h-8"
              />
              <Button type="submit" variant="secondary" size="sm" loading={pending}>
                <Plus /> Add
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {blockedBy.length > 0 || blocking.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-4 text-[var(--fg-subtle)]" /> Dependencies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blockedBy.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[var(--fg-subtle)] uppercase">
                  Blocked by
                </p>
                {blockedBy.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 py-1">
                    <Link href={`/tasks/${b.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {b.title}
                    </Link>
                    <StatusBadge status={b.status} />
                    {canWrite ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove dependency"
                        onClick={async () => {
                          const result = await removeDependencyAction(taskId, b.id);
                          if (result.ok) router.refresh();
                          else toast.error(result.error);
                        }}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {blocking.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[var(--fg-subtle)] uppercase">Blocking</p>
                {blocking.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 py-1">
                    <Link href={`/tasks/${b.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {b.title}
                    </Link>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
