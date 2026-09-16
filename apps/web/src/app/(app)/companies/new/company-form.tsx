'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Building2, Save } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { companySchema } from '@/lib/validation/schemas';
import { createCompanyAction, updateCompanyAction, suggestSlugAction } from '@/server/actions/companies';
import { slugify } from '@/lib/utils';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'UTC',
];
const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];

// The schema transforms (empty string → null), so the form's input type and
// the validated output type differ. react-hook-form models that with its
// third generic.
type Values = z.input<typeof companySchema>;
type Parsed = z.output<typeof companySchema>;

export function CompanyForm({
  companyId,
  defaults,
}: {
  companyId?: string;
  defaults?: Partial<Values>;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const editing = Boolean(companyId);

  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: '',
      slug: '',
      legalName: '',
      kind: 'operating',
      description: '',
      website: '',
      brandColor: '#0F5132',
      accentColor: '#C8A951',
      timezone: 'America/New_York',
      currency: 'USD',
      ...defaults,
    },
  });
  const {
    register, handleSubmit, setValue, setError, watch,
    formState: { errors, isSubmitting },
  } = form;

  const name = watch('name');
  const [slugTouched, setSlugTouched] = React.useState(editing);

  React.useEffect(() => {
    if (slugTouched || !name) return;
    setValue('slug', slugify(name));
  }, [name, slugTouched, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    let payload: Parsed = values;
    if (!editing) {
      // Resolve a collision before submitting so the user is not bounced back
      // with a "slug taken" error for a name they did not choose a slug for.
      const available = await suggestSlugAction(values.name);
      if (available !== values.slug && slugify(values.name) === values.slug) {
        setValue('slug', available);
        payload = { ...values, slug: available };
      }
    }
    const result = editing
      ? await updateCompanyAction(companyId!, payload)
      : await createCompanyAction(payload);

    if (result.ok) {
      toast.success(editing ? 'Company updated' : `${values.name} created`);
      router.push(`/companies/${result.data.slug}`);
      router.refresh();
      return;
    }
    setFormError(result.error);
    for (const [field, message] of Object.entries(result.fields ?? {})) {
      setError(field as keyof Values, { message });
    }
  });

  const brand = watch('brandColor');
  const accent = watch('accentColor');

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6" noValidate>
      <FormError message={formError} />

      <FormSection title="Identity" description="How this company appears across the Command Center.">
        <FormGrid>
          <Field label="Company name" htmlFor="name" required error={errors.name?.message}>
            <Input id="name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field
            label="URL slug"
            htmlFor="slug"
            required
            error={errors.slug?.message}
            hint="Used in links, e.g. /companies/your-slug"
          >
            <Input
              id="slug"
              aria-invalid={!!errors.slug}
              {...register('slug')}
              onChange={(e) => {
                setSlugTouched(true);
                setValue('slug', slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Legal name" htmlFor="legalName" error={errors.legalName?.message}>
            <Input id="legalName" {...register('legalName')} />
          </Field>
          <Field label="Type" htmlFor="kind" error={errors.kind?.message}>
            <NativeSelect id="kind" {...register('kind')}>
              <option value="operating">Operating company</option>
              <option value="product">Product company</option>
              <option value="holding">Holding entity</option>
              <option value="spv">SPV</option>
            </NativeSelect>
          </Field>
          <Field label="Website" htmlFor="website" error={errors.website?.message} hint="Include https://">
            <Input id="website" inputMode="url" placeholder="https://" {...register('website')} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message} span>
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Appearance" description="Used for the company dot in the switcher and on charts.">
        <FormGrid>
          <Field label="Brand colour" htmlFor="brandColor" error={errors.brandColor?.message}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Brand colour picker"
                value={brand}
                onChange={(e) => setValue('brandColor', e.target.value.toUpperCase())}
                className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-transparent p-1"
              />
              <Input id="brandColor" className="font-mono" {...register('brandColor')} />
            </div>
          </Field>
          <Field label="Accent colour" htmlFor="accentColor" error={errors.accentColor?.message}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Accent colour picker"
                value={accent}
                onChange={(e) => setValue('accentColor', e.target.value.toUpperCase())}
                className="h-9 w-12 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-transparent p-1"
              />
              <Input id="accentColor" className="font-mono" {...register('accentColor')} />
            </div>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Locale" description="Defaults for dates and money inside this workspace.">
        <FormGrid>
          <Field label="Time zone" htmlFor="timezone" error={errors.timezone?.message}>
            <NativeSelect id="timezone" {...register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
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
        </FormGrid>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href="/companies">Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <Building2 />}
          {editing ? 'Save changes' : 'Create company'}
        </Button>
      </FormActions>

      {!editing ? (
        <p className="text-xs text-[var(--fg-subtle)]">
          A new company starts with a default department, document folders, a team calendar and
          integration cards — all disconnected until you connect them.
        </p>
      ) : null}
    </form>
  );
}
