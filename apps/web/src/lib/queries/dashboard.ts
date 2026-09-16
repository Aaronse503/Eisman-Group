import { sql } from '@/lib/db/client';
import type { DateRange } from '@/lib/dates';

export interface MetricValue {
  current: number;
  previous: number;
}

export interface DashboardMetrics {
  revenue: MetricValue;
  recurringRevenue: number;
  accountsReceivable: number;
  overdueReceivable: number;
  upcomingPayments: number;
  contractorExpenses: MetricValue;
  totalExpenses: MetricValue;
  netCashFlow: MetricValue;
  activeClients: MetricValue;
  prospectiveClients: number;
  atRiskClients: number;
  averageHealth: number;
  openTasks: number;
  overdueTasks: number;
  tasksDueThisWeek: number;
  upcomingMeetings: number;
  partnershipPipeline: { count: number; value: number; weighted: number };
  investorPipeline: { count: number; value: number; weighted: number; committed: number };
  parfax: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    paidUsers: number;
    freeUsers: number;
    mrr: number;
    arr: number;
    churnRate: number;
    scans: number;
    scanAccuracy: number | null;
  } | null;
}

const money = (v: unknown) => Number(v ?? 0);

/**
 * One pass over the database for the executive dashboard. Everything is
 * filtered by the caller's accessible company ids; an empty list yields zeroes
 * rather than a query across all tenants.
 */
