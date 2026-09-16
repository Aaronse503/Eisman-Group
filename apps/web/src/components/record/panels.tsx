'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Bell, FileText, MessageSquare, Paperclip, Pin, Plus, Send, StickyNote, Tag, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label, Avatar, Checkbox } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { fmtDateTime, fmtRelative } from '@/lib/dates';
import { cn, formatNumber, titleCase } from '@/lib/utils';
import {
  addCommentAction, addNoteAction, addReminderAction, deleteCommentAction,
  deleteNoteAction, dismissReminderAction, logOutreachAction, setCustomFieldsAction, setTagsAction,
} from '@/server/actions/records';
import type {
  CustomField, LinkedDocument, OutreachEntry, RecordComment, RecordNote, RecordReminder, RecordTag,
} from '@/lib/queries/records';

interface Target {
  entityType: string;
  entityId: string;
}

export function NotesPanel({
  target,
  notes,
  canWrite,
}: {
  target: Target;
  notes: RecordNote[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [pinned, setPinned] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await addNoteAction({ ...target, title, body, pinned });
    setPending(false);
    if (result.ok) {
      toast.success('Note added');
      setTitle('');
      setBody('');
      setPinned(false);
      setOpen(false);
      router.refresh();
    } else toast.error(result.error);
  };

  const remove = async (id: string) => {
    const result = await deleteNoteAction(id);
    if (result.ok) {
      toast.success('Note deleted');
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <StickyNote className="size-4 text-[var(--fg-subtle)]" /> Notes
          {notes.length ? <Badge tone="outline">{notes.length}</Badge> : null}
        </CardTitle>
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Plus />} {open ? 'Cancel' : 'Add note'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {open ? (
          <form onSubmit={submit} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <Input
              placeholder="Note title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-label="Note title"
            />
            <Textarea
              placeholder="What happened, what was decided, what matters later…"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Note body"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={pinned} onCheckedChange={(v) => setPinned(!!v)} /> Pin to top
              </label>
              <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!title.trim()}>
                Save note
              </Button>
            </div>
          </form>
        ) : null}

        {notes.length === 0 && !open ? (
          <EmptyState
            icon={StickyNote}
            title="No notes yet"
            description="Notes are searchable and feed the knowledge assistant."
            className="border-0 py-8"
          />
        ) : (
          notes.map((note) => (
            <article key={note.id} className="rounded-lg border border-[var(--border)] p-3">
              <header className="flex items-start justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-medium">
                  {note.pinned ? <Pin className="size-3.5 text-[var(--gold)]" /> : null}
                  {note.title}
                </h4>
                <div className="flex shrink-0 items-center gap-1">
                  {note.is_demo ? <Badge tone="gold">Demo</Badge> : null}
                  {canWrite ? (
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(note.id)} aria-label="Delete note">
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </header>
              <p className="mt-1.5 text-sm whitespace-pre-wrap text-[var(--fg-muted)]">{note.body}</p>
              <p className="mt-2 text-xs text-[var(--fg-subtle)]">
                {note.author_name ?? 'Unknown'} · {fmtRelative(note.created_at)}
              </p>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function CommentsPanel({
  target,
  comments,
  currentUserId,
  canWrite,
}: {
  target: Target;
  comments: RecordComment[];
  currentUserId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    const result = await addCommentAction({ ...target, body });
    setPending(false);
    if (result.ok) {
      setBody('');
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4 text-[var(--fg-subtle)]" /> Comments
          {comments.length ? <Badge tone="outline">{comments.length}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={c.user_name ?? '?'} src={c.avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--fg-subtle)]">
                  <span className="font-medium text-[var(--fg)]">{c.user_name ?? 'Unknown'}</span> ·{' '}
                  {fmtRelative(c.created_at)}
                </p>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
              {c.user_id === currentUserId ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete comment"
                  onClick={async () => {
                    const result = await deleteCommentAction(c.id);
                    if (result.ok) router.refresh();
                    else toast.error(result.error);
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))
        )}
        {canWrite ? (
          <form onSubmit={submit} className="flex gap-2">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              aria-label="Add a comment"
            />
            <Button type="submit" variant="secondary" size="icon" loading={pending} aria-label="Post comment">
              <Send />
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TagsPanel({
  target,
  tags,
  available,
  canWrite,
}: {
  target: Target;
  tags: RecordTag[];
  available: RecordTag[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(tags.map((t) => t.name));
  const [input, setInput] = React.useState('');
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => setCurrent(tags.map((t) => t.name)), [tags]);

  const save = async (next: string[]) => {
    setCurrent(next);
    setPending(true);
    const result = await setTagsAction({ ...target, tagNames: next });
    setPending(false);
    if (result.ok) router.refresh();
    else {
      toast.error(result.error);
      setCurrent(tags.map((t) => t.name));
    }
  };

  const suggestions = available.filter((t) => !current.includes(t.name)).slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="size-3.5 text-[var(--fg-subtle)]" aria-hidden />
        {current.length === 0 ? (
          <span className="text-sm text-[var(--fg-subtle)]">No tags</span>
        ) : (
          current.map((name) => {
            const meta = available.find((t) => t.name === name);
            return (
              <Badge key={name} tone="accent" style={meta ? { background: `${meta.color}1f`, color: meta.color } : undefined}>
                {name}
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => save(current.filter((t) => t !== name))}
                    aria-label={`Remove tag ${name}`}
                    className="-mr-0.5 ml-0.5 rounded hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </Badge>
            );
          })
        )}
      </div>
      {canWrite ? (
        <div className="space-y-1.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = input.trim();
              if (!value || current.includes(value)) return;
              save([...current, value]);
              setInput('');
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a tag…"
              className="h-8"
              aria-label="Add a tag"
            />
            <Button type="submit" size="sm" variant="secondary" loading={pending}>
              Add
            </Button>
          </form>
          {suggestions.length ? (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => save([...current, t.name])}
                  className="rounded-full border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-xs text-[var(--fg-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  + {t.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function CustomFieldsPanel({
  target,
  fields,
  canWrite,
}: {
  target: Target;
  fields: CustomField[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.def_id, f.value ?? ''])),
  );
  const [pending, setPending] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.def_id, f.value ?? ''])));
    setDirty(false);
  }, [fields]);

  if (!fields.length) return null;

  const set = (defId: string, value: unknown) => {
    setValues((v) => ({ ...v, [defId]: value }));
    setDirty(true);
  };

  const save = async () => {
    setPending(true);
    const result = await setCustomFieldsAction({ ...target, values });
    setPending(false);
    if (result.ok) {
      toast.success('Fields saved');
      setDirty(false);
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Custom fields</CardTitle>
        {canWrite && dirty ? (
          <Button size="sm" variant="primary" loading={pending} onClick={save}>
            Save
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const id = `cf-${field.def_id}`;
          const value = values[field.def_id];
          return (
            <div key={field.def_id} className="space-y-1.5">
              <Label htmlFor={id} required={field.required}>
                {field.label}
              </Label>
              {field.field_type === 'select' ? (
                <NativeSelect
                  id={id}
                  disabled={!canWrite}
                  value={String(value ?? '')}
                  onChange={(e) => set(field.def_id, e.target.value)}
                >
                  <option value="">—</option>
                  {field.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </NativeSelect>
              ) : field.field_type === 'boolean' ? (
                <label className="flex h-9 items-center gap-2 text-sm">
                  <Checkbox
                    id={id}
                    disabled={!canWrite}
                    checked={Boolean(value)}
                    onCheckedChange={(v) => set(field.def_id, !!v)}
                  />
                  {value ? 'Yes' : 'No'}
                </label>
              ) : field.field_type === 'textarea' ? (
                <Textarea
                  id={id}
                  rows={3}
                  disabled={!canWrite}
                  value={String(value ?? '')}
                  onChange={(e) => set(field.def_id, e.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  type={
                    field.field_type === 'number' || field.field_type === 'currency'
                      ? 'number'
                      : field.field_type === 'date'
                        ? 'date'
                        : field.field_type === 'email'
                          ? 'email'
                          : field.field_type === 'url'
                            ? 'url'
                            : 'text'
                  }
                  disabled={!canWrite}
                  value={String(value ?? '')}
                  onChange={(e) => set(field.def_id, e.target.value)}
                />
              )}
              {field.help_text ? (
                <p className="text-xs text-[var(--fg-subtle)]">{field.help_text}</p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function AttachmentsPanel({
  documents,
  uploadHref,
  canWrite,
}: {
  documents: LinkedDocument[];
  uploadHref: string;
  canWrite: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-4 text-[var(--fg-subtle)]" /> Attachments
          {documents.length ? <Badge tone="outline">{documents.length}</Badge> : null}
        </CardTitle>
        {canWrite ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={uploadHref}>
              <Plus /> Upload
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No attachments"
            description="Contracts, decks and reports linked to this record appear here."
            className="border-0 py-8"
          />
        ) : (
          documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/knowledge/documents/${doc.id}`}
              className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-[var(--fg-subtle)]" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{doc.name}</span>
                  {doc.is_demo ? <Badge tone="gold" className="shrink-0 px-1.5 py-0 text-[10px]">Demo</Badge> : null}
                </span>
                {doc.summary ? (
                  <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--fg-muted)]">{doc.summary}</span>
                ) : null}
                <span className="mt-0.5 block text-[11px] text-[var(--fg-subtle)]">
                  {doc.uploaded_by ?? 'Unknown'} · {fmtRelative(doc.created_at)}
                  {doc.byte_size ? ` · ${formatNumber(Math.round(doc.byte_size / 1024))} KB` : ''}
                </span>
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function RemindersPanel({
  target,
  reminders,
  canWrite,
}: {
  target: Target;
  reminders: RecordReminder[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [remindAt, setRemindAt] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await addReminderAction({ ...target, title, remindAt });
    setPending(false);
    if (result.ok) {
      toast.success('Reminder scheduled');
      setTitle('');
      setRemindAt('');
      setOpen(false);
      router.refresh();
    } else toast.error(result.error);
  };

  const pending_ = reminders.filter((r) => r.status === 'pending');

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-[var(--fg-subtle)]" /> Reminders
          {pending_.length ? <Badge tone="outline">{pending_.length}</Badge> : null}
        </CardTitle>
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Plus />} {open ? 'Cancel' : 'Add'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {open ? (
          <form onSubmit={submit} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <Input
              placeholder="Remind me to…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-label="Reminder title"
            />
            <Input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              required
              aria-label="Remind at"
            />
            <Button type="submit" size="sm" variant="primary" loading={pending} className="w-full">
              Schedule
            </Button>
          </form>
        ) : null}
        {reminders.length === 0 && !open ? (
          <p className="text-sm text-[var(--fg-muted)]">No reminders set.</p>
        ) : (
          reminders.map((r) => (
            <div
              key={r.id}
              className={cn(
                'flex items-start justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5',
                r.status !== 'pending' && 'opacity-60',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="text-xs text-[var(--fg-subtle)]">
                  {fmtDateTime(r.remind_at)}
                  {r.user_name ? ` · ${r.user_name}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <StatusBadge status={r.status} />
                {canWrite && r.status === 'pending' ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Dismiss reminder"
                    onClick={async () => {
                      const result = await dismissReminderAction(r.id);
                      if (result.ok) router.refresh();
                    }}
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

const OUTREACH_KINDS = ['email', 'call', 'meeting', 'linkedin', 'text', 'note', 'intro', 'material_sent'] as const;

export function OutreachPanel({
  target,
  entries,
  canWrite,
  title = 'Interaction timeline',
}: {
  target: Target;
  entries: OutreachEntry[];
  canWrite: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ kind: 'email', direction: 'outbound', subject: '', body: '', outcome: '', occurredAt: '' });
  const [pending, setPending] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await logOutreachAction({ ...target, ...form });
    setPending(false);
    if (result.ok) {
      toast.success('Interaction logged');
      setForm({ kind: 'email', direction: 'outbound', subject: '', body: '', outcome: '', occurredAt: '' });
      setOpen(false);
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Plus />} {open ? 'Cancel' : 'Log interaction'}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {open ? (
          <form onSubmit={submit} className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2">
            <NativeSelect
              aria-label="Interaction type"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              {OUTREACH_KINDS.map((k) => (
                <option key={k} value={k}>{titleCase(k)}</option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Direction"
              value={form.direction}
              onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
              <option value="internal">Internal</option>
            </NativeSelect>
            <Input
              className="sm:col-span-2"
              placeholder="Subject"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              aria-label="Subject"
            />
            <Textarea
              className="sm:col-span-2"
              rows={3}
              placeholder="What was said or sent"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              aria-label="Details"
            />
            <Input
              placeholder="Outcome"
              value={form.outcome}
              onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
              aria-label="Outcome"
            />
            <Input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
              aria-label="When it happened"
            />
            <Button type="submit" variant="primary" size="sm" loading={pending} className="sm:col-span-2">
              Log it
            </Button>
          </form>
        ) : null}

        {entries.length === 0 && !open ? (
          <EmptyState
            title="No interactions logged"
            description="Calls, emails and meetings you record build the relationship history."
            className="border-0 py-8"
          />
        ) : (
          <ol className="relative space-y-4 border-l border-[var(--border)] pl-5">
            {entries.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-[var(--accent)] ring-4 ring-[var(--surface)]"
                  aria-hidden
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="outline">{titleCase(entry.kind)}</Badge>
                  <Badge tone={entry.direction === 'inbound' ? 'success' : 'neutral'}>
                    {titleCase(entry.direction)}
                  </Badge>
                  <span className="text-xs text-[var(--fg-subtle)]">{fmtDateTime(entry.occurred_at)}</span>
                </div>
                {entry.subject ? <p className="mt-1 text-sm font-medium">{entry.subject}</p> : null}
                {entry.body ? (
                  <p className="text-sm whitespace-pre-wrap text-[var(--fg-muted)]">{entry.body}</p>
                ) : null}
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {entry.user_name ?? 'Unknown'}
                  {entry.contact_name?.trim() ? ` · with ${entry.contact_name}` : ''}
                  {entry.outcome ? ` · ${entry.outcome}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityTimeline({
  entries,
}: {
  entries: { id: string; summary: string; action: string; actor_name: string | null; created_at: Date | string }[];
}) {
  if (!entries.length) {
    return (
      <EmptyState
        title="No activity yet"
        description="Changes to this record will be listed here."
        className="border-0 py-8"
      />
    );
  }
  return (
    <ol className="relative space-y-3 border-l border-[var(--border)] pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-[var(--border-strong)] ring-4 ring-[var(--surface)]"
            aria-hidden
          />
          <p className="text-sm">{entry.summary}</p>
          <p className="text-xs text-[var(--fg-subtle)]">
            {entry.actor_name ?? 'System'} · {fmtRelative(entry.created_at as Date)} · {titleCase(entry.action)}
          </p>
        </li>
      ))}
    </ol>
  );
}
