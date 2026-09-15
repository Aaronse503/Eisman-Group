import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getReport } from '@/lib/queries/reports';
import { runReport } from '@/lib/queries/report-data';
import { resolveRange, fmtDate, type DateRangePreset } from '@/lib/dates';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { DashboardFilters } from '@/components/dashboard/filters';
import { ReportTable } from './report-table';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  return { title: getReport(report)?.name ?? 'Report' };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ report: reportId }, search] = await Promise.all([params, searchParams]);
  const definition = getReport(reportId);
  if (!definition) notFound();

  const actor = await requireActor();
  const scope = await getScope(actor, search);
  if (!actor.can(definition.permission, scope.companyId)) {
    return <ForbiddenState permission={definition.permission} backHref="/reports" />;
  }

  const preset = (Array.isArray(search.range) ? search.range[0] : search.range) as DateRangePreset | undefined;
  const range = resolveRange(preset ?? 'last_90');
  const result = await runReport(reportId, { companyIds: scope.companyIds, range });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: definition.name }]}
        title={definition.name}
        description={definition.description}
        meta={
          <p className="text-xs text-[var(--fg-subtle)]">
            {scope.label} · {range.label} · {fmtDate(range.from)} – {fmtDate(range.to)}
          </p>
        }
        actions={
          <DashboardFilters preset={range.preset} scopeSlug={scope.slug} companies={actor.companies} />
        }
      />

      <ReportTable
        columns={result.columns}
        rows={result.rows}
        filename={`${reportId}-${range.preset}`}
        title={definition.name}
        subtitle={`${scope.label} · ${range.label}`}
      />

      <SourceNote className="mt-4" source={result.source} />
    </>
  );
}
