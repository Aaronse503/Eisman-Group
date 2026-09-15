'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Handshake, Save } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { partnershipSchema } from '@/lib/validation/growth';
import { createPartnershipAction, updatePartnershipAction } from '@/server/actions/growth';
import {
  CONTRACT_STATUSES, PARTNERSHIP_CATEGORIES, PARTNERSHIP_STAGES,
} from '@/lib/domain/growth';
import { CURRENCIES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof partnershipSchema>;
type Parsed = z.output<typeof partnershipSchema>;

export function PartnershipForm({
  partnershipId,
  defaults,
  options,
  initialContactIds = [],
}: {
  partnershipId?: string;
  defaults?: Partial<Values>;
  options: {
    companies: { id: string; name: string }[];
    organizations: { id: string; name: string; company_id: string }[];
    contacts: { id: string; name: string; company_id: string }[];
    users: { id: string; name: string }[];
  };
  initialContactIds?: string[];
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [contactIds, setContactIds] = React.useState<string[]>(initialContactIds);
  const editing = Boolean(partnershipId);

  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(partnershipSchema),
    defaultValues: {
      companyId: options.companies[0]?.id ?? '',
      name: '',
      category: 'other',
      stage: 'identified',
      contractStatus: 'none',
      currency: 'USD',
      probability: 20,
      estimatedValue: 0,
      ...defaults,
    },
  });

  const companyId = watch('companyId');
  const category = watch('category');
  const needsEquipment = ['golf_course', 'pro_shop', 'retailer', 'distributor'].includes(category ?? '');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Parsed = { ...values, contactIds };
    const result = editing
      ? await updatePartnershipAction(partnershipId!, payload)
      : await createPartnershipAction(payload);
    if (result.ok) {
      toast.success(editing ? 'Partnership updated' : 'Partnership added');
      router.push(`/partnerships/${result.data.id}`);
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

      <FormSection title="Partnership">
        <FormGrid>
          <Field label="Name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" autoFocus {...register('name')} />
          </Field>
          <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
            <NativeSelect id="companyId" disabled={editing} {...register('companyId')}>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Category" htmlFor="category" error={errors.category?.message}>
            <NativeSelect id="category" {...register('category')}>
              {PARTNERSHIP_CATEGORIES.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Stage" htmlFor="stage" error={errors.stage?.message}>
            <NativeSelect id="stage" {...register('stage')}>
              {PARTNERSHIP_STAGES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Organization" htmlFor="organizationId" error={errors.organizationId?.message}>
            <NativeSelect id="organizationId" {...register('organizationId')}>
              <option value="none">—</option>
              {options.organizations.filter((o) => o.company_id === companyId).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Owner" htmlFor="ownerUserId" error={errors.ownerUserId?.message}>
            <NativeSelect id="ownerUserId" {...register('ownerUserId')}>
              <option value="none">Unassigned</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Commercials">
        <FormGrid>
          <Field label="Estimated value" htmlFor="estimatedValue" error={errors.estimatedValue?.message}>
            <Input id="estimatedValue" type="number" step="0.01" min="0" {...register('estimatedValue')} />
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
          <Field label="Contract status" htmlFor="contractStatus" error={errors.contractStatus?.message}>
            <NativeSelect id="contractStatus" {...register('contractStatus')}>
              {CONTRACT_STATUSES.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Revenue share"
            htmlFor="revenueShare"
            error={errors.revenueShare?.message}
            hint="e.g. 15% of marketplace GMV originating at the location"
            span
          >
            <Input id="revenueShare" {...register('revenueShare')} />
          </Field>
          <Field label="Launch date" htmlFor="launchDate" error={errors.launchDate?.message}>
            <Input id="launchDate" type="date" {...register('launchDate')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Delivery">
        <FormGrid>
          <Field label="Pilot location" htmlFor="pilotLocation" error={errors.pilotLocation?.message}>
            <Input id="pilotLocation" {...register('pilotLocation')} />
          </Field>
          <Field
            label="Equipment requirements"
            htmlFor="equipmentRequirements"
            error={errors.equipmentRequirements?.message}
            hint={needsEquipment ? 'Scanner units, tablets, staff training.' : undefined}
            span
          >
            <Textarea id="equipmentRequirements" rows={2} {...register('equipmentRequirements')} />
          </Field>
          <Field label="Next action" htmlFor="nextAction" error={errors.nextAction?.message}>
            <Input id="nextAction" {...register('nextAction')} />
          </Field>
          <Field label="Next action date" htmlFor="nextActionDate" error={errors.nextActionDate?.message}>
            <Input id="nextActionDate" type="date" {...register('nextActionDate')} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message} span>
            <Textarea id="notes" rows={4} {...register('notes')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Key contacts">
        <div className="space-y-2">
          <NativeSelect
            aria-label="Add a contact"
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
            <div className="flex flex-wrap gap-1.5">
              {contactIds.map((id, i) => {
                const contact = options.contacts.find((c) => c.id === id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setContactIds((prev) => prev.filter((x) => x !== id))}
                    className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent-soft-fg)]"
                  >
                    {contact?.name ?? id}
                    {i === 0 ? ' (primary)' : ''} ✕
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--fg-subtle)]">
              The first contact you add becomes the primary contact.
            </p>
          )}
        </div>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={partnershipId ? `/partnerships/${partnershipId}` : '/partnerships'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <Handshake />}
          {editing ? 'Save changes' : 'Add partnership'}
        </Button>
      </FormActions>
    </form>
  );
}
