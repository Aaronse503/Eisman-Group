import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  FileText,
  Handshake,
  TrendingUp,
} from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { resolveRange, comparisonRange, fmtDate, fmtDateTime, fmtRelative, type DateRangePreset } from '@/lib/dates';
import { getDashboardMetrics, getRevenueTrend, getCompanyBreakdown } from '@/lib/queries/dashboard';
import { listActivity } from '@/lib/activity';
import { sql } from '@/lib/db/client';
import { formatCurrency, formatNumber, formatPercent, pctChange, cn } from '@/lib/utils';
import { PageHeader, SectionHeading, SourceNote } from '@/components/ui/page';
import { StatCard, MiniStatStrip } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, HealthBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { DashboardFilters } from '@/components/dashboard/filters';
import { RevenueChart } from '@/components/dashboard/revenue-chart';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);

  const preset = (Array.isArray(params.range) ? params.range[0] : params.range) as DateRangePreset | undefined;
  const range = resolveRange(preset ?? 'last_30');
  const comparison = comparisonRange(range);

  const parfaxCompany = actor.companies.find((c) => c.slug === 'parfax');
  const includeParfax =
    Boolean(parfaxCompany) &&
    actor.can('parfax:read', parfaxCompany!.id) &&
    scope.companyIds.includes(parfaxCompany!.id);

  const canSeeFinance = actor.can('finance:read', scope.companyId);
  const canSeeInvestors = actor.can('investor:read', scope.companyId);

  const [metrics, trend, breakdown, activity, upcoming, atRisk, recentDocs] = await Promise.all([
    getDashboardMetrics({
      companyIds: scope.companyIds,
      range,
      comparison,
      includeParfax,
      parfaxCompanyId: parfaxCompany?.id ?? null,
    }),
    canSeeFinance ? getRevenueTrend(scope.companyIds) : Promise.resolve([]),
    scope.isHoldings ? getCompanyBreakdown(scope.companyIds, range) : Promise.resolve([]),
    listActivity({ companyIds: scope.companyIds, limit: 8 }),
    sql<{ id: string; title: string; starts_at: Date; client_name: string | null; company_name: string }>(
      `select m.id, m.title, m.starts_at, cl.name as client_name, co.name as company_name
       from meetings m
       join companies co on co.id = m.company_id
       left join clients cl on cl.id = m.client_id
       where m.company_id = any($1) and m.deleted_at is null and m.status = 'scheduled'
         and m.starts_at > now()
       order by m.starts_at limit 6`,
      [scope.companyIds],
    ),
    sql<{ id: string; name: string; health_score: number; status: string; risks: string | null; company_name: string }>(
      `select c.id, c.name, c.health_score, c.status, c.risks, co.name as company_name
       from clients c join companies co on co.id = c.company_id
       where c.company_id = any($1) and c.deleted_at is null
         and c.status = 'active' and c.health_score < 65
       order by c.health_score limit 5`,
      [scope.companyIds],
    ),
    sql<{ id: string; name: string; updated_at: Date; summary: string | null; is_demo: boolean }>(
      `select id, name, updated_at, summary, is_demo from documents
       where company_id = any($1) and deleted_at is null and is_current = true
       order by updated_at desc limit 5`,
      [scope.companyIds],
    ),
  ]);

  const q = (href: string) => (scope.isHoldings ? href : `${href}${href.includes('?') ? '&' : '?'}company=${scope.slug}`);
  const cmp = comparison.label.toLowerCase();

  return (
    <>
      <PageHeader
        title={scope.isHoldings ? 'Eisman Holdings' : scope.label}
        description={
          scope.isHoldings
            ? 'Consolidated view across every company you have access to.'
            : `Company workspace · ${scope.company?.status === 'active' ? 'Active' : scope.company?.status}`
        }
        meta={
          <p className="text-xs text-[var(--fg-subtle)]">
            {range.label} · {fmtDate(range.from)} – {fmtDate(range.to)} · compared with {cmp}
          </p>
        }
        actions={<DashboardFilters preset={range.preset} scopeSlug={scope.slug} companies={actor.companies} />}
      />

      {/*
        Four headline numbers, then everything else in one quiet strip. The
        supporting figures are all still here and still link to their records —
        they simply do not compete with the headlines for attention.
      */}
      <section className="mb-6" aria-label="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {canSeeFinance ? (
            <StatCard
              label="Revenue"
              value={formatCurrency(metrics.revenue.current)}
              delta={pctChange(metrics.revenue.current, metrics.revenue.previous)}
              comparisonLabel={cmp}
              href={q('/finances?tab=payments')}
              hint="Succeeded inbound payments in the selected period."
            />
          ) : null}
          {canSeeFinance ? (
            <StatCard
              label="Recurring revenue"
              value={formatCurrency(metrics.recurringRevenue)}
              hint="Monthly value of active subscriptions and retainers."
              href={q('/finances?tab=subscriptions')}
            />
          ) : null}
          <StatCard
            label="Active clients"
            value={formatNumber(metrics.activeClients.current)}
            delta={pctChange(metrics.activeClients.current, metrics.activeClients.previous)}
            comparisonLabel={cmp}
            href={q('/crm?status=active')}
            hint={`${formatNumber(metrics.prospectiveClients)} more in a pre-contract stage`}
          />
          <StatCard
            label="Open tasks"
            value={formatNumber(metrics.openTasks)}
            hint={
              metrics.overdueTasks
                ? `${formatNumber(metrics.overdueTasks)} overdue · ${metrics.tasksDueThisWeek} due this week`
                : `${metrics.tasksDueThisWeek} due in the next 7 days`
            }
            tone={metrics.overdueTasks > 0 ? 'warning' : 'default'}
            href={q('/tasks')}
          />
        </div>
      </section>

      <section className="mb-6" aria-label="Supporting figures">
        <MiniStatStrip
          items={[
            ...(canSeeFinance
              ? [
                  {
                    label: 'Accounts receivable',
                    value: formatCurrency(metrics.accountsReceivable),
                    hint:
                      metrics.overdueReceivable > 0
                        ? `${formatCurrency(metrics.overdueReceivable)} overdue`
                        : 'Nothing overdue',
                    tone: metrics.overdueReceivable > 0 ? ('warning' as const) : ('default' as const),
                    href: q('/finances?tab=invoices&status=open'),
                  },
                  {
                    label: 'Upcoming payments',
                    value: formatCurrency(metrics.upcomingPayments),
                    hint: 'Contractor invoices not yet paid',
                    href: q('/team?tab=invoices'),
                  },
                  {
                    label: 'Net cash flow',
                    value: formatCurrency(metrics.netCashFlow.current),
                    hint: 'Revenue less recorded expenses',
                    tone: metrics.netCashFlow.current < 0 ? ('danger' as const) : ('default' as const),
                    href: q('/finances'),
                  },
                ]
              : []),
            {
              label: 'Client health',
              value: metrics.averageHealth ? `${metrics.averageHealth}/100` : '—',
              hint: metrics.atRiskClients
                ? `${metrics.atRiskClients} account${metrics.atRiskClients === 1 ? '' : 's'} below 60`
                : 'No accounts below 60',
              tone: metrics.atRiskClients > 0 ? ('warning' as const) : ('success' as const),
              href: q('/crm?health=at_risk'),
            },
            {
              label: 'Overdue tasks',
              value: formatNumber(metrics.overdueTasks),
              hint: metrics.overdueTasks ? 'Past their due date' : 'Nothing overdue',
              tone: metrics.overdueTasks > 0 ? ('danger' as const) : ('success' as const),
              href: q('/tasks?view=overdue'),
            },
            {
              label: 'Upcoming meetings',
              value: formatNumber(metrics.upcomingMeetings),
              hint: 'In the next 14 days',
              href: q('/calendar'),
            },
            {
              label: 'Partnership pipeline',
              value: formatCurrency(metrics.partnershipPipeline.value, 'USD', { compact: true }),
              hint: `${metrics.partnershipPipeline.count} open · ${formatCurrency(metrics.partnershipPipeline.weighted, 'USD', { compact: true })} weighted`,
              href: q('/partnerships'),
            },
            ...(canSeeInvestors
              ? [
                  {
                    label: 'Investor pipeline',
                    value: formatCurrency(metrics.investorPipeline.value, 'USD', { compact: true }),
                    hint: `${metrics.investorPipeline.count} active · ${formatCurrency(metrics.investorPipeline.weighted, 'USD', { compact: true })} weighted`,
                    href: '/investors',
                  },
                  {
                    label: 'Committed',
                    value: formatCurrency(metrics.investorPipeline.committed, 'USD', { compact: true }),
                    hint: 'Investors at the Committed stage',
                    tone:
                      metrics.investorPipeline.committed > 0 ? ('success' as const) : ('default' as const),
                    href: '/investors?stage=committed',
                  },
                ]
              : []),
          ]}
        />
        <SourceNote
          className="mt-2"
          source="Records in this system: payments, invoices, subscriptions, expenses, clients, tasks and pipelines (connected, imported and manually entered)"
        />
      </section>

      {metrics.parfax ? (
        <section className="mb-6" aria-label="ParFax platform">
          <SectionHeading
            title="ParFax platform"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/parfax">
                  Open ParFax Admin <ArrowUpRight />
                </Link>
              </Button>
            }
          />
          <MiniStatStrip
            columns={5}
            items={[
              {
                label: 'Registered users',
                value: formatNumber(metrics.parfax.totalUsers),
                hint: `${formatNumber(metrics.parfax.newUsers)} new in ${range.label.toLowerCase()}`,
                href: '/parfax/users',
              },
              {
                label: 'Active (30d)',
                value: formatNumber(metrics.parfax.activeUsers),
                hint: 'Signed in or scanned in the last 30 days',
                href: '/parfax/users?active=30d',
              },
              {
                label: 'Paid subscribers',
                value: formatNumber(metrics.parfax.paidUsers),
                hint: `${formatNumber(metrics.parfax.freeUsers)} on free`,
                href: '/parfax/users?plan=paid',
              },
              {
                label: 'MRR / ARR',
                value: formatCurrency(metrics.parfax.mrr),
                hint: `${formatCurrency(metrics.parfax.arr, 'USD', { compact: true })} annualised`,
                href: '/parfax/metrics',
              },
              {
                label: 'Club scans',
                value: formatNumber(metrics.parfax.scans),
                hint:
                  metrics.parfax.scanAccuracy !== null
                    ? `${formatPercent(metrics.parfax.scanAccuracy)} accuracy on verified scans`
                    : 'No verified scans in this period',
                href: '/parfax/metrics?tab=scans',
              },
            ]}
          />
          <SourceNote
            className="mt-2"
            source="ParFax platform records in this system. Connect the ParFax CRM under Integrations for live production reads."
          />
        </section>
      ) : null}

      {scope.isHoldings && breakdown.length > 1 ? (
        <section className="mb-6">
          <SectionHeading title="By company" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {breakdown.map((company) => (
              <Card key={company.id}>
                <CardHeader className="flex-row items-center gap-2.5 pb-2">
                  <span className="size-2.5 rounded-full" style={{ background: company.brand_color }} aria-hidden />
                  <CardTitle className="flex-1">{company.name}</CardTitle>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/companies/${company.slug}`}>Open</Link>
                  </Button>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  {canSeeFinance ? (
                    <>
                      <div>
                        <p className="text-[11px] text-[var(--fg-subtle)] uppercase">Revenue</p>
                        <p className="tnum font-semibold">{formatCurrency(company.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fg-subtle)] uppercase">Expenses</p>
                        <p className="tnum font-semibold">{formatCurrency(company.expenses)}</p>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <p className="text-[11px] text-[var(--fg-subtle)] uppercase">Active clients</p>
                    <p className="tnum font-semibold">{company.clients}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--fg-subtle)] uppercase">Open tasks</p>
                    <p className="tnum font-semibold">{company.open_tasks}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {canSeeFinance && trend.length ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue and expenses</CardTitle>
              <SourceNote source="Recorded payments and expenses, last 12 months" />
            </CardHeader>
            <CardContent>
              <RevenueChart data={trend} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Upcoming meetings</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={q('/calendar')}>All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled"
                description="Meetings you create or sync from Google Calendar appear here."
                className="border-0 py-8"
              />
            ) : (
              upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={`/calendar/${m.id}`}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-[var(--fg-subtle)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.title}</span>
                    <span className="block truncate text-xs text-[var(--fg-subtle)]">
                      {fmtDateTime(m.starts_at)}
                      {m.client_name ? ` · ${m.client_name}` : ''}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Accounts needing attention</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={q('/crm?health=at_risk')}>All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {atRisk.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Every account is healthy"
                description="Accounts drop into this list when their health score falls below 65."
                className="border-0 py-8"
              />
            ) : (
              atRisk.map((c) => (
                <Link
                  key={c.id}
                  href={`/crm/clients/${c.id}`}
                  className="block rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <HealthBadge score={c.health_score} />
                  </span>
                  {c.risks ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--fg-subtle)]">{c.risks}</span>
                  ) : null}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent documents</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={q('/knowledge')}>All</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentDocs.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload contracts, decks and reports to the Knowledge Hub."
                className="border-0 py-8"
              />
            ) : (
              recentDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/knowledge/documents/${d.id}`}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-[var(--fg-subtle)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{d.name}</span>
                      {d.is_demo ? <Badge tone="gold" className="shrink-0 px-1.5 py-0 text-[10px]">Demo</Badge> : null}
                    </span>
                    <span className="block truncate text-xs text-[var(--fg-subtle)]">
                      {d.summary ?? fmtRelative(d.updated_at)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Changes across the organization show up here." className="border-0 py-8" />
            ) : (
              activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-2 py-1.5 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block">{a.summary}</span>
                    <span className="block text-xs text-[var(--fg-subtle)]">
                      {a.actor_name ?? 'System'}
                      {a.company_name ? ` · ${a.company_name}` : ''} · {fmtRelative(a.created_at)}
                    </span>
                  </span>
                  <StatusBadge status={a.action} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className={cn('mt-6 flex items-center gap-1.5 text-xs text-[var(--fg-subtle)]')}>
        <Handshake className="size-3.5" />
        Every figure links to the records behind it.
        {canSeeInvestors ? (
          <>
            {' '}
            <TrendingUp className="ml-2 size-3.5" /> Investor figures are weighted by stage probability.
          </>
        ) : null}
      </p>
    </>
  );
}
