import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { resolveRange, comparisonRange, type DateRangePreset } from '@/lib/dates';
import {
  getBrandTotals, getParfaxOverview, getScanTrend, getSignupTrend, getTopBrands,
  listParfaxLocations, listParfaxMetrics,
} from '@/lib/queries/parfax';
import { listActivity } from '@/lib/activity';
import { formatCurrency, formatNumber, formatPercent, pctChange } from '@/lib/utils';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ForbiddenState, EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { DashboardFilters } from '@/components/dashboard/filters';
import { fmtRelative } from '@/lib/dates';
import { ParfaxNav } from './parfax-nav';
import { ParfaxCharts } from './parfax-charts';

export const metadata: Metadata = { title: 'ParFax Admin' };
export const dynamic = 'force-dynamic';

export default async function ParfaxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    return <ForbiddenState permission="parfax:read" />;
  }

  const preset = (Array.isArray(params.range) ? params.range[0] : params.range) as DateRangePreset | undefined;
  const range = resolveRange(preset ?? 'last_30');
  const comparison = comparisonRange(range);

  const [overview, signups, scans, topBrands, brandTotals, , targets, activity] =
    await Promise.all([
      getParfaxOverview(range, comparison),
      getSignupTrend(),
      getScanTrend(),
      getTopBrands(range),
      getBrandTotals(range),
      listParfaxLocations(),
      listParfaxMetrics(),
      listActivity({ companyIds: [parfax.id], limit: 10 }),
    ]);

  const mrrTargets = targets.filter((t) => t.metric_key === 'mrr' && t.kind === 'target');
  const currentTarget = mrrTargets.find(
    (t) => new Date(t.period_start) <= new Date() && new Date(t.period_end) >= new Date(),
  );

  return (
    <>
      <PageHeader
        title="ParFax"
        description="Platform administration: users, subscriptions, scans, marketplace and partners."
        meta={
          <p className="text-xs text-[var(--fg-subtle)]">
            {range.label} · compared with {comparison.label.toLowerCase()}
          </p>
        }
        actions={<DashboardFilters preset={range.preset} scopeSlug="parfax" companies={actor.companies} />}
      />

      <ParfaxNav />

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
          Users
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Registered users" value={formatNumber(overview.totalUsers)} href="/parfax/users" />
          <StatCard
            label="New in period"
            value={formatNumber(overview.newUsers)}
            delta={pctChange(overview.newUsers, overview.newUsersPrevious)}
            comparisonLabel={comparison.label.toLowerCase()}
          />
          <StatCard
            label="Active (30 days)"
            value={formatNumber(overview.activeUsers)}
            hint={`${formatPercent((overview.activeUsers / Math.max(overview.totalUsers, 1)) * 100)} of registered`}
            href="/parfax/users?active=30d"
          />
          <StatCard
            label="Paid"
            value={formatNumber(overview.paidUsers)}
            hint={`${formatNumber(overview.freeUsers)} on free`}
            href="/parfax/users?plan=paid"
          />
          <StatCard
            label="Suspended"
            value={formatNumber(overview.suspendedUsers)}
            tone={overview.suspendedUsers > 0 ? 'warning' : 'default'}
            href="/parfax/users?status=suspended"
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
          Subscriptions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="MRR"
            value={formatCurrency(overview.mrr)}
            hint={
              currentTarget
                ? `Target ${formatCurrency(currentTarget.value)} · ${formatPercent((overview.mrr / Math.max(currentTarget.value, 1)) * 100)} of plan`
                : undefined
            }
            href="/parfax/metrics"
          />
          <StatCard label="ARR" value={formatCurrency(overview.arr, 'USD', { compact: true })} hint="MRR × 12" />
          <StatCard label="Active subscriptions" value={formatNumber(overview.activeSubscriptions)} />
          <StatCard
            label="Churn in period"
            value={formatPercent(overview.churnRate)}
            invertDelta
            tone={overview.churnRate > 5 ? 'warning' : 'default'}
            hint={`${overview.canceledInPeriod} cancellation${overview.canceledInPeriod === 1 ? '' : 's'}`}
          />
          <StatCard
            label="Conversions"
            value={formatNumber(overview.conversions)}
            hint={`${formatPercent(overview.conversionRate)} of new signups`}
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
          Platform
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Scans in period" value={formatNumber(overview.scansInPeriod)} hint={`${formatNumber(overview.totalScans)} all time`} />
          <StatCard
            label="Scan accuracy"
            value={overview.scanAccuracy !== null ? formatPercent(overview.scanAccuracy) : '—'}
            hint={
              overview.verifiedScans
                ? `From ${formatNumber(overview.verifiedScans)} verified scans`
                : 'No verified scans in this period'
            }
          />
          <StatCard
            label="Marketplace activity"
            value={formatNumber(overview.marketplaceEvents)}
            hint={`${formatCurrency(overview.marketplaceGmv, 'USD', { compact: true })} in sales`}
          />
          <StatCard
            label="Live locations"
            value={formatNumber(overview.liveLocations)}
            hint={`${overview.pilotLocations} in pilot`}
            href="/parfax/locations"
          />
          <StatCard
            label="Open support issues"
            value={formatNumber(overview.openSupportIssues)}
            tone={overview.openSupportIssues > 5 ? 'warning' : 'default'}
            href="/parfax/support"
          />
        </div>
        <SourceNote
          className="mt-2"
          source="ParFax platform records held in this system. Connect the ParFax CRM under Integrations to read from production."
        />
      </section>

      <ParfaxCharts signups={signups} scans={scans} brands={brandTotals} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Most-scanned clubs</CardTitle>
            <SourceNote source={`Scan records, ${range.label.toLowerCase()}`} />
          </CardHeader>
          <CardContent className="space-y-1.5">
            {topBrands.length === 0 ? (
              <EmptyState title="No scans in this period" className="border-0 py-6" />
            ) : (
              topBrands.map((b, i) => (
                <div key={`${b.brand}-${b.model}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="tnum w-5 text-xs text-[var(--fg-subtle)]">{i + 1}</span>
                    <span className="truncate">
                      <strong>{b.brand}</strong> {b.model}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[var(--fg-muted)]">{formatNumber(b.scans)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent platform events</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings/audit">Audit log</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">Nothing recorded yet.</p>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p>{a.summary}</p>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    {a.actor_name ?? 'System'} · {fmtRelative(a.created_at)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-[var(--info)]/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-[var(--info)]" />
          <p className="text-sm text-[var(--fg-muted)]">
            Every figure above is computed from records in this system and labelled with its source.
            Targets, forecasts and manually backfilled history are held separately under{' '}
            <Link href="/parfax/metrics" className="text-[var(--accent)] hover:underline">
              Metrics
            </Link>{' '}
            and are never mixed into these numbers.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
