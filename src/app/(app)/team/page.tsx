import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import {
  getCapacitySummary, getContractorInvoices, getOrgChangeLog, getOrgChart, listMembers,
} from '@/lib/queries/team';
import { formatCurrency, formatNumber, sum } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { TeamTabs } from './team-tabs';

export const metadata: Metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('team:read', scope.companyId)) return <ForbiddenState permission="team:read" />;

  const canSeePay = actor.can('team:compensation_read', scope.companyId);
  const tab = (Array.isArray(params.tab) ? params.tab[0] : params.tab) ?? 'people';

  // The org chart is per company; in the holdings view it shows the first
  // company you can read, with a switcher note.
  const chartCompany = scope.company ?? actor.companies.find((c) => !c.archived_at) ?? null;

  const [members, invoices, orgRoots, orgChanges, capacity] = await Promise.all([
    listMembers({ companyIds: scope.companyIds, includeCompensation: canSeePay }),
    getContractorInvoices({ companyIds: scope.companyIds }),
    chartCompany ? getOrgChart(chartCompany.id) : Promise.resolve([]),
    chartCompany ? getOrgChangeLog(chartCompany.id) : Promise.resolve([]),
    getCapacitySummary(scope.companyIds),
  ]);

  const employees = members.filter((m) => m.kind === 'employee' && !m.is_vacant);
  const contractors = members.filter((m) => m.kind !== 'employee' && !m.is_vacant);
  const vacancies = members.filter((m) => m.is_vacant);
  const unpaid = sum(
    invoices.filter((i) => i.status === 'submitted' || i.status === 'approved'),
    (i) => Number(i.amount),
  );

  return (
    <>
      <PageHeader
        title="Team"
        description={
          chartCompany && scope.isHoldings
            ? `People and contractors across your companies. The org chart shows ${chartCompany.name} — switch company to see another.`
            : 'People, contractors, reporting lines and capacity.'
        }
        actions={
          actor.can('team:write', scope.companyId) ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/settings/import?entity=member">
                  <Upload /> Import
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href={`/team/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                  <Plus /> Add someone
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={formatNumber(employees.length)} />
        <StatCard label="Contractors" value={formatNumber(contractors.length)} hint="Includes agencies and advisors" />
        <StatCard
          label="Open roles"
          value={formatNumber(vacancies.length)}
          tone={vacancies.length > 0 ? 'warning' : 'default'}
          hint={vacancies.length ? vacancies.map((v) => v.title).slice(0, 2).join(', ') : 'Fully staffed'}
        />
        {canSeePay ? (
          <StatCard
            label="Unpaid contractor invoices"
            value={formatCurrency(unpaid)}
            tone={unpaid > 0 ? 'warning' : 'default'}
            href="/team?tab=invoices"
          />
        ) : (
          <StatCard
            label="Average allocation"
            value={`${Math.round(capacity.reduce((a, b) => a + b.allocated_pct, 0) / Math.max(capacity.length, 1))}%`}
            hint="Across active people"
          />
        )}
      </div>

      <TeamTabs
        defaultTab={tab}
        members={members}
        invoices={invoices}
        orgRoots={orgRoots}
        orgChanges={orgChanges}
        capacity={capacity}
        canWrite={actor.can('team:write', scope.companyId)}
        canSeePay={canSeePay}
        canApprove={actor.can('finance:sensitive_action', scope.companyId)}
        showCompany={scope.isHoldings}
      />
    </>
  );
}
