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
import { contactSchema } from '@/lib/validation/crm';
import { createContactAction, updateContactAction } from '@/server/actions/crm';
import { CONTACT_ROLES } from '@/lib/domain/crm';
import { titleCase } from '@/lib/utils';

type Values = z.input<typeof contactSchema>;
type Parsed = z.output<typeof contactSchema>;

export function ContactForm({
  contactId,
  defaults,
  options,
  initialRoles = [],
}: {
  contactId?: string;
  defaults?: Partial<Values>;
  options: {
    companies: { id: string; name: string }[];
    organizations: { id: string; name: string; company_id: string }[];
    users: { id: string; name: string }[];
    clients: { id: string; name: string; company_id: string }[];
  };
  initialRoles?: string[];
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<string[]>(initialRoles);
  const editing = Boolean(contactId);

  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      companyId: options.companies[0]?.id ?? '',
      firstName: '',
      lastName: '',
      ...defaults,
    },
  });

  const companyId = watch('companyId');
  const orgs = options.organizations.filter((o) => o.company_id === companyId);
  const clients = options.clients.filter((c) => c.company_id === companyId);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: Parsed = { ...values, roles: roles as Parsed['roles'] };
    const result = editing
      ? await updateContactAction(contactId!, payload)
      : await createContactAction(payload);
    if (result.ok) {
      toast.success(editing ? 'Contact updated' : 'Contact added');
      router.push(`/crm/contacts/${result.data.id}`);
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

      <FormSection title="Person">
        <FormGrid>
          <Field label="First name" htmlFor="firstName" required error={errors.firstName?.message}>
            <Input id="firstName" autoFocus aria-invalid={!!errors.firstName} {...register('firstName')} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
            <Input id="lastName" {...register('lastName')} />
          </Field>
          <Field label="Title" htmlFor="title" error={errors.title?.message}>
            <Input id="title" placeholder="VP Marketing" {...register('title')} />
          </Field>
          <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
            <NativeSelect id="companyId" disabled={editing} {...register('companyId')}>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Organization" htmlFor="organizationId" error={errors.organizationId?.message}>
            <NativeSelect id="organizationId" {...register('organizationId')}>
              <option value="none">—</option>
              {orgs.map((o) => (
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

      <FormSection
        title="Roles"
        description="A person can hold several roles at once — investor, advisor, partner and client."
      >
        <div className="flex flex-wrap gap-2">
          {CONTACT_ROLES.map((role) => (
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

      <FormSection title="Contact details">
        <FormGrid>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register('email')} />
          </Field>
          <Field label="Secondary email" htmlFor="secondaryEmail" error={errors.secondaryEmail?.message}>
            <Input id="secondaryEmail" type="email" {...register('secondaryEmail')} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" {...register('phone')} />
          </Field>
          <Field label="LinkedIn" htmlFor="linkedinUrl" error={errors.linkedinUrl?.message}>
            <Input id="linkedinUrl" placeholder="https://linkedin.com/in/…" {...register('linkedinUrl')} />
          </Field>
          <Field label="City" htmlFor="city" error={errors.city?.message}>
            <Input id="city" {...register('city')} />
          </Field>
          <Field label="Country" htmlFor="country" error={errors.country?.message}>
            <Input id="country" {...register('country')} />
          </Field>
          <Field label="Notes" htmlFor="description" error={errors.description?.message} span>
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
        </FormGrid>
      </FormSection>

      {!editing && clients.length ? (
        <FormSection title="Link to a client" description="Optional — attaches this person to a client account.">
          <Field label="Client" htmlFor="clientId" error={errors.clientId?.message}>
            <NativeSelect id="clientId" {...register('clientId')}>
              <option value="none">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
        </FormSection>
      ) : null}

      <FormActions>
        <Button asChild variant="ghost">
          <Link href={contactId ? `/crm/contacts/${contactId}` : '/crm/contacts'}>Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {editing ? <Save /> : <UserPlus />}
          {editing ? 'Save changes' : 'Add contact'}
        </Button>
      </FormActions>
    </form>
  );
}
