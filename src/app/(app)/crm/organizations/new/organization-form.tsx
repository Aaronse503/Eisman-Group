'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { organizationSchema } from '@/lib/validation/crm';
import { createOrganizationAction } from '@/server/actions/crm';
import { ORGANIZATION_ROLES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof organizationSchema>;
type Parsed = z.output<typeof organizationSchema>;

const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export function OrganizationForm({
  companies,
  users,
  defaults,
}: {
  companies: { id: string; name: string }[];
  users: { id: string; name: string }[];
  defaults?: Partial<Values>;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<string[]>([]);

  const {
    register, handleSubmit, setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { companyId: companies[0]?.id ?? '', name: '', ...defaults },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await createOrganizationAction({ ...values, roles });
    if (result.ok) {
      toast.success(`${values.name} added`);
      router.push(`/crm/organizations/${result.data.id}`);
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
      <FormSection title="Organization">
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
          <Field label="Legal name" htmlFor="legalName" error={errors.legalName?.message}>
            <Input id="legalName" {...register('legalName')} />
          </Field>
          <Field label="Domain" htmlFor="domain" error={errors.domain?.message} hint="e.g. example.com">
            <Input id="domain" {...register('domain')} />
          </Field>
          <Field label="Website" htmlFor="website" error={errors.website?.message}>
            <Input id="website" placeholder="https://" {...register('website')} />
          </Field>
          <Field label="Industry" htmlFor="industry" error={errors.industry?.message}>
            <Input id="industry" {...register('industry')} />
          </Field>
          <Field label="Size" htmlFor="sizeBand" error={errors.sizeBand?.message}>
            <NativeSelect id="sizeBand" {...register('sizeBand')}>
              <option value="">—</option>
              {SIZE_BANDS.map((s) => (
                <option key={s} value={s}>{s} people</option>
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
          <Field label="City" htmlFor="city" error={errors.city?.message}>
            <Input id="city" {...register('city')} />
          </Field>
          <Field label="Country" htmlFor="country" error={errors.country?.message}>
            <Input id="country" {...register('country')} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message} span>
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Roles" description="What this organization is to you. More than one can apply.">
        <div className="flex flex-wrap gap-2">
          {ORGANIZATION_ROLES.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <Checkbox
                checked={roles.includes(role)}
                onCheckedChange={(v) =>
                  setRoles((prev) => (v ? [...prev, role] : prev.filter((r) => r !== role)))
                }
              />
              {titleCase(role)}
            </label>
          ))}
        </div>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href="/crm/organizations">Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          <Building2 /> Add organization
        </Button>
      </FormActions>
    </form>
  );
}
