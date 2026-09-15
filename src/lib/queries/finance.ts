import { sql } from '@/lib/db/client';
import type { DateRange } from '@/lib/dates';

export interface InvoiceRow {
  id: string; company_id: string; company_name: string; client_id: string | null;
  client_name: string | null; number: string; status: string; issue_date: string;
  due_date: string | null; currency: string; total: number; amount_paid: number;
  amount_due: number; description: string | null; source: string; hosted_url: string | null;
  is_demo: boolean; days_overdue: number;
}

export async function listInvoices(opts: { companyIds: string[]; status?: string[]; clientId?: string }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['i.company_id = any($1)', 'i.deleted_at is null'];
  if (opts.status?.length) {
    params.push(opts.status);
    where.push(`i.status = any($${params.length})`);
  }
  if (opts.clientId) {
    params.push(opts.clientId);
    where.push(`i.client_id = $${params.length}`);
  }
  return sql<InvoiceRow>(
    `select i.*, co.name as company_name, cl.name as client_name,
            case when i.status in ('open','past_due') and i.due_date < current_date
                 then (current_date - i.due_date) else 0 end as days_overdue
     from invoices i
     join companies co on co.id = i.company_id
     left join clients cl on cl.id = i.client_id
     where ${where.join(' and ')}
     order by i.issue_date desc limit 500`,
    params,
  );
}

export interface PaymentRow {
  id: string; company_id: string; company_name: string; client_id: string | null;
  client_name: string | null; direction: string; amount: number; currency: string;
  status: string; method: string | null; occurred_at: Date; description: string | null;
  failure_reason: string | null; source: string; is_demo: boolean;
}

export async function listPayments(opts: { companyIds: string[]; range?: DateRange; clientId?: string }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['p.company_id = any($1)', 'p.deleted_at is null'];
  if (opts.range) {
    params.push(opts.range.from, opts.range.to);
    where.push(`p.occurred_at between $${params.length - 1} and $${params.length}`);
  }
  if (opts.clientId) {
    params.push(opts.clientId);
    where.push(`p.client_id = $${params.length}`);
  }
  return sql<PaymentRow>(
    `select p.*, co.name as company_name, cl.name as client_name
     from payments p
     join companies co on co.id = p.company_id
     left join clients cl on cl.id = p.client_id
     where ${where.join(' and ')}
     order by p.occurred_at desc limit 500`,
    params,
  );
}

export interface ExpenseRow {
  id: string; company_id: string; company_name: string; category: string;
  description: string; amount: number; currency: string; incurred_on: string;
  recurring: string | null; source: string; vendor_name: string | null;
  member_name: string | null; client_name: string | null; is_demo: boolean;
}

export async function listExpenses(opts: { companyIds: string[]; range?: DateRange; category?: string }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['e.company_id = any($1)', 'e.deleted_at is null'];
  if (opts.range) {
    params.push(opts.range.from, opts.range.to);
    where.push(`e.incurred_on between $${params.length - 1}::date and $${params.length}::date`);
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`e.category = $${params.length}`);
  }
  return sql<ExpenseRow>(
    `select e.*, co.name as company_name, o.name as vendor_name,
            m.full_name as member_name, cl.name as client_name
     from expenses e
     join companies co on co.id = e.company_id
     left join organizations o on o.id = e.vendor_organization_id
     left join members m on m.id = e.member_id
     left join clients cl on cl.id = e.client_id
     where ${where.join(' and ')}
     order by e.incurred_on desc limit 500`,
    params,
  );
}

export interface SubscriptionRow {
  id: string; company_id: string; company_name: string; client_id: string | null;
  client_name: string | null; customer_label: string | null; plan: string; status: string;
  interval: string; amount: number; currency: string; quantity: number;
  current_period_end: Date | null; source: string; is_demo: boolean; mrr: number;
}

export async function listSubscriptions(opts: { companyIds: string[]; clientsOnly?: boolean }) {
  if (!opts.companyIds.length) return [];
  return sql<SubscriptionRow>(
    `select s.*, co.name as company_name, cl.name as client_name,
            (case s.interval when 'year' then s.amount / 12 when 'week' then s.amount * 4.345
                             when 'day' then s.amount * 30 else s.amount end) * s.quantity as mrr
     from subscriptions s
     join companies co on co.id = s.company_id
     left join clients cl on cl.id = s.client_id
     where s.company_id = any($1) and s.deleted_at is null
       and ($2::boolean is not true or s.parfax_user_id is null)
     order by mrr desc limit 500`,
    [opts.companyIds, opts.clientsOnly ?? false],
  );
}

