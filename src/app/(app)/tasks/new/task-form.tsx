'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CircleCheckBig, Save } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/misc';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { taskSchema } from '@/lib/validation/tasks';
import { createTaskAction, updateTaskAction } from '@/server/actions/tasks';
import { RECURRENCE_PRESETS, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/domain/tasks';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof taskSchema>;
type Parsed = z.output<typeof taskSchema>;

export function TaskForm({
  taskId,
  defaults,
  options,
}: {
  taskId?: string;
  defaults?: Partial<Values>;
  options: {
    companies: { id: string; name: string }[];
    users: { id: string; name: string }[];
    clients: { id: string; name: string; company_id: string }[];
    projects: { id: string; name: string; company_id: string }[];
  };
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isPersonal, setIsPersonal] = React.useState(Boolean(defaults?.isPersonal));
  const editing = Boolean(taskId);

  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      companyId: options.companies[0]?.id ?? '',
      title: '',
      status: 'todo',
      priority: 'normal',
      ...defaults,
    },
  });

  const companyId = watch('companyId');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload = { ...values, isPersonal };
    const result = editing ? await updateTaskAction(taskId!, payload) : await createTaskAction(payload);
    if (result.ok) {
      toast.success(editing ? 'Task updated' : 'Task created');
      router.push(`/tasks/${result.data.id}`);
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

      <FormSection title="Task">
        <div className="space-y-4">
          <Field label="Title" htmlFor="title" required error={errors.title?.message}>
            <Input id="title" autoFocus aria-invalid={!!errors.title} {...register('title')} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={4} {...register('description')} />
          </Field>
          <FormGrid>
            <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
              <NativeSelect id="companyId" disabled={editing} {...register('companyId')}>
                {options.companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Assignee" htmlFor="assigneeUserId" error={errors.assigneeUserId?.message}>
              <NativeSelect id="assigneeUserId" {...register('assigneeUserId')}>
                <option value="none">Unassigned</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Status" htmlFor="status" error={errors.status?.message}>
              <NativeSelect id="status" {...register('status')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" htmlFor="priority" error={errors.priority?.message}>
              <NativeSelect id="priority" {...register('priority')}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{titleCase(p)}</option>
                ))}
              </NativeSelect>
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      <FormSection title="Scheduling">
        <FormGrid>
          <Field label="Start" htmlFor="startAt" error={errors.startAt?.message}>
            <Input id="startAt" type="datetime-local" {...register('startAt')} />
          </Field>
          <Field label="Due" htmlFor="dueAt" error={errors.dueAt?.message}>
            <Input id="dueAt" type="datetime-local" {...register('dueAt')} />
          </Field>
          <Field label="Estimate (hours)" htmlFor="estimateHours" error={errors.estimateHours?.message}>
            <Input id="estimateHours" type="number" step="0.25" min="0" {...register('estimateHours')} />
          </Field>
          <Field
            label="Repeats"
            htmlFor="recurrenceRule"
            error={errors.recurrenceRule?.message}
            hint="A new occurrence is created when this one is completed."
          >
            <NativeSelect id="recurrenceRule" {...register('recurrenceRule')}>
              {RECURRENCE_PRESETS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Context">
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
          <Field
            label="Waiting on"
            htmlFor="waitingOn"
            error={errors.waitingOn?.message}
            hint="Who or what is blocking this."
          >
            <Input id="waitingOn" {...register('waitingOn')} />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={isPersonal} onCheckedChange={(v) => setIsPersonal(!!v)} />
              <Label htmlFor="isPersonal" className="cursor-pointer">
                Personal executive task
              </Label>
            </label>
          </div>
        </FormGrid>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={taskId ? `/tasks/${taskId}` : '/tasks'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <CircleCheckBig />}
          {editing ? 'Save changes' : 'Create task'}
        </Button>
      </FormActions>
    </form>
  );
}
