import { z } from 'zod';
import { money, optionalDate, optionalString, optionalUuid } from './schemas';

export const invoiceSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  clientId: optionalUuid,
  number: z.string().trim().min(1, 'Give the invoice a number').max(60),
  status: z.enum(['draft', 'open', 'paid', 'past_due', 'void', 'uncollectible']).default('draft'),
  issueDate: z.string().min(1, 'Choose an issue date'),
  dueDate: optionalDate,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  subtotal: money,
  tax: money,
  description: optionalString,
});

export const paymentSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  clientId: optionalUuid,
  invoiceId: optionalUuid,
  direction: z.enum(['inbound', 'outbound']).default('inbound'),
  amount: money,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'disputed']).default('succeeded'),
  method: optionalString,
  occurredAt: z.string().min(1, 'Choose a date'),
  description: optionalString,
});

export const expenseSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  category: z
    .enum([
      'contractor', 'payroll', 'software', 'marketing', 'equipment',
      'travel', 'professional_services', 'other',
    ])
    .default('other'),
  description: z.string().trim().min(2, 'Describe the expense').max(300),
  amount: money,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  incurredOn: z.string().min(1, 'Choose a date'),
  vendorOrganizationId: optionalUuid,
  memberId: optionalUuid,
  clientId: optionalUuid,
  recurring: z
    .string()
    .optional()
    .transform((v) => (v === 'monthly' || v === 'quarterly' || v === 'annual' ? v : null)),
});

export const adjustmentSchema = z.object({
  companyId: z.string().uuid('Choose a company'),
  label: z.string().trim().min(2, 'Give the adjustment a label').max(200),
  metric: z.enum(['revenue', 'expense', 'cash', 'other']).default('revenue'),
  amount: money,
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  periodStart: z.string().min(1, 'Choose a start date'),
  periodEnd: z.string().min(1, 'Choose an end date'),
  note: optionalString,
  sourceLabel: z.string().trim().min(2, 'Say where this figure came from').max(200),
});

export type InvoiceInput = z.output<typeof invoiceSchema>;
export type ExpenseInput = z.output<typeof expenseSchema>;
