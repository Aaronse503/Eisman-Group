'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CalendarPlus, Save, Sparkles } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { meetingSchema } from '@/lib/validation/meetings';
import { createMeetingAction, updateMeetingAction } from '@/server/actions/meetings';
import { MEETING_STATUSES, MEETING_TEMPLATES, templateAgenda } from '@/lib/domain/meetings';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof meetingSchema>;
type Parsed = z.output<typeof meetingSchema>;

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'UTC',
];

export function MeetingForm({
  meetingId,
  defaults,
  options,
  initialParticipants,
  synced,
}: {
  meetingId?: string;
  defaults?: Partial<Values>;
  options: {
    companies: { id: string; name: string }[];
    users: { id: string; name: string }[];
    clients: { id: string; name: string; company_id: string }[];
    contacts: { id: string; name: string; company_id: string }[];
    projects: { id: string; name: string; company_id: string }[];
  };
  initialParticipants?: { userIds: string[]; contactIds: string[] };
  synced?: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [userIds, setUserIds] = React.useState<string[]>(initialParticipants?.userIds ?? []);
  const [contactIds, setContactIds] = React.useState<string[]>(initialParticipants?.contactIds ?? []);
  const editing = Boolean(meetingId);

  const {
    register, handleSubmit, setError, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      companyId: options.companies[0]?.id ?? '',
      title: '',
      template: 'general',
      status: 'scheduled',
      timezone: 'America/New_York',
      startsAt: '',
      endsAt: '',
      ...defaults,
    },
  });

  const companyId = watch('companyId');
  const template = watch('template');
  const agenda = watch('agenda');

  const applyTemplate = () => {
    const text = templateAgenda(template ?? 'general');
    if (!text) return;
    setValue('agenda', agenda ? `${agenda}\n\n${text}` : text);
    toast.success('Agenda template applied');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Parsed = { ...values, participantUserIds: userIds, participantContactIds: contactIds };
    const result = editing
      ? await updateMeetingAction(meetingId!, payload)
      : await createMeetingAction(payload);
    if (result.ok) {
      toast.success(editing ? 'Meeting updated' : 'Meeting scheduled');
      router.push(`/calendar/${result.data.id}`);
      router.refresh();
      return;
    }
    setFormError(result.error);
    for (const [field, message] of Object.entries(result.fields ?? {})) {
      setError(field as keyof Values, { message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
      <FormError message={formError} />

      {synced ? (
        <div className="rounded-lg border border-[var(--info)]/40 bg-[var(--info-bg)] px-3 py-2.5 text-sm">
          This event is synced from an external calendar. Times, title and attendees are owned there
          and will be overwritten on the next sync — only the agenda, notes, decisions and
          associations you set here are kept.
        </div>
      ) : null}

      <FormSection title="Meeting">
        <FormGrid>
          <Field label="Title" htmlFor="title" required error={errors.title?.message} span>
            <Input id="title" autoFocus disabled={synced} {...register('title')} />
          </Field>
          <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
            <NativeSelect id="companyId" disabled={editing} {...register('companyId')}>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Type" htmlFor="template" error={errors.template?.message}>
            <NativeSelect id="template" {...register('template')}>
              {MEETING_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Starts" htmlFor="startsAt" required error={errors.startsAt?.message}>
            <Input id="startsAt" type="datetime-local" disabled={synced} {...register('startsAt')} />
          </Field>
          <Field label="Ends" htmlFor="endsAt" required error={errors.endsAt?.message}>
            <Input id="endsAt" type="datetime-local" disabled={synced} {...register('endsAt')} />
          </Field>
          <Field label="Time zone" htmlFor="timezone" error={errors.timezone?.message}>
            <NativeSelect id="timezone" disabled={synced} {...register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status" error={errors.status?.message}>
            <NativeSelect id="status" {...register('status')}>
              {MEETING_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Location" htmlFor="location" error={errors.location?.message}>
            <Input id="location" disabled={synced} placeholder="Google Meet, office, …" {...register('location')} />
          </Field>
          <Field label="Meeting link" htmlFor="meetingUrl" error={errors.meetingUrl?.message}>
            <Input id="meetingUrl" disabled={synced} placeholder="https://" {...register('meetingUrl')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Agenda and notes">
        <div className="space-y-4">
          <Field
            label="Agenda"
            htmlFor="agenda"
            error={errors.agenda?.message}
            hint={
              <button type="button" onClick={applyTemplate} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                <Sparkles className="size-3" /> Insert the {MEETING_TEMPLATES.find((t) => t.id === template)?.label ?? ''} template
              </button>
            }
          >
            <Textarea id="agenda" rows={6} {...register('agenda')} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message} hint="Searchable and used by the knowledge assistant.">
            <Textarea id="notes" rows={5} {...register('notes')} />
          </Field>
          <Field label="Decisions" htmlFor="decisions" error={errors.decisions?.message}>
            <Textarea id="decisions" rows={3} {...register('decisions')} />
          </Field>
          <Field label="Follow-up date" htmlFor="followUpDate" error={errors.followUpDate?.message}>
            <Input id="followUpDate" type="date" {...register('followUpDate')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Who's coming">
        <div className="space-y-4">
          <Field label="Organiser" htmlFor="ownerUserId" error={errors.ownerUserId?.message}>
            <NativeSelect id="ownerUserId" {...register('ownerUserId')}>
              <option value="none">—</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">Team</p>
            <div className="flex flex-wrap gap-2">
              {options.users.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm">
                  <Checkbox
                    disabled={synced}
                    checked={userIds.includes(u.id)}
                    onCheckedChange={(v) =>
                      setUserIds((prev) => (v ? [...prev, u.id] : prev.filter((x) => x !== u.id)))
                    }
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">External contacts</p>
            <NativeSelect
              aria-label="Add a contact"
              disabled={synced}
              value=""
              onChange={(e) => {
                if (e.target.value) setContactIds((prev) => [...new Set([...prev, e.target.value])]);
              }}
            >
              <option value="">Add a contact…</option>
              {options.contacts
                .filter((c) => c.company_id === companyId && !contactIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </NativeSelect>
            {contactIds.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {contactIds.map((id) => {
                  const contact = options.contacts.find((c) => c.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setContactIds((prev) => prev.filter((x) => x !== id))}
                      className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent-soft-fg)]"
                    >
                      {contact?.name ?? id} ✕
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </FormSection>

      <FormSection title="Link to">
        <FormGrid>
          <Field label="Client" htmlFor="clientId" error={errors.clientId?.message}>
            <NativeSelect id="clientId" {...register('clientId')}>
              <option value="none">—</option>
              {options.clients.filter((c) => c.company_id === companyId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Project" htmlFor="projectId" error={errors.projectId?.message}>
            <NativeSelect id="projectId" {...register('projectId')}>
              <option value="none">—</option>
              {options.projects.filter((p) => p.company_id === companyId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={meetingId ? `/calendar/${meetingId}` : '/calendar'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <CalendarPlus />}
          {editing ? 'Save changes' : 'Schedule meeting'}
        </Button>
      </FormActions>
    </form>
  );
}
