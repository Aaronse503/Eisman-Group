'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Handshake } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { dealSchema } from '@/lib/validation/crm';
import { createDealAction } from '@/server/actions/crm';
import { CURRENCIES, DEAL_STAGES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof dealSchema>;
type Parsed = z.output<typeof dealSchema>;

export function DealForm({
  companies,
  clients,
  organizations,
  contacts,
  users,
  defaults,
}: {
  companies: { id: string; name: string }[];
  clients: { id: string; name: string; company_id: string }[];
  organizations: { id: string; name: string; company_id: string }[];
  contacts: { id: string; name: string; company_id: string }[];
  users: { id: string; name: string }[];
  defaults?: Partial<Values>;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      companyId: companies[0]?.id ?? '',
      name: '',
      stage: 'discovery',
      value: 0,
      probability: 20,
      currency: 'USD',
      ...defaults,
    },
  });

  const companyId = watch('companyId');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await createDealAction(values);
    if (result.ok) {
      toast.success('Deal created');
      router.push('/crm/deals');
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
      <FormSection title="Deal">
        <FormGrid>
          <Field label="Name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" autoFocus {...register('name')} />
          </Field>
          <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
            <NativeSelect id="companyId" {...register('companyId')}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Stage" htmlFor="stage" error={errors.stage?.message}>
            <NativeSelect id="stage" {...register('stage')}>
              {DEAL_STAGES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Owner" htmlFor="ownerUserId" error={errors.ownerUserId?.message}>
            <NativeSelect id="ownerUserId" {...register('ownerUserId')}>
              <option value="none">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Value" htmlFor="value" error={errors.value?.message}>
            <Input id="value" type="number" step="0.01" min="0" {...register('value')} />
          </Field>
          <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
            <NativeSelect id="currency" {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Probability (%)" htmlFor="probability" error={errors.probability?.message}>
            <Input id="probability" type="number" min="0" max="100" {...register('probability')} />
          </Field>
          <Field label="Expected close" htmlFor="expectedClose" error={errors.expectedClose?.message}>
            <Input id="expectedClose" type="date" {...register('expectedClose')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Who it's with">
        <FormGrid>
          <Field label="Client" htmlFor="clientId" error={errors.clientId?.message}>
            <NativeSelect id="clientId" {...register('clientId')}>
              <option value="none">—</option>
              {clients.filter((c) => c.company_id === companyId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Organization" htmlFor="organizationId" error={errors.organizationId?.message}>
            <NativeSelect id="organizationId" {...register('organizationId')}>
              <option value="none">—</option>
              {organizations.filter((o) => o.company_id === companyId).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Primary contact" htmlFor="primaryContactId" error={errors.primaryContactId?.message}>
            <NativeSelect id="primaryContactId" {...register('primaryContactId')}>
              <option value="none">—</option>
              {contacts.filter((c) => c.company_id === companyId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Source" htmlFor="source" error={errors.source?.message} hint="Referral, inbound, event…">
            <Input id="source" {...register('source')} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message} span>
            <Textarea id="notes" rows={3} {...register('notes')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href="/crm/deals">Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          <Handshake /> Create deal
        </Button>
      </FormActions>
    </form>
  );
}
