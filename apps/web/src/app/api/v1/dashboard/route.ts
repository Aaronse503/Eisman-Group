import type { DashboardMetric, DashboardResponse } from '@eisman/shared';
import {
  comparisonRange,
  formatCurrency,
  formatNumber,
  formatPercent,
  pctChange,
  resolveRange,
  type DateRangePreset,
} from '@eisman/shared';
import { authed } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { getDashboardMetrics } from '@/lib/queries/dashboard';
import { sql } from '@/lib/db/client';

/**
 * The holdings dashboard, as the mobile application shows it.
 *
 * The figures come from exactly the same query the web dashboard uses, so the
 * two cannot disagree. Each one is sent already formatted, with the raw value
 * alongside, and with the link to the records behind it.
 */
export const GET = authed<DashboardResponse>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const preset = (params.get('range') ?? 'last_30') as DateRangePreset;
  const range = resolveRange(preset);
  const comparison = comparisonRange(range);

  const parfaxCompany = actor.companies.find((c) => c.slug === 'parfax');
  const includeParfax =
    Boolean(parfaxCompany) &&
    actor.can('parfax:read', parfaxCompany!.id) &&
    scope.companyIds.includes(parfaxCompany!.id);

  const canSeeFinance = actor.can('finance:read', scope.companyId);
  const canSeeInvestors = actor.can('investor:read', scope.companyId);

  const metrics = await getDashboardMetrics({
    companyIds: scope.companyIds,
    range,
    comparison,
    includeParfax,
    parfaxCompanyId: parfaxCompany?.id ?? null,
  });

  const link = (href: string) =>
    scope.isHoldings ? href : `${href}${href.includes('?') ? '&' : '?'}company=${scope.slug}`;

  const headline: DashboardMetric[] = [];
  if (canSeeFinance) {
    headline.push(
      {
        key: 'revenue',
        label: 'Revenue',
        value: formatCurrency(metrics.revenue.current),
        raw: metrics.revenue.current,
        deltaPercent: pctChange(metrics.revenue.current, metrics.revenue.previous),
        hint: `vs ${comparison.label.toLowerCase()}`,
        href: link('/finances?tab=payments'),
      },
      {
        key: 'recurring_revenue',
        label: 'Recurring revenue',
        value: formatCurrency(metrics.recurringRevenue),
        raw: metrics.recurringRevenue,
        hint: 'Active subscriptions and retainers',
        href: link('/finances?tab=subscriptions'),
      },
    );
  }
  headline.push(
    {
      key: 'active_clients',
      label: 'Active clients',
      value: formatNumber(metrics.activeClients.current),
      raw: metrics.activeClients.current,
      deltaPercent: pctChange(metrics.activeClients.current, metrics.activeClients.previous),
      hint: `${formatNumber(metrics.prospectiveClients)} more in a pre-contract stage`,
      href: link('/crm?status=active'),
    },
    {
      key: 'open_tasks',
      label: 'Open tasks',
      value: formatNumber(metrics.openTasks),
      raw: metrics.openTasks,
      hint: metrics.overdueTasks
        ? `${formatNumber(metrics.overdueTasks)} overdue · ${metrics.tasksDueThisWeek} due this week`
        : `${metrics.tasksDueThisWeek} due in the next 7 days`,
      tone: metrics.overdueTasks > 0 ? 'warning' : 'default',
      href: link('/tasks'),
    },
  );

  const supporting: DashboardMetric[] = [];
  if (canSeeFinance) {
    supporting.push(
      {
        key: 'accounts_receivable',
        label: 'Accounts receivable',
        value: formatCurrency(metrics.accountsReceivable),
        raw: metrics.accountsReceivable,
        hint:
          metrics.overdueReceivable > 0
            ? `${formatCurrency(metrics.overdueReceivable)} overdue`
            : 'Nothing overdue',
        tone: metrics.overdueReceivable > 0 ? 'warning' : 'default',
        href: link('/finances?tab=invoices&status=open'),
      },
      {
        key: 'upcoming_payments',
        label: 'Upcoming payments',
        value: formatCurrency(metrics.upcomingPayments),
        raw: metrics.upcomingPayments,
        hint: 'Contractor invoices not yet paid',
        href: link('/team?tab=invoices'),
      },
      {
        key: 'net_cash_flow',
        label: 'Net cash flow',
        value: formatCurrency(metrics.netCashFlow.current),
        raw: metrics.netCashFlow.current,
        hint: 'Revenue less recorded expenses',
        tone: metrics.netCashFlow.current < 0 ? 'danger' : 'default',
        href: link('/finances'),
      },
    );
  }
  supporting.push(
    {
      key: 'client_health',
      label: 'Client health',
      value: metrics.averageHealth ? `${metrics.averageHealth}/100` : '—',
      raw: metrics.averageHealth || null,
      hint: metrics.atRiskClients
        ? `${metrics.atRiskClients} account${metrics.atRiskClients === 1 ? '' : 's'} below 60`
        : 'No accounts below 60',
      tone: metrics.atRiskClients > 0 ? 'warning' : 'success',
      href: link('/crm?health=at_risk'),
    },
    {
      key: 'overdue_tasks',
      label: 'Overdue tasks',
      value: formatNumber(metrics.overdueTasks),
      raw: metrics.overdueTasks,
      hint: metrics.overdueTasks ? 'Past their due date' : 'Nothing overdue',
      tone: metrics.overdueTasks > 0 ? 'danger' : 'success',
      href: link('/tasks?view=overdue'),
    },
    {
      key: 'upcoming_meetings',
      label: 'Upcoming meetings',
      value: formatNumber(metrics.upcomingMeetings),
      raw: metrics.upcomingMeetings,
      hint: 'In the next 14 days',
      href: link('/calendar'),
    },
    {
      key: 'partnership_pipeline',
      label: 'Partnership pipeline',
      value: formatCurrency(metrics.partnershipPipeline.value, 'USD', { compact: true }),
      raw: metrics.partnershipPipeline.value,
      hint: `${metrics.partnershipPipeline.count} open · ${formatCurrency(metrics.partnershipPipeline.weighted, 'USD', { compact: true })} weighted`,
      href: link('/partnerships'),
    },
  );
  if (canSeeInvestors) {
    supporting.push(
      {
        key: 'investor_pipeline',
        label: 'Investor pipeline',
        value: formatCurrency(metrics.investorPipeline.value, 'USD', { compact: true }),
        raw: metrics.investorPipeline.value,
        hint: `${metrics.investorPipeline.count} active · ${formatCurrency(metrics.investorPipeline.weighted, 'USD', { compact: true })} weighted`,
        href: '/investors',
      },
      {
        key: 'investor_committed',
        label: 'Committed',
        value: formatCurrency(metrics.investorPipeline.committed, 'USD', { compact: true }),
        raw: metrics.investorPipeline.committed,
        hint: 'Investors at the Committed stage',
        tone: metrics.investorPipeline.committed > 0 ? 'success' : 'default',
        href: '/investors?stage=committed',
      },
    );
  }

  const parfax: DashboardMetric[] | null = metrics.parfax
    ? [
        {
          key: 'parfax_users',
          label: 'Registered users',
          value: formatNumber(metrics.parfax.totalUsers),
          raw: metrics.parfax.totalUsers,
          hint: `${formatNumber(metrics.parfax.newUsers)} new in ${range.label.toLowerCase()}`,
          href: '/parfax/users',
        },
        {
          key: 'parfax_active',
          label: 'Active (30d)',
          value: formatNumber(metrics.parfax.activeUsers),
          raw: metrics.parfax.activeUsers,
          href: '/parfax/users?active=30d',
        },
        {
          key: 'parfax_paid',
          label: 'Paid subscribers',
          value: formatNumber(metrics.parfax.paidUsers),
          raw: metrics.parfax.paidUsers,
          hint: `${formatNumber(metrics.parfax.freeUsers)} on free`,
          href: '/parfax/users?plan=paid',
        },
        {
          key: 'parfax_mrr',
          label: 'MRR / ARR',
          value: formatCurrency(metrics.parfax.mrr),
          raw: metrics.parfax.mrr,
          hint: `${formatCurrency(metrics.parfax.arr, 'USD', { compact: true })} annualised`,
          href: '/parfax/metrics',
        },
        {
          key: 'parfax_scans',
          label: 'Club scans',
          value: formatNumber(metrics.parfax.scans),
          raw: metrics.parfax.scans,
          hint:
            metrics.parfax.scanAccuracy !== null
              ? `${formatPercent(metrics.parfax.scanAccuracy)} accuracy on verified scans`
              : 'No verified scans in this period',
          href: '/parfax/metrics?tab=scans',
        },
      ]
    : null;

  const [demo] = await sql<{ count: number }>(
    `select count(*)::int as count from clients where company_id = any($1) and is_demo = true`,
    [scope.companyIds],
  );

  return {
    scope: { slug: scope.slug, label: scope.label, isHoldings: scope.isHoldings },
    range: {
      preset: range.preset,
      label: range.label,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      comparisonLabel: comparison.label,
    },
    headline,
    supporting,
    parfax,
    source:
      'Records in this system: payments, invoices, subscriptions, expenses, clients, tasks and pipelines',
    includesDemoData: (demo?.count ?? 0) > 0,
  };
});
