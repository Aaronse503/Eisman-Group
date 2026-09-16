import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listOrganizations } from '@/lib/queries/crm';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { CrmNav } from '../crm-nav';
import { OrganizationsView } from './organizations-view';

export const metadata: Metadata = { title: 'Organizations' };
export const dynamic = 'force-dynamic';

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('crm:read', scope.companyId)) return <ForbiddenState permission="crm:read" />;

  const role = Array.isArray(params.role) ? params.role[0] : params.role;
  const organizations = await listOrganizations({ companyIds: scope.companyIds, role });
  const canWrite = actor.can('crm:write', scope.companyId);

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Companies you work with — clients, vendors, partners, investors and courses. One organization can hold several roles."
        actions={
          canWrite ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/settings/import?entity=organization">
                  <Upload /> Import
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href={`/crm/organizations/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                  <Plus /> New organization
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <CrmNav active="organizations" scopeSlug={scope.slug} />
      <OrganizationsView organizations={organizations} canWrite={canWrite} showCompany={scope.isHoldings} />
    </>
  );
}
