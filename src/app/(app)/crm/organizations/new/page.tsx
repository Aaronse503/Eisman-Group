import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { OrganizationForm } from './organization-form';

export const metadata: Metadata = { title: 'New organization' };
export const dynamic = 'force-dynamic';

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('crm:write', scope.companyId)) {
    return <ForbiddenState permission="crm:write" backHref="/crm/organizations" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('crm:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'CRM', href: '/crm' },
          { label: 'Organizations', href: '/crm/organizations' },
          { label: 'New' },
        ]}
        title="New organization"
      />
      <OrganizationForm
        companies={writable.map((c) => ({ id: c.id, name: c.name }))}
        users={options.users}
        defaults={{ companyId: scope.companyId ?? writable[0]?.id ?? '' }}
      />
    </>
  );
}
