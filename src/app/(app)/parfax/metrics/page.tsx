import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { listParfaxAnnotations, listParfaxMetrics } from '@/lib/queries/parfax';
import { PageHeader } from '@/components/ui/page';
import { Card, CardContent } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { ParfaxNav } from '../parfax-nav';
import { MetricsAdmin } from './metrics-admin';

export const metadata: Metadata = { title: 'ParFax metrics' };
export const dynamic = 'force-dynamic';

export default async function ParfaxMetricsPage() {
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    return <ForbiddenState permission="parfax:read" />;
  }

  const [metrics, annotations] = await Promise.all([listParfaxMetrics(), listParfaxAnnotations()]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'ParFax', href: '/parfax' }, { label: 'Metrics' }]}
        title="Metrics administration"
        description="Targets, forecasts, manually backfilled history and reporting annotations — kept strictly apart from production figures."
      />
      <ParfaxNav />

      <Card className="mb-5 border-[var(--info)]/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-[var(--info)]" />
          <div className="space-y-1 text-sm text-[var(--fg-muted)]">
            <p>Every figure in this system carries one of five provenance kinds:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>
                <strong>Production data</strong> — read from platform records. Cannot be written here.
              </li>
              <li>
                <strong>Calculated</strong> — derived from production data by this application.
              </li>
              <li>
                <strong>Manual</strong> — entered by a person, usually to backfill history that
                pre-dates the platform.
              </li>
              <li>
                <strong>Forecast</strong> — a projection. Never presented as fact.
              </li>
              <li>
                <strong>Target</strong> — a plan number, shown next to actuals but never merged into them.
              </li>
            </ul>
            <p>
              You can record manual, forecast and target values below. Production and calculated
              values are deliberately not writable by hand.
            </p>
          </div>
        </CardContent>
      </Card>

      <MetricsAdmin
        metrics={metrics}
        annotations={annotations}
        canEdit={actor.can('parfax:metrics_admin', parfax.id)}
      />
    </>
  );
}
