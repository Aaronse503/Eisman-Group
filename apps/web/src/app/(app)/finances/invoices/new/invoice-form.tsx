'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { invoiceSchema } from '@/lib/validation/finance';
import { createInvoiceAction } from '@/server/actions/finance';
import { CURRENCIES } from '@/lib/domain/crm';
import { formatCurrency, titleCase } from '@/lib/utils';

type Values = z.input<typeof invoiceSchema>;
type Parsed = z.output<typeof invoiceSchema>;

export function InvoiceForm({
  companies,
  clients,
  defaults,
}: {
  companies: { id: string; name: string }[];
  clients: { id: string; name: string; company_id: string }[];
  defaults?: Partial<Values>;
}) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const net30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const {
    register, handleSubmit, setError, watch,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      companyId: companies[0]?.id ?? '',
      number: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      status: 'open',
      issueDate: today,
      dueDate: net30,
      currency: 'USD',
      subtotal: 0,
      tax: 0,
      ...defaults,
    },
  });

  const companyId = watch('companyId');
  const subtotal = Number(watch('subtotal') ?? 0);
  const tax = Number(watch('tax') ?? 0);
  const currency = watch('currency') ?? 'USD';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await createInvoiceAction(values);
    if (result.ok) {
      toast.success('Invoice created');
      router.push('/finances?tab=invoices');
      router.refresh();
      return;
    }
    setFormError(result.error);
    for (const [field, message] of Object.entries(result.fields ?? {})) {
      setError(field as keyof Values, { message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6" noValidate>
      <FormError message={formError} />
      <FormSection title="Invoice">
        <FormGrid>
          <Field label="Invoice number" htmlFor="number" required error={errors.number?.message}>
            <Input id="number" autoFocus {...register('number')} />
          </Field>
          <Field label="Company" htmlFor="companyId" required error={errors.companyId?.message}>
            <NativeSelect id="companyId" {...register('companyId')}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Client" htmlFor="clientId" error={errors.clientId?.message}>
            <NativeSelect id="clientId" {...register('clientId')}>
              <option value="none">—</option>
              {clients.filter((c) => c.company_id === companyId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status" error={errors.status?.message}>
            <NativeSelect id="status" {...register('status')}>
              {['draft', 'open', 'paid', 'past_due', 'void', 'uncollectible'].map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Issue date" htmlFor="issueDate" required error={errors.issueDate?.message}>
            <Input id="issueDate" type="date" {...register('issueDate')} />
          </Field>
          <Field label="Due date" htmlFor="dueDate" error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register('dueDate')} />
          </Field>
          <Field label="Subtotal" htmlFor="subtotal" error={errors.subtotal?.message}>
            <Input id="subtotal" type="number" step="0.01" min="0" {...register('subtotal')} />
          </Field>
          <Field label="Tax" htmlFor="tax" error={errors.tax?.message}>
            <Input id="tax" type="number" step="0.01" min="0" {...register('tax')} />
          </Field>
          <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
            <NativeSelect id="currency" {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description?.message} span>
            <Textarea id="description" rows={3} {...register('description')} />
          </Field>
        </FormGrid>

        <div className="flex items-center justify-between rounded-lg bg-[var(--surface-sunken)] px-4 py-3">
          <span className="text-sm font-medium">Total</span>
          <span className="tnum text-lg font-semibold">{formatCurrency(subtotal + tax, currency)}</span>
        </div>
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href="/finances?tab=invoices">Cancel</Link>
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          <Receipt /> Create invoice
        </Button>
      </FormActions>
    </form>
  );
}
