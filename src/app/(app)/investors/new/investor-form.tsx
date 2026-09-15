'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, TrendingUp } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { investorSchema } from '@/lib/validation/growth';
import { createInvestorAction, updateInvestorAction } from '@/server/actions/growth';
import {
  FUNDING_STAGES, INTEREST_LEVELS, INVESTOR_STAGES, INVESTOR_TYPES,
  INVESTOR_TYPE_LABELS, OUTREACH_STATUSES, STAGE_PROBABILITY, type InvestorStage,
} from '@/lib/domain/growth';
import { CURRENCIES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof investorSchema>;
type Parsed = z.output<typeof investorSchema>;

export function InvestorForm({
  investorId,
  defaults,
  options,
  initialContactIds = [],
}: {
  investorId?: string;
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
  const [dataRoom, setDataRoom] = React.useState(Boolean(defaults?.dataRoomAccess));
  const [stagePrefs, setStagePrefs] = React.useState<string[]>(
    typeof defaults?.stagePreferences === 'string'
      ? defaults.stagePreferences.split(',').map((s) => s.trim()).filter(Boolean)
      : ((defaults?.stagePreferences as string[]) ?? []),
  );
  const editing = Boolean(investorId);

  const {
    register, handleSubmit, setError, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(investorSchema),
    defaultValues: {
      pitchingCompanyId: options.companies[0]?.id ?? '',
      name: '',
      investorType: 'vc',
      pipelineStage: 'researching',
      outreachStatus: 'not_started',
      interestLevel: 'unknown',
      currency: 'USD',
      probability: 0,
      potentialAmount: 0,
      ...defaults,
    },
  });

  const pitchingCompanyId = watch('pitchingCompanyId');
  const pipelineStage = watch('pipelineStage');

  // Moving stage suggests the standard probability for that stage.
  React.useEffect(() => {
    if (!pipelineStage) return;
    setValue('probability', STAGE_PROBABILITY[pipelineStage as InvestorStage] ?? 0);
  }, [pipelineStage, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Parsed = {
      ...values,
      contactIds,
      dataRoomAccess: dataRoom,
      stagePreferences: stagePrefs,
    };
    const result = editing
      ? await updateInvestorAction(investorId!, payload)
      : await createInvestorAction(payload);
    if (result.ok) {
      toast.success(editing ? 'Investor updated' : 'Investor added');
      router.push(`/investors/${result.data.id}`);
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

      <FormSection title="Investor">
        <FormGrid>
          <Field label="Fund or investor name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" autoFocus {...register('name')} />
          </Field>
          <Field label="Raising for" htmlFor="pitchingCompanyId" required error={errors.pitchingCompanyId?.message}>
            <NativeSelect id="pitchingCompanyId" {...register('pitchingCompanyId')}>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Type" htmlFor="investorType" error={errors.investorType?.message}>
            <NativeSelect id="investorType" {...register('investorType')}>
              {INVESTOR_TYPES.map((t) => (
                <option key={t} value={t}>{INVESTOR_TYPE_LABELS[t]}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Website" htmlFor="website" error={errors.website?.message}>
            <Input id="website" placeholder="https://" {...register('website')} />
          </Field>
          <Field label="Organization record" htmlFor="organizationId" error={errors.organizationId?.message}>
            <NativeSelect id="organizationId" {...register('organizationId')}>
              <option value="none">—</option>
              {options.organizations.filter((o) => o.company_id === pitchingCompanyId).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Relationship owner" htmlFor="ownerUserId" error={errors.ownerUserId?.message}>
            <NativeSelect id="ownerUserId" {...register('ownerUserId')}>
              <option value="none">Unassigned</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Fit">
        <div className="space-y-4">
          <FormGrid>
            <Field label="Check size — minimum" htmlFor="checkSizeMin" error={errors.checkSizeMin?.message}>
              <Input id="checkSizeMin" type="number" step="1000" min="0" {...register('checkSizeMin')} />
            </Field>
            <Field label="Check size — maximum" htmlFor="checkSizeMax" error={errors.checkSizeMax?.message}>
              <Input id="checkSizeMax" type="number" step="1000" min="0" {...register('checkSizeMax')} />
            </Field>
            <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
              <NativeSelect id="currency" {...register('currency')}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Geography" htmlFor="geography" error={errors.geography?.message}>
              <Input id="geography" placeholder="United States, Europe…" {...register('geography')} />
            </Field>
            <Field label="Industry focus" htmlFor="industryFocus" error={errors.industryFocus?.message} hint="Comma separated">
              <Input id="industryFocus" {...register('industryFocus')} />
            </Field>
            <Field
              label="Relevant portfolio"
              htmlFor="portfolioCompanies"
              error={errors.portfolioCompanies?.message}
              hint="Comma separated"
            >
              <Input id="portfolioCompanies" {...register('portfolioCompanies')} />
            </Field>
          </FormGrid>

          <div>
            <p className="mb-2 text-sm font-medium">Stage preference</p>
            <div className="flex flex-wrap gap-2">
              {FUNDING_STAGES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm">
                  <Checkbox
                    checked={stagePrefs.includes(s)}
                    onCheckedChange={(v) =>
                      setStagePrefs((prev) => (v ? [...prev, s] : prev.filter((x) => x !== s)))
                    }
                  />
                  {titleCase(s)}
                </label>
              ))}
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="Pipeline">
        <FormGrid>
          <Field label="Pipeline stage" htmlFor="pipelineStage" error={errors.pipelineStage?.message}>
            <NativeSelect id="pipelineStage" {...register('pipelineStage')}>
              {INVESTOR_STAGES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Outreach status" htmlFor="outreachStatus" error={errors.outreachStatus?.message}>
            <NativeSelect id="outreachStatus" {...register('outreachStatus')}>
              {OUTREACH_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Interest level" htmlFor="interestLevel" error={errors.interestLevel?.message}>
            <NativeSelect id="interestLevel" {...register('interestLevel')}>
              {INTEREST_LEVELS.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Probability (%)"
            htmlFor="probability"
            error={errors.probability?.message}
            hint="Suggested from the stage; override if you know better."
          >
            <Input id="probability" type="number" min="0" max="100" {...register('probability')} />
          </Field>
          <Field label="Potential investment" htmlFor="potentialAmount" error={errors.potentialAmount?.message}>
            <Input id="potentialAmount" type="number" step="1000" min="0" {...register('potentialAmount')} />
          </Field>
          <Field label="Warm introduction via" htmlFor="warmIntroSource" error={errors.warmIntroSource?.message}>
            <Input id="warmIntroSource" {...register('warmIntroSource')} />
          </Field>
          <Field label="Last contact" htmlFor="lastContactAt" error={errors.lastContactAt?.message}>
            <Input id="lastContactAt" type="datetime-local" {...register('lastContactAt')} />
          </Field>
          <Field label="Next follow-up" htmlFor="nextFollowUpAt" error={errors.nextFollowUpAt?.message} hint="Creates a reminder for the owner.">
            <Input id="nextFollowUpAt" type="datetime-local" {...register('nextFollowUpAt')} />
          </Field>
          <Field label="First meeting" htmlFor="firstMeetingAt" error={errors.firstMeetingAt?.message}>
            <Input id="firstMeetingAt" type="datetime-local" {...register('firstMeetingAt')} />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={dataRoom} onCheckedChange={(v) => setDataRoom(!!v)} />
              Data room access granted
            </label>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="Conversation">
        <div className="space-y-4">
          <Field label="Objections" htmlFor="objections" error={errors.objections?.message}>
            <Textarea id="objections" rows={2} {...register('objections')} />
          </Field>
          <Field label="Requested materials" htmlFor="requestedMaterials" error={errors.requestedMaterials?.message}>
            <Textarea id="requestedMaterials" rows={2} {...register('requestedMaterials')} />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
            <Textarea id="notes" rows={4} {...register('notes')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Contacts at this investor">
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
              .filter((c) => c.company_id === pitchingCompanyId && !contactIds.includes(c.id))
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
          ) : null}
        </div>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={investorId ? `/investors/${investorId}` : '/investors'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <TrendingUp />}
          {editing ? 'Save changes' : 'Add investor'}
        </Button>
      </FormActions>
    </form>
  );
}