/** Revenue and cost per client — the basis of client profitability. */
export async function getClientProfitability(companyIds: string[], range: DateRange) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; name: string; company_name: string; currency: string;
    revenue: number; direct_cost: number; margin: number; margin_pct: number | null;
    health_score: number; status: string;
  }>(
    `select c.id, c.name, co.name as company_name, c.currency, c.health_score, c.status,
       coalesce((select sum(p.amount) from payments p
         where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
           and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0) as revenue,
       coalesce((select sum(e.amount) from expenses e
         where e.client_id = c.id and e.deleted_at is null
           and e.incurred_on between $2::date and $3::date), 0) as direct_cost,
       coalesce((select sum(p.amount) from payments p
         where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
           and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0)
       - coalesce((select sum(e.amount) from expenses e
         where e.client_id = c.id and e.deleted_at is null
           and e.incurred_on between $2::date and $3::date), 0) as margin,
       case when coalesce((select sum(p.amount) from payments p
              where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
                and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0) > 0
            then round(((coalesce((select sum(p.amount) from payments p
                   where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
                     and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0)
                 - coalesce((select sum(e.amount) from expenses e
                   where e.client_id = c.id and e.deleted_at is null
                     and e.incurred_on between $2::date and $3::date), 0))
                / coalesce((select sum(p.amount) from payments p
                   where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
                     and p.status = 'succeeded' and p.occurred_at between $2 and $3), 1)) * 100, 1)
            else null end as margin_pct
     from clients c
     join companies co on co.id = c.company_id
     where c.company_id = any($1) and c.deleted_at is null
     order by revenue desc`,
    [companyIds, range.from, range.to],
  );
}

export async function getExpenseBreakdown(companyIds: string[], range: DateRange) {
  if (!companyIds.length) return [];
  return sql<{ category: string; total: number }>(
    `select category, sum(amount) as total
     from expenses
     where company_id = any($1) and deleted_at is null
       and incurred_on between $2::date and $3::date
     group by category order by total desc`,
    [companyIds, range.from, range.to],
  );
}

/**
 * Twelve-week forward cash view: open invoices in, contractor invoices and
 * recurring expenses out. A projection, labelled as such in the UI.
 */
export async function getCashProjection(companyIds: string[], weeks = 12) {
  if (!companyIds.length) return [];
  return sql<{ week_start: string; inflow: number; outflow: number; net: number }>(
    `with weeks as (
       select generate_series(date_trunc('week', current_date),
              date_trunc('week', current_date) + make_interval(weeks => $2::int - 1),
              interval '1 week')::date as week_start
     )
     select w.week_start,
       coalesce((select sum(i.amount_due) from invoices i
         where i.company_id = any($1) and i.deleted_at is null
           and i.status in ('open','past_due')
           and i.due_date >= w.week_start and i.due_date < w.week_start + 7), 0) as inflow,
       coalesce((select sum(ci.amount) from contractor_invoices ci
         where ci.company_id = any($1) and ci.deleted_at is null
           and ci.status in ('submitted','approved')
           and ci.due_date >= w.week_start and ci.due_date < w.week_start + 7), 0) as outflow,
       coalesce((select sum(i.amount_due) from invoices i
         where i.company_id = any($1) and i.deleted_at is null
           and i.status in ('open','past_due')
           and i.due_date >= w.week_start and i.due_date < w.week_start + 7), 0)
       - coalesce((select sum(ci.amount) from contractor_invoices ci
         where ci.company_id = any($1) and ci.deleted_at is null
           and ci.status in ('submitted','approved')
           and ci.due_date >= w.week_start and ci.due_date < w.week_start + 7), 0) as net
     from weeks w order by w.week_start`,
    [companyIds, weeks],
  );
}

export async function getRevenueConcentration(companyIds: string[], range: DateRange) {
  if (!companyIds.length) return { total: 0, rows: [] };
  const rows = await sql<{ name: string; revenue: number; share: number }>(
    `with totals as (
       select coalesce(sum(p.amount), 0) as total from payments p
       where p.company_id = any($1) and p.deleted_at is null and p.direction = 'inbound'
         and p.status = 'succeeded' and p.occurred_at between $2 and $3
     )
     select coalesce(c.name, 'Unattributed') as name,
            sum(p.amount) as revenue,
            case when (select total from totals) > 0
                 then round((sum(p.amount) / (select total from totals)) * 100, 1)
                 else 0 end as share
     from payments p
     left join clients c on c.id = p.client_id
     where p.company_id = any($1) and p.deleted_at is null and p.direction = 'inbound'
       and p.status = 'succeeded' and p.occurred_at between $2 and $3
     group by c.name order by revenue desc limit 15`,
    [companyIds, range.from, range.to],
  );
  return { total: rows.reduce((a, b) => a + Number(b.revenue), 0), rows };
}

export async function listFinancialAdjustments(companyIds: string[]) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; company_id: string; company_name: string; label: string; metric: string;
    amount: number; currency: string; period_start: string; period_end: string;
    note: string | null; source_label: string; created_by: string | null; is_demo: boolean;
  }>(
    `select a.*, co.name as company_name, u.name as created_by
     from financial_adjustments a
     join companies co on co.id = a.company_id
     left join users u on u.id = a.created_by_id
     where a.company_id = any($1) and a.deleted_at is null
     order by a.period_start desc`,
    [companyIds],
  );
}

export async function getUpcomingContractorPayments(companyIds: string[]) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; number: string | null; amount: number; currency: string; status: string;
    due_date: string | null; member_name: string; company_name: string; is_demo: boolean;
  }>(
    `select ci.id, ci.number, ci.amount, ci.currency, ci.status, ci.due_date,
            m.full_name as member_name, co.name as company_name, ci.is_demo
     from contractor_invoices ci
     join members m on m.id = ci.member_id
     join companies co on co.id = ci.company_id
     where ci.company_id = any($1) and ci.deleted_at is null
       and ci.status in ('submitted','approved')
     order by ci.due_date nulls last limit 100`,
    [companyIds],
  );
}
