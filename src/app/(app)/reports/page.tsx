import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChartColumn } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { REPORTS } from '@/lib/queries/reports';
import { PageHeader } from '@/components/ui/page';
import { Card, CardContent } from '@/components/ui/card';
import { ForbiddenState, EmptyState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('report:read', scope.companyId)) {
    return <ForbiddenState permission="report:read" />;
  }

  const available = REPORTS.filter((r) => {
    if (!actor.can(r.permission, scope.companyId)) return false;
    if (r.requiresCompanySlug) {
      return actor.companies.some((c) => c.slug === r.requiresCompanySlug);
    }
    return true;
  });

  const groups = new Map<string, typeof available>();
  for (const report of available) {
    groups.set(report.group, [...(groups.get(report.group) ?? []), report]);
  }

  const q = (id: string) =>
    scope.isHoldings ? `/reports/${id}` : `/reports/${id}?company=${scope.slug}`;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filterable, exportable and print-friendly. Every report says where its figures come from."
      />

      {available.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No reports available to your role"
          description="Reports are filtered by permission — ask an administrator for the access you need."
        />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([group, reports]) => (
            <section key={group}>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
                {group}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <Link key={report.id} href={q(report.id)} className="group">
                    <Card className="h-full transition-colors group-hover:border-[var(--accent)]/45">
                      <CardContent className="flex h-full flex-col gap-2 pt-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{report.name}</p>
                          <ArrowRight className="size-4 shrink-0 text-[var(--fg-subtle)] opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <p className="text-sm text-[var(--fg-muted)]">{report.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
