import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Download, Info, Plus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { resolveRange, comparisonRange, type DateRangePreset } from '@/lib/dates';
import { getDashboardMetrics, getRevenueTrend } from '@/lib/queries/dashboard';
import {
  getCashProjection, getClientProfitability, getExpenseBreakdown, getRevenueConcentration,
  getUpcomingContractorPayments, listExpenses, listFinancialAdjustments, listInvoices,
  listPayments, listSubscriptions,
} from '@/lib/queries/finance';
import { formatCurrency, formatPercent, pctChange } from '@/lib/utils';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { FinanceTabs } from './finance-tabs';
import { DashboardFilters } from '@/components/dashboard/filters';

export const metadata: Metadata = { title: 'Finances' };
export const dynamic = 'force-dynamic';

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('finance:read', scope.companyId)) return <ForbiddenState permission="finance:read" />;

  const preset = (Array.isArray(params.range) ? params.range[0] : params.range) as DateRangePreset | undefined;
  const range = resolveRange(preset ?? 'last_30');
  const comparison = comparisonRange(range);
  const tab = (Array.isArray(params.tab) ? params.tab[0] : params.tab) ?? 'overview';
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;

  const [
    metrics, trend, invoices, payments, expenses, subscriptions, profitability,
    breakdown, projection, concentration, adjustments, contractorPayments,
  ] = await Promise.all([
    getDashboardMetrics({ companyIds: scope.companyIds, range, comparison, includeParfax: false }),
    getRevenueTrend(scope.companyIds),
    listInvoices({ companyIds: scope.companyIds, status: statusFilter ? [statusFilter] : undefined }),
    listPayments({ companyIds: scope.companyIds, range }),
    listExpenses({ companyIds: scope.companyIds, range }),
    listSubscriptions({ companyIds: scope.companyIds }),
    getClientProfitability(scope.companyIds, range),
    getExpenseBreakdown(scope.companyIds, range),
    getCashProjection(scope.companyIds),
    getRevenueConcentration(scope.companyIds, range),
    listFinancialAdjustments(scope.companyIds),
    getUpcomingContractorPayments(scope.companyIds),
  ]);

  const canWrite = actor.can('finance:write', scope.companyId);
  const topShare = concentration.rows[0]?.share ?? 0;

  return (
    <>
      <PageHeader
        title="Finances"
        description="Revenue, receivables, expenses and cash across your workspace."
        meta={
          <p className="flex items-center gap-1.5 text-xs text-[var(--fg-subtle)]">
            <Info className="size-3.5" />
            This is an operating view, not an accounting system. Export for your accountant rather
            than filing from it.
          </p>
        }
        actions={
          <>
            <DashboardFilters preset={range.preset} scopeSlug={scope.slug} companies={actor.companies} />
            {canWrite ? (
              <Button asChild variant="primary">
                <Link href={`/finances/invoices/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                  <Plus /> New invoice
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatCurrency(metrics.revenue.current)}
          delta={pctChange(metrics.revenue.current, metrics.revenue.previous)}
          comparisonLabel={comparison.label.toLowerCase()}
        />
        <StatCard
          label="Recurring revenue"
          value={formatCurrency(metrics.recurringRevenue)}
          hint="Monthly run rate from active subscriptions"
        />
        <StatCard
          label="Accounts receivable"
          value={formatCurrency(metrics.accountsReceivable)}
          tone={metrics.overdueReceivable > 0 ? 'warning' : 'default'}
          hint={metrics.overdueReceivable > 0 ? `${formatCurrency(metrics.overdueReceivable)} overdue` : 'Nothing overdue'}
        />
        <StatCard
          label="Net cash flow"
          value={formatCurrency(metrics.netCashFlow.current)}
          delta={pctChange(metrics.netCashFlow.current, metrics.netCashFlow.previous)}
          comparisonLabel={comparison.label.toLowerCase()}
          tone={metrics.netCashFlow.current < 0 ? 'danger' : 'success'}
        />
      </div>

      {topShare >= 25 ? (
        <Card className="mb-6 border-[var(--warning)]/40">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--warning)]" />
            <div>
              <p className="text-sm font-medium">Revenue concentration</p>
              <p className="text-sm text-[var(--fg-muted)]">
                <strong>{concentration.rows[0]!.name}</strong> is {formatPercent(topShare)} of revenue in
                this period. Losing that account would remove{' '}
                {formatCurrency(concentration.rows[0]!.revenue)} of income.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <FinanceTabs
        defaultTab={tab}
        trend={trend}
        invoices={invoices}
        payments={payments}
        expenses={expenses}
        subscriptions={subscriptions}
        profitability={profitability}
        breakdown={breakdown}
        projection={projection}
        concentration={concentration}
        adjustments={adjustments}
        contractorPayments={contractorPayments}
        canWrite={canWrite}
        canAct={actor.can('finance:sensitive_action', scope.companyId)}
        showCompany={scope.isHoldings}
        rangeLabel={range.label}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/reports/revenue-expenses${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
            <Download /> Accountant export
          </Link>
        </Button>
        <SourceNote source="Payments, invoices, subscriptions and expenses recorded in this system — connected, imported and manually entered. Manual adjustments are listed separately and never silently merged." />
      </div>
    </>
  );
}
