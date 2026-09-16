import { insertMany, isoDate, type Random } from './util';
import type { SeedContext } from './core';
import { CLIENT_DEFS } from './demo-agency';

interface Refs {
  companyId: string;
  clientIds: string[];
  vendorOrgIds: string[];
}

export async function seedFinanceDemo(
  ctx: SeedContext,
  refs: Refs,
  team: { contractorMemberIds: string[] },
  rnd: Random,
) {
  const { companyId, clientIds, vendorOrgIds } = refs;

  const invoiceRows: unknown[][] = [];
  const paymentRows: unknown[][] = [];
  const subscriptionRows: unknown[][] = [];

  // Twelve months of retainer invoices per billing client.
  CLIENT_DEFS.forEach((def, idx) => {
    if (!def.retainer) return;
    const clientId = clientIds[idx]!;
    for (let m = 11; m >= 0; m--) {
      const issue = new Date();
      issue.setUTCMonth(issue.getUTCMonth() - m, 1);
      issue.setUTCHours(9, 0, 0, 0);
      const due = new Date(issue);
      due.setUTCDate(due.getUTCDate() + 30);
      const amount = def.retainer + (rnd.bool(0.3) ? rnd.money(500, 4500, 250) : 0);

      // Most of the current month is already collected; a couple of recent
      // invoices are deliberately late so the receivables and overdue views
      // have something real to show.
      const late = m <= 1 && def.health < 70;
      const status = late ? 'past_due' : m === 0 && rnd.bool(0.35) ? 'open' : 'paid';
      const paid = status === 'paid';

      invoiceRows.push([
        companyId, clientId, null, `EIS-${2025}${String(12 - m).padStart(2, '0')}-${idx + 1}`,
        status, isoDate(issue), isoDate(due), 'USD',
        amount, 0, amount, paid ? amount : 0, paid ? 0 : amount,
        `${def.name} — monthly retainer`, 'manual', true,
      ]);

      if (paid) {
        const paidAt = new Date(issue);
        paidAt.setUTCDate(paidAt.getUTCDate() + rnd.int(3, 22));
        // Never record a payment in the future.
        if (paidAt.getTime() > Date.now()) paidAt.setTime(Date.now() - rnd.int(1, 4) * 864e5);
        paymentRows.push([
          companyId, null, clientId, 'inbound', amount, 'USD', 'succeeded',
          rnd.pick(['ach', 'card', 'wire']), paidAt, `${def.name} retainer payment`, 'manual', true,
        ]);
      }
    }

    if (def.status === 'active') {
      const started = rnd.date(300, 800);
      const periodStart = new Date();
      periodStart.setUTCDate(1);
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      subscriptionRows.push([
        companyId, clientId, null, def.name, `${def.name} retainer`, 'active', 'month',
        def.retainer, 'USD', 1, started, periodStart, periodEnd, 'manual', true,
      ]);
    }
  });

  // A failed payment and a refund, so those states are represented.
  paymentRows.push([
    companyId, null, clientIds[4]!, 'inbound', 9500, 'USD', 'failed', 'card',
    rnd.date(4, 12), 'Card declined — insufficient funds', 'manual', true,
  ]);
  paymentRows.push([
    companyId, null, clientIds[6]!, 'inbound', -1200, 'USD', 'refunded', 'card',
    rnd.date(20, 40), 'Partial refund — paused scope', 'manual', true,
  ]);

  await insertMany(
    'invoices',
    ['company_id','client_id','organization_id','number','status','issue_date','due_date','currency','subtotal','tax','total','amount_paid','amount_due','description','source','is_demo'],
    invoiceRows,
  );
  await insertMany(
    'payments',
    ['company_id','invoice_id','client_id','direction','amount','currency','status','method','occurred_at','description','source','is_demo'],
    paymentRows,
  );
  await insertMany(
    'subscriptions',
    ['company_id','client_id','parfax_user_id','customer_label','plan','status','interval','amount','currency','quantity','started_at','current_period_start','current_period_end','source','is_demo'],
    subscriptionRows,
  );

  // ------------------------------------------------------------- expenses
  const SOFTWARE = [
    ['Google Workspace', 340], ['Figma', 225], ['Semrush', 449], ['HubSpot', 890],
    ['Slack', 180], ['Notion', 96], ['Adobe Creative Cloud', 660], ['Looker Studio Pro', 120],
  ] as const;

  const expenseRows: unknown[][] = [];
  for (let m = 11; m >= 0; m--) {
    const when = new Date();
    when.setUTCMonth(when.getUTCMonth() - m, 12);
    for (const [name, amount] of SOFTWARE) {
      expenseRows.push([
        companyId, 'software', rnd.pick(vendorOrgIds), null, null,
        `${name} subscription`, amount, 'USD', isoDate(when), 'monthly', 'manual', true,
      ]);
    }
    expenseRows.push([
      companyId, 'payroll', null, null, null, 'Payroll — salaried team',
      rnd.money(38000, 44000, 500), 'USD', isoDate(when), 'monthly', 'manual', true,
    ]);
    for (const memberId of team.contractorMemberIds.slice(0, 4)) {
      expenseRows.push([
        companyId, 'contractor', null, memberId, rnd.pick(clientIds.slice(0, 6)),
        'Contractor engagement', rnd.money(1800, 8200, 100), 'USD', isoDate(when), null, 'manual', true,
      ]);
    }
    if (m % 3 === 0) {
      expenseRows.push([
        companyId, 'professional_services', null, null, null, 'Accounting and bookkeeping',
        2400, 'USD', isoDate(when), 'quarterly', 'manual', true,
      ]);
    }
  }
  await insertMany(
    'expenses',
    ['company_id','category','vendor_organization_id','member_id','client_id','description','amount','currency','incurred_on','recurring','source','is_demo'],
    expenseRows,
  );

  // Manually entered figures are labelled so they never read as connected data.
  const q = new Date();
  q.setUTCMonth(q.getUTCMonth() - 2, 1);
  const qEnd = new Date(q);
  qEnd.setUTCMonth(qEnd.getUTCMonth() + 3, 0);
  await insertMany(
    'financial_adjustments',
    ['company_id','label','metric','amount','currency','period_start','period_end','note','source_label','created_by_id','is_demo'],
    [
      [companyId, 'Pre-system revenue (bookkeeping export)', 'revenue', 84500, 'USD',
       isoDate(q), isoDate(qEnd), 'Backfilled from the accountant’s quarterly close before this system was in use.',
       'Manual entry — accountant export', ctx.users.finance, true],
      [companyId, 'Estimated Q4 equipment purchase', 'expense', 12800, 'USD',
       isoDate(new Date()), isoDate(new Date(Date.now() + 90 * 864e5)), 'Planned, not yet committed.',
       'Manual entry — forecast', ctx.users.finance, true],
    ],
  );
}
