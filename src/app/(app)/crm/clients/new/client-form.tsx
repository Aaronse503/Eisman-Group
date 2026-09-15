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
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { clientSchema } from '@/lib/validation/crm';
import { createClientAction, updateClientAction } from '@/server/actions/crm';
import { CLIENT_STAGES, CLIENT_STATUSES, CURRENCIES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof clientSchema>;
type Parsed = z.output<typeof clientSchema>;

export interface ClientFormOptions {
  companies: { id: string; name: string }[];
  organizations: { id: string; name: string; company_id: string }[];
  users: { id: string; name: string }[];
}

export function ClientForm({
  clientId,
  defaults,
  options,
}: {
  clientId?: string;
  defaults?: Partial<Values>;
  options: ClientFormOptions;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const editing = Boolean(clientId);

  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      companyId: options.companies[0]?.id ?? '',
      name: '',
      status: 'prospect',
      stage: 'new',
      currency: 'USD',
      healthScore: 70,
      billingStatus: 'current',
      monthlyRetainer: 0,
      contractValue: 0,
      ...defaults,
    },
  });

  const companyId = watch('companyId');
  const orgs = options.organizations.filter((o) => o.company_id === companyId);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = editing
      ? await updateClientAction(clientId!, values)
      : await createClientAction(values);
    if (result.ok) {
      toast.success(editing ? 'Client updated' : `${values.name} added`);
      router.push(`/crm/clients/${result.data.id}`);
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

      <FormSection title="Account">
        <FormGrid>
          <Field label="Client name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
            <NativeSelect id="companyId" disabled={editing} {...register('companyId')}>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status" error={errors.status?.message}>
            <NativeSelect id="status" {...register('status')}>
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Stage" htmlFor="stage" error={errors.stage?.message}>
            <NativeSelect id="stage" {...register('stage')}>
              {CLIENT_STAGES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Organization" htmlFor="organizationId" error={errors.organizationId?.message} hint="Link to an organization record for shared contacts.">
            <NativeSelect id="organizationId" {...register('organizationId')}>
              <option value="none">—</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Account owner" htmlFor="accountOwnerId" error={errors.accountOwnerId?.message}>
            <NativeSelect id="accountOwnerId" {...register('accountOwnerId')}>
              <option value="none">Unassigned</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Website" htmlFor="website" error={errors.website?.message}>
            <Input id="website" placeholder="https://" {...register('website')} />
          </Field>
          <Field label="LinkedIn" htmlFor="linkedin" error={errors.linkedin?.message}>
            <Input id="linkedin" placeholder="https://linkedin.com/company/…" {...register('linkedin')} />
          </Field>
          <Field
            label="Services"
            htmlFor="services"
            error={errors.services?.message}
            hint="Comma separated, e.g. Paid Media, SEO, Content"
            span
          >
            <Input id="services" placeholder="Paid Media, SEO" {...register('services')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Commercials">
        <FormGrid>
          <Field label="Monthly retainer" htmlFor="monthlyRetainer" error={errors.monthlyRetainer?.message}>
            <Input id="monthlyRetainer" type="number" step="0.01" min="0" {...register('monthlyRetainer')} />
          </Field>
          <Field label="Total contract value" htmlFor="contractValue" error={errors.contractValue?.message}>
            <Input id="contractValue" type="number" step="0.01" min="0" {...register('contractValue')} />
          </Field>
          <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
            <NativeSelect id="currency" {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Billing status" htmlFor="billingStatus" error={errors.billingStatus?.message}>
            <NativeSelect id="billingStatus" {...register('billingStatus')}>
              {['current', 'pending', 'overdue', 'on_hold', 'not_billed'].map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Contract start" htmlFor="contractStart" error={errors.contractStart?.message}>
            <Input id="contractStart" type="date" {...register('contractStart')} />
          </Field>
          <Field label="Contract end" htmlFor="contractEnd" error={errors.contractEnd?.message}>
            <Input id="contractEnd" type="date" {...register('contractEnd')} />
          </Field>
          <Field label="Renewal date" htmlFor="renewalDate" error={errors.renewalDate?.message}>
            <Input id="renewalDate" type="date" {...register('renewalDate')} />
          </Field>
          <Field
            label="Health score"
            htmlFor="healthScore"
            error={errors.healthScore?.message}
            hint="0–100. Below 60 flags the account as at risk."
          >
            <Input id="healthScore" type="number" min="0" max="100" {...register('healthScore')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Engagement" description="What success looks like and what could get in the way.">
        <div className="space-y-4">
          <Field label="Goals" htmlFor="goals" error={errors.goals?.message}>
            <Textarea id="goals" rows={2} {...register('goals')} />
          </Field>
          <Field label="Deliverables" htmlFor="deliverables" error={errors.deliverables?.message}>
            <Textarea id="deliverables" rows={2} {...register('deliverables')} />
          </Field>
          <Field label="KPIs" htmlFor="kpis" error={errors.kpis?.message}>
            <Textarea id="kpis" rows={2} {...register('kpis')} />
          </Field>
          <Field label="Risks" htmlFor="risks" error={errors.risks?.message}>
            <Textarea id="risks" rows={2} {...register('risks')} />
          </Field>
          <FormGrid>
            <Field label="Next action" htmlFor="nextAction" error={errors.nextAction?.message}>
              <Input id="nextAction" {...register('nextAction')} />
            </Field>
            <Field label="Next action date" htmlFor="nextActionDate" error={errors.nextActionDate?.message}>
              <Input id="nextActionDate" type="date" {...register('nextActionDate')} />
            </Field>
          </FormGrid>
        </div>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={clientId ? `/crm/clients/${clientId}` : '/crm'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <UserPlus />}
          {editing ? 'Save changes' : 'Add client'}
        </Button>
      </FormActions>
    </form>
  );
}
