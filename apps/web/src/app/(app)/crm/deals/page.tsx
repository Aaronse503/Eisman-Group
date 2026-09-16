import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listDeals } from '@/lib/queries/crm';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency, formatNumber, sum } from '@/lib/utils';
import { CrmNav } from '../crm-nav';
import { DealsView } from './deals-view';

export const metadata: Metadata = { title: 'Deals' };
export const dynamic = 'force-dynamic';

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('crm:read', scope.companyId)) return <ForbiddenState permission="crm:read" />;

  const deals = await listDeals({ companyIds: scope.companyIds });
  const canWrite = actor.can('crm:write', scope.companyId);
  const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');

  return (
    <>
      <PageHeader
        title="Deals"
        description="New business in flight. Drag a card to move it through the pipeline."
        actions={
          canWrite ? (
            <Button asChild variant="primary">
              <Link href={`/crm/deals/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                <Plus /> New deal
              </Link>
            </Button>
          ) : null
        }
      />
      <CrmNav active="deals" scopeSlug={scope.slug} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Open deals" value={formatNumber(open.length)} />
        <StatCard label="Pipeline value" value={formatCurrency(sum(open, (d) => Number(d.value)))} />
        <StatCard
          label="Weighted"
          value={formatCurrency(sum(open, (d) => (Number(d.value) * d.probability) / 100))}
          hint="Value × stage probability"
        />
        <StatCard
          label="Won"
          value={formatCurrency(sum(deals.filter((d) => d.stage === 'won'), (d) => Number(d.value)))}
          tone="success"
        />
      </div>

      <DealsView deals={deals} canWrite={canWrite} showCompany={scope.isHoldings} />
    </>
  );
}
