'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, UserPlus } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { memberSchema } from '@/lib/validation/team';
import { createMemberAction, updateMemberAction } from '@/server/actions/team';
import { CURRENCIES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof memberSchema>;
type Parsed = z.output<typeof memberSchema>;

export function MemberForm({
  memberId,
  defaults,
  options,
  canSetPay,
}: {
  memberId?: string;
  defaults?: Partial<Values>;
  options: {
    companies: { id: string; name: string }[];
    departments: { id: string; name: string; company_id: string }[];
    managers: { id: string; full_name: string; company_id: string }[];
    users: { id: string; name: string }[];
  };
  canSetPay: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isVacant, setIsVacant] = React.useState(Boolean(defaults?.isVacant));
  const editing = Boolean(memberId);

  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      companyId: options.companies[0]?.id ?? '',
      fullName: '',
      title: '',
      kind: 'employee',
      employmentType: 'full_time',
      status: 'active',
      currency: 'USD',
      capacityHours: 40,
      ...defaults,
    },
  });

  const companyId = watch('companyId');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload = { ...values, isVacant };
    const result = editing ? await updateMemberAction(memberId!, payload) : await createMemberAction(payload);
    if (result.ok) {
      toast.success(editing ? 'Saved' : 'Added to the team');
      router.push(`/team/${result.data.id}`);
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

      <FormSection title="Person or role">
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
            <Checkbox checked={isVacant} onCheckedChange={(v) => setIsVacant(!!v)} />
            This is an open role, not a person yet
          </label>
          <FormGrid>
            <Field
              label={isVacant ? 'Role label' : 'Full name'}
              htmlFor="fullName"
              required
              error={errors.fullName?.message}
            >
              <Input id="fullName" autoFocus placeholder={isVacant ? 'Performance Media Lead (open)' : ''} {...register('fullName')} />
            </Field>
            <Field label="Job title" htmlFor="title" required error={errors.title?.message}>
              <Input id="title" {...register('title')} />
            </Field>
            <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
              <NativeSelect id="companyId" disabled={editing} {...register('companyId')}>
                {options.companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Type" htmlFor="kind" error={errors.kind?.message}>
              <NativeSelect id="kind" {...register('kind')}>
                {['employee', 'contractor', 'agency', 'advisor'].map((k) => (
                  <option key={k} value={k}>{titleCase(k)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Department" htmlFor="departmentId" error={errors.departmentId?.message}>
              <NativeSelect id="departmentId" {...register('departmentId')}>
                <option value="none">—</option>
                {options.departments.filter((d) => d.company_id === companyId).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </NativeSelect>
            </Field>
            {!editing ? (
              <Field
                label="Reports to"
                htmlFor="managerId"
                error={errors.managerId?.message}
                hint="Changes afterwards go through the audited org chart."
              >
                <NativeSelect id="managerId" {...register('managerId')}>
                  <option value="none">Nobody</option>
                  {options.managers.filter((m) => m.company_id === companyId).map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field label="Status" htmlFor="status" error={errors.status?.message}>
              <NativeSelect id="status" {...register('status')}>
                {['active', 'on_leave', 'offboarding', 'inactive'].map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Linked account"
              htmlFor="userId"
              error={errors.userId?.message}
              hint="Connects this person to a sign-in account."
            >
              <NativeSelect id="userId" {...register('userId')}>
                <option value="none">—</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Role description" htmlFor="roleDescription" error={errors.roleDescription?.message} span>
              <Textarea id="roleDescription" rows={3} {...register('roleDescription')} />
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      {!isVacant ? (
        <FormSection title="Contact">
          <FormGrid>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register('email')} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input id="phone" type="tel" {...register('phone')} />
            </Field>
            <Field label="Location" htmlFor="location" error={errors.location?.message}>
              <Input id="location" {...register('location')} />
            </Field>
          </FormGrid>
        </FormSection>
      ) : null}

      <FormSection
        title="Engagement"
        description={
          canSetPay
            ? 'Pay information is visible only to Finance, Company Admins and the Holdings Owner, and every change is audited.'
            : 'Your role cannot view or set pay information, so those fields are hidden.'
        }
      >
        <FormGrid>
          <Field label="Employment type" htmlFor="employmentType" error={errors.employmentType?.message}>
            <NativeSelect id="employmentType" {...register('employmentType')}>
              {['full_time', 'part_time', 'contract', 'hourly', 'project'].map((t) => (
                <option key={t} value={t}>{titleCase(t)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Capacity (hours per week)" htmlFor="capacityHours" error={errors.capacityHours?.message}>
            <Input id="capacityHours" type="number" min="0" max="168" step="0.5" {...register('capacityHours')} />
          </Field>
          {canSetPay ? (
            <>
              <Field label="Pay rate" htmlFor="payRate" error={errors.payRate?.message}>
                <Input id="payRate" type="number" step="0.01" min="0" {...register('payRate')} />
              </Field>
              <Field label="Per" htmlFor="payRateUnit" error={errors.payRateUnit?.message}>
                <NativeSelect id="payRateUnit" {...register('payRateUnit')}>
                  <option value="">—</option>
                  {['hour', 'day', 'month', 'year', 'project'].map((u) => (
                    <option key={u} value={u}>{titleCase(u)}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Pay schedule" htmlFor="paySchedule" error={errors.paySchedule?.message}>
                <NativeSelect id="paySchedule" {...register('paySchedule')}>
                  <option value="">—</option>
                  {['weekly', 'biweekly', 'semimonthly', 'monthly', 'on_invoice'].map((s) => (
                    <option key={s} value={s}>{titleCase(s)}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
                <NativeSelect id="currency" {...register('currency')}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </NativeSelect>
              </Field>
            </>
          ) : null}
          <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message}>
            <Input id="startDate" type="date" {...register('startDate')} />
          </Field>
          <Field label="End date" htmlFor="endDate" error={errors.endDate?.message}>
            <Input id="endDate" type="date" {...register('endDate')} />
          </Field>
          <Field
            label="Skills"
            htmlFor="skills"
            error={errors.skills?.message}
            hint="Comma separated"
            span
          >
            <Input id="skills" placeholder="Paid Search, Figma, Copywriting" {...register('skills')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={memberId ? `/team/${memberId}` : '/team'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <UserPlus />}
          {editing ? 'Save changes' : 'Add to team'}
        </Button>
      </FormActions>
    </form>
  );
}
