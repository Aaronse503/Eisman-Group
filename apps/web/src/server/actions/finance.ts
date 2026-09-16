'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import { adjustmentSchema, expenseSchema, invoiceSchema, paymentSchema } from '@/lib/validation/finance';
import { rethrowControlFlow } from '@/lib/action-errors';

function fail(err: unknown): ActionResult<never> {
  rethrowControlFlow(err);
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to change financial records here.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireFinanceWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('finance:write', companyId)) throw new ForbiddenError('finance:write', companyId);
  return actor;
}

export async function createInvoiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = invoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireFinanceWrite(data.companyId);
    const total = data.subtotal + data.tax;

    const row = await one<{ id: string }>(
      `insert into invoices
         (company_id, client_id, number, status, issue_date, due_date, currency,
          subtotal, tax, total, amount_due, description, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,'manual') returning id`,
      [
        data.companyId, data.clientId, data.number, data.status, data.issueDate, data.dueDate,
        data.currency, data.subtotal, data.tax, total, data.description,
      ],
    );

    await recordAudit({
      actor, companyId: data.companyId, action: 'invoice.created',
      entityType: 'invoice', entityId: row!.id, entityLabel: data.number,
      severity: 'notice', after: { total, status: data.status, client_id: data.clientId },
    });
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'invoice', entityId: row!.id,
      action: 'created', summary: `Created invoice ${data.number}`,
    });
    revalidatePath('/finances');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

const invoiceStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['draft', 'open', 'paid', 'past_due', 'void', 'uncollectible']),
  reason: z.string().trim().min(4, 'Give a reason — it is recorded in the audit log.'),
});

/**
 * Changing an invoice status is a sensitive financial action: it requires a
 * reason and is always audited with before/after values. An invoice that came
 * from Stripe is never edited here — Stripe remains the system of record.
 */
export async function setInvoiceStatusAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = invoiceStatusSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
    }
    const { id, status, reason } = parsed.data;
    const before = await one<{
      company_id: string; number: string; status: string; source: string;
      total: number; amount_paid: number; amount_due: number;
    }>(`select company_id, number, status, source, total, amount_paid, amount_due
        from invoices where id = $1 and deleted_at is null`, [id]);
    if (!before) return { ok: false, error: 'Invoice not found.' };

    const actor = await requireCompanyAccess(before.company_id);
    if (!actor.can('finance:sensitive_action', before.company_id)) {
      return { ok: false, error: 'Changing an invoice status requires the Finance permission.' };
    }
    if (before.source === 'stripe') {
      return {
        ok: false,
        error:
          'This invoice is owned by Stripe. Change it in Stripe and re-sync — editing it here would put the two systems out of step.',
      };
    }

    const paid = status === 'paid';
    await sql(
      `update invoices set status = $2,
         amount_paid = case when $3 then total else amount_paid end,
         amount_due  = case when $3 then 0 else total - amount_paid end
       where id = $1`,
      [id, status, paid],
    );

    await recordAudit({
      actor, companyId: before.company_id, action: 'invoice.status_changed',
      entityType: 'invoice', entityId: id, entityLabel: before.number,
      reason, severity: 'warning',
      before: { status: before.status, amount_paid: before.amount_paid, amount_due: before.amount_due },
      after: { status, amount_paid: paid ? before.total : before.amount_paid, amount_due: paid ? 0 : before.amount_due },
    });
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'invoice', entityId: id,
      action: 'status_changed', summary: `Invoice ${before.number} set to ${status}`, meta: { reason },
    });
    revalidatePath('/finances');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function recordPaymentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireFinanceWrite(data.companyId);

    const row = await one<{ id: string }>(
      `insert into payments
         (company_id, invoice_id, client_id, direction, amount, currency, status, method,
          occurred_at, description, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual') returning id`,
      [
        data.companyId, data.invoiceId, data.clientId, data.direction, data.amount,
        data.currency, data.status, data.method, new Date(data.occurredAt), data.description,
      ],
    );

    // Applying a payment to an invoice keeps the invoice balance honest.
    if (data.invoiceId && data.status === 'succeeded' && data.direction === 'inbound') {
      await sql(
        `update invoices set
           amount_paid = least(total, amount_paid + $2),
           amount_due = greatest(0, total - (amount_paid + $2)),
           status = case when total - (amount_paid + $2) <= 0 then 'paid' else status end
         where id = $1 and source = 'manual'`,
        [data.invoiceId, data.amount],
      );
    }

    await recordAudit({
      actor, companyId: data.companyId, action: 'payment.recorded',
      entityType: 'payment', entityId: row!.id,
      entityLabel: `${data.currency} ${data.amount}`,
      severity: 'notice', after: { amount: data.amount, status: data.status, invoice_id: data.invoiceId },
    });
    revalidatePath('/finances');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function createExpenseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireFinanceWrite(data.companyId);
    const row = await one<{ id: string }>(
      `insert into expenses
         (company_id, category, vendor_organization_id, member_id, client_id, description,
          amount, currency, incurred_on, recurring, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual') returning id`,
      [
        data.companyId, data.category, data.vendorOrganizationId, data.memberId, data.clientId,
        data.description, data.amount, data.currency, data.incurredOn, data.recurring,
      ],
    );
    await recordActivity({
      actor, companyId: data.companyId, entityType: 'expense', entityId: row!.id,
      action: 'created', summary: `Recorded an expense: ${data.description}`,
    });
    revalidatePath('/finances');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function createAdjustmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = adjustmentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireFinanceWrite(data.companyId);
    const row = await one<{ id: string }>(
      `insert into financial_adjustments
         (company_id, label, metric, amount, currency, period_start, period_end, note,
          source_label, created_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        data.companyId, data.label, data.metric, data.amount, data.currency,
        data.periodStart, data.periodEnd, data.note, data.sourceLabel, actor.user.id,
      ],
    );
    await recordAudit({
      actor, companyId: data.companyId, action: 'finance.adjustment_created',
      entityType: 'financial_adjustment', entityId: row!.id, entityLabel: data.label,
      severity: 'warning', after: data,
    });
    revalidatePath('/finances');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function setContractorInvoiceStatusAction(
  id: string,
  status: 'approved' | 'paid' | 'disputed',
  reason: string,
): Promise<ActionResult<null>> {
  try {
    if (reason.trim().length < 4) return { ok: false, error: 'Give a short reason.' };
    const before = await one<{ company_id: string; number: string | null; status: string; amount: number }>(
      `select company_id, number, status, amount from contractor_invoices where id = $1 and deleted_at is null`,
      [id],
    );
    if (!before) return { ok: false, error: 'Contractor invoice not found.' };
    const actor = await requireCompanyAccess(before.company_id);
    if (!actor.can('finance:sensitive_action', before.company_id)) {
      return { ok: false, error: 'Approving or paying a contractor invoice requires the Finance permission.' };
    }
    await sql(
      `update contractor_invoices set status = $2,
         paid_at = case when $2 = 'paid' then now() else paid_at end
       where id = $1`,
      [id, status],
    );
    await recordAudit({
      actor, companyId: before.company_id, action: `contractor_invoice.${status}`,
      entityType: 'contractor_invoice', entityId: id,
      entityLabel: before.number ?? id, reason, severity: 'warning',
      before: { status: before.status }, after: { status, amount: before.amount },
    });
    revalidatePath('/team');
    revalidatePath('/finances');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
