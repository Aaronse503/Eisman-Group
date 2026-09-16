'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { Field, FormGrid } from '@/components/form';
import { fmtDate, fmtRelative } from '@/lib/dates';
import { titleCase } from '@/lib/utils';
import { recordSupportIssueAction, setSupportIssueStatusAction } from '@/server/actions/parfax';

interface Issue {
  id: string; subject: string; description: string | null; status: string; priority: string;
  category: string | null; opened_at: Date; resolved_at: Date | null;
  user_email: string | null; parfax_user_id: string | null; assigned_to: string | null;
}

const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;

export function SupportBoard({ issues, canAdmin }: { issues: Issue[]; canAdmin: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState('open');
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({ subject: '', description: '', priority: 'normal', category: '' });

  const filtered = React.useMemo(
    () =>
      filter === 'all'
        ? issues
        : filter === 'open'
          ? issues.filter((i) => ['open', 'in_progress', 'waiting'].includes(i.status))
          : issues.filter((i) => i.status === filter),
    [issues, filter],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <NativeSelect
          aria-label="Filter issues"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-[11rem]"
        >
          <option value="open">Open issues</option>
          <option value="all">All issues</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </NativeSelect>
        {canAdmin ? (
          <Button variant="primary" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Plus />} Log an issue
          </Button>
        ) : null}
      </div>

      {open ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Log a support issue</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                const result = await recordSupportIssueAction(form);
                setPending(false);
                if (result.ok) {
                  toast.success('Issue logged');
                  setForm({ subject: '', description: '', priority: 'normal', category: '' });
                  setOpen(false);
                  router.refresh();
                } else toast.error(result.error);
              }}
              className="space-y-4"
            >
              <FormGrid>
                <Field label="Subject" htmlFor="subject" required span>
                  <Input
                    id="subject"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Priority" htmlFor="priority">
                  <NativeSelect
                    id="priority"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {['low', 'normal', 'high', 'urgent'].map((p) => (
                      <option key={p} value={p}>{titleCase(p)}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Category" htmlFor="category">
                  <Input
                    id="category"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="scanning, billing, account…"
                  />
                </Field>
                <Field label="Description" htmlFor="description" span>
                  <Textarea
                    id="description"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </Field>
              </FormGrid>
              <Button type="submit" variant="primary" loading={pending}>
                Log issue
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="Nothing here" description="No issues match this filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((issue) => (
            <Card key={issue.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{issue.subject}</p>
                  {issue.description ? (
                    <p className="mt-0.5 line-clamp-2 text-sm text-[var(--fg-muted)]">{issue.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                    {issue.parfax_user_id ? (
                      <Link href={`/parfax/users/${issue.parfax_user_id}`} className="text-[var(--accent)] hover:underline">
                        {issue.user_email}
                      </Link>
                    ) : (
                      'No account linked'
                    )}
                    {' · opened '}
                    {fmtDate(issue.opened_at)}
                    {issue.assigned_to ? ` · ${issue.assigned_to}` : ''}
                    {issue.resolved_at ? ` · resolved ${fmtRelative(issue.resolved_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {issue.category ? <Badge tone="outline">{titleCase(issue.category)}</Badge> : null}
                  <Badge tone={issue.priority === 'urgent' ? 'danger' : issue.priority === 'high' ? 'warning' : 'neutral'}>
                    {titleCase(issue.priority)}
                  </Badge>
                  {canAdmin ? (
                    <NativeSelect
                      aria-label={`Status for ${issue.subject}`}
                      value={issue.status}
                      className="h-8 w-[9.5rem]"
                      onChange={async (e) => {
                        const result = await setSupportIssueStatusAction(
                          issue.id,
                          e.target.value as 'open',
                        );
                        if (result.ok) {
                          toast.success('Status updated');
                          router.refresh();
                        } else toast.error(result.error);
                      }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{titleCase(s)}</option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <StatusBadge status={issue.status} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