export async function getDashboardMetrics(opts: {
  companyIds: string[];
  range: DateRange;
  comparison: DateRange;
  includeParfax: boolean;
  parfaxCompanyId?: string | null;
}): Promise<DashboardMetrics> {
  const { companyIds, range, comparison } = opts;
  const empty: DashboardMetrics = {
    revenue: { current: 0, previous: 0 },
    recurringRevenue: 0,
    accountsReceivable: 0,
    overdueReceivable: 0,
    upcomingPayments: 0,
    contractorExpenses: { current: 0, previous: 0 },
    totalExpenses: { current: 0, previous: 0 },
    netCashFlow: { current: 0, previous: 0 },
    activeClients: { current: 0, previous: 0 },
    prospectiveClients: 0,
    atRiskClients: 0,
    averageHealth: 0,
    openTasks: 0,
    overdueTasks: 0,
    tasksDueThisWeek: 0,
    upcomingMeetings: 0,
    partnershipPipeline: { count: 0, value: 0, weighted: 0 },
    investorPipeline: { count: 0, value: 0, weighted: 0, committed: 0 },
    parfax: null,
  };
  if (!companyIds.length) return empty;

  const p = [companyIds, range.from, range.to, comparison.from, comparison.to] as const;

  const [finance] = await sql<{
    revenue_current: number; revenue_previous: number;
    expenses_current: number; expenses_previous: number;
    contractor_current: number; contractor_previous: number;
  }>(
    `select
       coalesce((select sum(amount) from payments
         where company_id = any($1) and deleted_at is null and direction = 'inbound'
           and status = 'succeeded' and occurred_at between $2 and $3), 0) as revenue_current,
       coalesce((select sum(amount) from payments
         where company_id = any($1) and deleted_at is null and direction = 'inbound'
           and status = 'succeeded' and occurred_at between $4 and $5), 0) as revenue_previous,
       coalesce((select sum(amount) from expenses
         where company_id = any($1) and deleted_at is null
           and incurred_on between $2::date and $3::date), 0) as expenses_current,
       coalesce((select sum(amount) from expenses
         where company_id = any($1) and deleted_at is null
           and incurred_on between $4::date and $5::date), 0) as expenses_previous,
       coalesce((select sum(amount) from expenses
         where company_id = any($1) and deleted_at is null and category in ('contractor','payroll')
           and incurred_on between $2::date and $3::date), 0) as contractor_current,
       coalesce((select sum(amount) from expenses
         where company_id = any($1) and deleted_at is null and category in ('contractor','payroll')
           and incurred_on between $4::date and $5::date), 0) as contractor_previous`,
    [...p],
  );

  const [receivables] = await sql<{
    ar: number; overdue: number; mrr: number; upcoming: number;
  }>(
    `select
       coalesce((select sum(amount_due) from invoices
         where company_id = any($1) and deleted_at is null
           and status in ('open','past_due')), 0) as ar,
       coalesce((select sum(amount_due) from invoices
         where company_id = any($1) and deleted_at is null
           and status in ('open','past_due') and due_date < current_date), 0) as overdue,
       coalesce((select sum(case interval
           when 'year' then amount / 12 when 'week' then amount * 4.345
           when 'day' then amount * 30 else amount end)
         from subscriptions
         where company_id = any($1) and deleted_at is null and status in ('active','trialing')), 0) as mrr,
       coalesce((select sum(amount) from contractor_invoices
         where company_id = any($1) and deleted_at is null
           and status in ('submitted','approved')), 0) as upcoming`,
    [companyIds],
  );

  const [clients] = await sql<{
    active_current: number; active_previous: number; prospects: number;
    at_risk: number; avg_health: number;
  }>(
    `select
       (select count(*)::int from clients
         where company_id = any($1) and deleted_at is null and status = 'active') as active_current,
       (select count(*)::int from clients
         where company_id = any($1) and deleted_at is null and status = 'active'
           and created_at <= $2) as active_previous,
       (select count(*)::int from clients
         where company_id = any($1) and deleted_at is null and status = 'prospect') as prospects,
       (select count(*)::int from clients
         where company_id = any($1) and deleted_at is null and status = 'active'
           and health_score < 60) as at_risk,
       coalesce((select round(avg(health_score))::int from clients
         where company_id = any($1) and deleted_at is null and status = 'active'), 0) as avg_health`,
    [companyIds, comparison.to],
  );

  const [work] = await sql<{
    open_tasks: number; overdue_tasks: number; due_week: number; meetings: number;
  }>(
    `select
       (select count(*)::int from tasks
         where company_id = any($1) and deleted_at is null
           and status not in ('done','cancelled')) as open_tasks,
       (select count(*)::int from tasks
         where company_id = any($1) and deleted_at is null
           and status not in ('done','cancelled') and due_at < now()) as overdue_tasks,
       (select count(*)::int from tasks
         where company_id = any($1) and deleted_at is null
           and status not in ('done','cancelled')
           and due_at between now() and now() + interval '7 days') as due_week,
       (select count(*)::int from meetings
         where company_id = any($1) and deleted_at is null
           and status = 'scheduled' and starts_at between now() and now() + interval '14 days') as meetings`,
    [companyIds],
  );

  const [partnerships] = await sql<{ count: number; value: number; weighted: number }>(
    `select count(*)::int as count,
            coalesce(sum(estimated_value), 0) as value,
            coalesce(sum(estimated_value * probability / 100.0), 0) as weighted
     from partnerships
     where company_id = any($1) and deleted_at is null
       and stage not in ('declined','launched')`,
    [companyIds],
  );

  const [investors] = await sql<{
    count: number; value: number; weighted: number; committed: number;
  }>(
    `select count(*)::int as count,
            coalesce(sum(potential_amount), 0) as value,
            coalesce(sum(potential_amount * probability / 100.0), 0) as weighted,
            coalesce(sum(case when pipeline_stage = 'committed' then potential_amount else 0 end), 0) as committed
     from investors
     where deleted_at is null
       and (pitching_company_id = any($1) or company_id = any($1))
       and pipeline_stage not in ('passed','not_a_fit')`,
    [companyIds],
  );

  let parfax: DashboardMetrics['parfax'] = null;
  if (opts.includeParfax) {
    const [row] = await sql<{
      total_users: number; active_users: number; new_users: number;
      paid_users: number; free_users: number; mrr: number;
      canceled: number; active_subs: number; scans: number;
      verified: number; verified_correct: number;
    }>(
      `select
         (select count(*)::int from parfax_users where deleted_at is null) as total_users,
         (select count(*)::int from parfax_users
           where deleted_at is null and status = 'active'
             and last_active_at > now() - interval '30 days') as active_users,
         (select count(*)::int from parfax_users
           where deleted_at is null and signup_at between $1 and $2) as new_users,
         (select count(*)::int from parfax_users
           where deleted_at is null and plan <> 'free') as paid_users,
         (select count(*)::int from parfax_users
           where deleted_at is null and plan = 'free') as free_users,
         coalesce((select sum(case interval
             when 'year' then amount / 12 when 'week' then amount * 4.345
             when 'day' then amount * 30 else amount end)
           from subscriptions
           where parfax_user_id is not null and deleted_at is null
             and status in ('active','trialing')), 0) as mrr,
         (select count(*)::int from subscriptions
           where parfax_user_id is not null and deleted_at is null
             and canceled_at between $1 and $2) as canceled,
         (select count(*)::int from subscriptions
           where parfax_user_id is not null and deleted_at is null
             and status in ('active','trialing')) as active_subs,
         (select count(*)::int from parfax_scans where scanned_at between $1 and $2) as scans,
         (select count(*)::int from parfax_scans
           where verified = true and scanned_at between $1 and $2) as verified,
         (select count(*)::int from parfax_scans
           where verified_correct = true and scanned_at between $1 and $2) as verified_correct`,
      [range.from, range.to],
    );
    const denominator = row!.active_subs + row!.canceled;
    parfax = {
      totalUsers: row!.total_users,
      activeUsers: row!.active_users,
      newUsers: row!.new_users,
      paidUsers: row!.paid_users,
      freeUsers: row!.free_users,
      mrr: money(row!.mrr),
      arr: money(row!.mrr) * 12,
      churnRate: denominator ? (row!.canceled / denominator) * 100 : 0,
      scans: row!.scans,
      scanAccuracy: row!.verified ? (row!.verified_correct / row!.verified) * 100 : null,
    };
  }

  const revenueCurrent = money(finance!.revenue_current);
  const revenuePrevious = money(finance!.revenue_previous);
  const expensesCurrent = money(finance!.expenses_current);
  const expensesPrevious = money(finance!.expenses_previous);

  return {
    revenue: { current: revenueCurrent, previous: revenuePrevious },
    recurringRevenue: money(receivables!.mrr),
    accountsReceivable: money(receivables!.ar),
    overdueReceivable: money(receivables!.overdue),
    upcomingPayments: money(receivables!.upcoming),
    contractorExpenses: {
      current: money(finance!.contractor_current),
      previous: money(finance!.contractor_previous),
    },
    totalExpenses: { current: expensesCurrent, previous: expensesPrevious },
    netCashFlow: {
      current: revenueCurrent - expensesCurrent,
      previous: revenuePrevious - expensesPrevious,
    },
    activeClients: { current: clients!.active_current, previous: clients!.active_previous },
    prospectiveClients: clients!.prospects,
    atRiskClients: clients!.at_risk,
    averageHealth: clients!.avg_health,
    openTasks: work!.open_tasks,
    overdueTasks: work!.overdue_tasks,
    tasksDueThisWeek: work!.due_week,
    upcomingMeetings: work!.meetings,
    partnershipPipeline: {
      count: partnerships!.count,
      value: money(partnerships!.value),
      weighted: money(partnerships!.weighted),
    },
    investorPipeline: {
      count: investors!.count,
      value: money(investors!.value),
      weighted: money(investors!.weighted),
      committed: money(investors!.committed),
    },
    parfax,
  };
}

