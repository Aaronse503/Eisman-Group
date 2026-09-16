import type { DashboardMetric } from '@eisman/shared';
import {
  comparisonRange,
  formatCurrency,
  formatNumber,
  formatPercent,
  pctChange,
  resolveRange,
  type DateRangePreset,
} from '@eisman/shared';
import { authed, forbidden } from '@/lib/api/route';
import { getParfaxOverview } from '@/lib/queries/parfax';
import { sql } from '@/lib/db/client';

/**
 * ParFax platform metrics.
 *
 * Every figure here is derived from platform records in this system. Nothing
 * is read from a connected ParFax service unless that integration has been
 * connected, and the response says which it is.
 */
export const GET = authed(async ({ actor, params }) => {
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    throw forbidden('You do not have access to the ParFax platform.');
  }

  const range = resolveRange((params.get('range') ?? 'last_30') as DateRangePreset);
  const overview = await getParfaxOverview(range, comparisonRange(range));

  const [connection] = await sql<{ status: string; mode: string }>(
    `select status, mode from integration_connections where provider = 'parfax_crm' limit 1`,
  );

  const metrics: DashboardMetric[] = [
    {
      key: 'total_users',
      label: 'Registered users',
      value: formatNumber(overview.totalUsers),
      raw: overview.totalUsers,
      hint: `${formatNumber(overview.newUsers)} new in ${range.label.toLowerCase()}`,
      deltaPercent: pctChange(overview.newUsers, overview.newUsersPrevious),
      href: '/parfax/users',
    },
    {
      key: 'active_users',
      label: 'Active (30d)',
      value: formatNumber(overview.activeUsers),
      raw: overview.activeUsers,
      hint: 'Signed in or scanned in the last 30 days',
      href: '/parfax/users?active=30d',
    },
    {
      key: 'paid_users',
      label: 'Paid subscribers',
      value: formatNumber(overview.paidUsers),
      raw: overview.paidUsers,
      hint: `${formatNumber(overview.freeUsers)} on free`,
      href: '/parfax/users?plan=paid',
    },
    {
      key: 'mrr',
      label: 'MRR',
      value: formatCurrency(overview.mrr),
      raw: overview.mrr,
      hint: `${formatCurrency(overview.arr, 'USD', { compact: true })} annualised`,
      href: '/parfax/metrics',
    },
    {
      key: 'churn',
      label: 'Churn',
      value: formatPercent(overview.churnRate),
      raw: overview.churnRate,
      hint: `${formatNumber(overview.canceledInPeriod)} cancelled in ${range.label.toLowerCase()}`,
      tone: overview.churnRate > 5 ? 'warning' : 'default',
      href: '/parfax/metrics',
    },
    {
      key: 'scans',
      label: 'Club scans',
      value: formatNumber(overview.scansInPeriod),
      raw: overview.scansInPeriod,
      hint:
        overview.scanAccuracy !== null
          ? `${formatPercent(overview.scanAccuracy)} accuracy on verified scans`
          : 'No verified scans in this period',
      href: '/parfax/metrics?tab=scans',
    },
  ];

  return {
    range: { preset: range.preset, label: range.label },
    metrics,
    source: 'ParFax platform records in this system',
    connection: {
      status: connection?.status ?? 'disconnected',
      mode: connection?.mode ?? 'disconnected',
    },
  };
});
