'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import {
  addActionItemAction, convertActionItemToTaskAction, toggleActionItemAction,
} from '@/server/actions/meetings';

export interface ActionItem {
  id: string;
  text: string;
  due_date: string | null;
  done: boolean;
  owner_user_id: string | null;
  owner_name: string | null;
  task_id: string | null;
}

export function ActionItems({
  meetingId,
  items,
  users,
  canWrite,
  canCreateTasks,
}: {
  meetingId: string;
  items: ActionItem[];
  users: { id: string; name: string }[];
  canWrite: boolean;
  canCreateTasks: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [ownerUserId, setOwnerUserId] = React.useState('none');
  const [dueDate, setDueDate] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await addActionItemAction({ meetingId, text, ownerUserId, dueDate });
    setPending(false);
    if (result.ok) {
      setText('');
      setDueDate('');
      setOpen(false);
      toast.success('Action item added');
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          Action items
          {items.length ? (
            <Badge tone="outline" className="ml-2">
              {items.filter((i) => !i.done).length} open
            </Badge>
          ) : null}
        </CardTitle>
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Plus />} {open ? 'Cancel' : 'Add'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {open ? (
          <form onSubmit={submit} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto_auto]">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs to happen?"
              required
              aria-label="Action item"
              className="sm:col-span-3"
            />
            <NativeSelect
              aria-label="Owner"
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
            >
              <option value="none">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
            <Button type="submit" variant="primary" loading={pending} disabled={!text.trim()}>
              Add
            </Button>
          </form>
        ) : null}

        {items.length === 0 && !open ? (
          <EmptyState
            title="No action items"
            description="Capture what was agreed; each one can become a task."
            className="border-0 py-8"
          />
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2.5">
              <Checkbox
                checked={item.done}
                disabled={!canWrite}
                aria-label={item.done ? 'Reopen action item' : 'Complete action item'}
                onCheckedChange={async () => {
                  const result = await toggleActionItemAction(item.id);
                  if (result.ok) router.refresh();
                  else toast.error(result.error);
                }}
              />
              <span className={cn('min-w-0 flex-1 text-sm', item.done && 'text-[var(--fg-subtle)] line-through')}>
                {item.text}
              </span>
              {item.owner_name ? <Badge tone="outline">{item.owner_name}</Badge> : null}
              {item.due_date ? <Badge tone="neutral">{fmtDate(item.due_date, 'MMM d')}</Badge> : null}
              {item.task_id ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/tasks/${item.task_id}`}>
                    Task <ArrowRight />
                  </Link>
                </Button>
              ) : canCreateTasks && canWrite ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const result = await convertActionItemToTaskAction(item.id);
                    if (result.ok) {
                      toast.success('Task created');
                      router.refresh();
                    } else toast.error(result.error);
                  }}
                >
                  Make a task
                </Button>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
