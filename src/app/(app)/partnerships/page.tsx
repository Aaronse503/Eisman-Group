import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listPartnerships } from '@/lib/queries/growth';
import { formatCurrency, formatNumber, sum } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { PartnershipsView } from './partnerships-view';

export const metadata: Metadata = { title: 'Partnerships' };
export const dynamic = 'force-dynamic';

export default async function PartnershipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('partnership:read', scope.companyId)) {
    return <ForbiddenState permission="partnership:read" />;
  }

  const partnerships = await listPartnerships({ companyIds: scope.companyIds });
  const canWrite = actor.can('partnership:write', scope.companyId);
  const open = partnerships.filter((p) => p.stage !== 'declined' && p.stage !== 'launched');
  const live = partnerships.filter((p) => p.stage === 'signed' || p.stage === 'launched');
  const piloting = partnerships.filter((p) => p.stage === 'pilot');

  return (
    <>
      <PageHeader
        title="Partnerships"
        description="Courses, retailers, OEMs, media and technology partners, from first contact through to launch."
        actions={
          canWrite ? (
            <Button asChild variant="primary">
              <Link href={`/partnerships/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                <Plus /> New partnership
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Open partnerships" value={formatNumber(open.length)} />
        <StatCard
          label="Pipeline value"
          value={formatCurrency(sum(open, (p) => Number(p.estimated_value)), 'USD', { compact: true })}
          hint={`${formatCurrency(sum(open, (p) => (Number(p.estimated_value) * p.probability) / 100), 'USD', { compact: true })} weighted`}
        />
        <StatCard label="Signed or launched" value={formatNumber(live.length)} tone="success" />
        <StatCard label="In pilot" value={formatNumber(piloting.length)} hint={piloting.map((p) => p.name).slice(0, 2).join(', ')} />
      </div>

      <PartnershipsView partnerships={partnerships} canWrite={canWrite} showCompany={scope.isHoldings} />
    </>
  );
}
