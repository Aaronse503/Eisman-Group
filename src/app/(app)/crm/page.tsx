import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listClients } from '@/lib/queries/crm';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency, formatNumber, sum } from '@/lib/utils';
import { ClientsView } from './clients-view';
import { CrmNav } from './crm-nav';

export const metadata: Metadata = { title: 'CRM' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CrmPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);

  if (!actor.can('crm:read', scope.companyId)) {
    return <ForbiddenState permission="crm:read" />;
  }

  const statusParam = Array.isArray(params.status) ? params.status[0] : params.status;
  const healthParam = Array.isArray(params.health) ? params.health[0] : params.health;

  const clients = await listClients({
    companyIds: scope.companyIds,
    status: statusParam ? [statusParam] : undefined,
    maxHealth: healthParam === 'at_risk' ? 60 : undefined,
  });

  const active = clients.filter((c) => c.status === 'active');
  const canWrite = actor.can('crm:write', scope.companyId);

  return (
    <>
      <PageHeader
        title="CRM"
        description="Clients, contacts, organizations and deals across your workspace."
        actions={
          canWrite ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/settings/import?entity=client">
                  <Upload /> Import
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href={`/crm/clients/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                  <Plus /> New client
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <CrmNav active="clients" scopeSlug={scope.slug} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active clients" value={formatNumber(active.length)} />
        <StatCard
          label="Monthly retainer"
          value={formatCurrency(sum(active, (c) => Number(c.monthly_retainer)))}
          hint="Total across active clients"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(sum(clients, (c) => Number(c.outstanding)))}
          tone={sum(clients, (c) => Number(c.outstanding)) > 0 ? 'warning' : 'default'}
          hint="Open and past-due invoices"
        />
        <StatCard
          label="Prospects"
          value={formatNumber(clients.filter((c) => c.status === 'prospect').length)}
        />
      </div>

      <ClientsView clients={clients} canWrite={canWrite} showCompany={scope.isHoldings} />
    </>
  );
}