export interface RevenueTrendPoint {
  month: string;
  revenue: number;
  expenses: number;
  net: number;
}

export async function getRevenueTrend(companyIds: string[], months = 12): Promise<RevenueTrendPoint[]> {
  if (!companyIds.length) return [];
  return sql<RevenueTrendPoint>(
    `with months as (
       select to_char(generate_series(
         date_trunc('month', current_date) - make_interval(months => $2::int - 1),
         date_trunc('month', current_date), interval '1 month'), 'YYYY-MM') as month
     )
     select m.month,
       coalesce((select sum(p.amount) from payments p
         where p.company_id = any($1) and p.deleted_at is null and p.direction = 'inbound'
           and p.status = 'succeeded' and to_char(p.occurred_at, 'YYYY-MM') = m.month), 0) as revenue,
       coalesce((select sum(e.amount) from expenses e
         where e.company_id = any($1) and e.deleted_at is null
           and to_char(e.incurred_on, 'YYYY-MM') = m.month), 0) as expenses,
       coalesce((select sum(p.amount) from payments p
         where p.company_id = any($1) and p.deleted_at is null and p.direction = 'inbound'
           and p.status = 'succeeded' and to_char(p.occurred_at, 'YYYY-MM') = m.month), 0)
       - coalesce((select sum(e.amount) from expenses e
         where e.company_id = any($1) and e.deleted_at is null
           and to_char(e.incurred_on, 'YYYY-MM') = m.month), 0) as net
     from months m order by m.month`,
    [companyIds, months],
  );
}

export async function getCompanyBreakdown(companyIds: string[], range: DateRange) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; name: string; slug: string; brand_color: string;
    revenue: number; expenses: number; clients: number; open_tasks: number;
  }>(
    `select c.id, c.name, c.slug, c.brand_color,
       coalesce((select sum(p.amount) from payments p
         where p.company_id = c.id and p.deleted_at is null and p.direction = 'inbound'
           and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0) as revenue,
       coalesce((select sum(e.amount) from expenses e
         where e.company_id = c.id and e.deleted_at is null
           and e.incurred_on between $2::date and $3::date), 0) as expenses,
       (select count(*)::int from clients cl
         where cl.company_id = c.id and cl.deleted_at is null and cl.status = 'active') as clients,
       (select count(*)::int from tasks t
         where t.company_id = c.id and t.deleted_at is null
           and t.status not in ('done','cancelled')) as open_tasks
     from companies c
     where c.id = any($1) and c.archived_at is null
     order by c.position, c.name`,
    [companyIds, range.from, range.to],
  );
}
