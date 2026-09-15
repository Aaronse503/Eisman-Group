import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { PartnershipForm } from './partnership-form';

export const metadata: Metadata = { title: 'New partnership' };
export const dynamic = 'force-dynamic';

export default async function NewPartnershipPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('partnership:write', scope.companyId)) {
    return <ForbiddenState permission="partnership:write" backHref="/partnerships" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('partnership:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Partnerships', href: '/partnerships' }, { label: 'New' }]}
        title="New partnership"
      />
      <PartnershipForm
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          organizations: options.organizations,
          contacts: options.contacts,
          users: options.users,
        }}
        defaults={{ companyId: scope.companyId ?? writable[0]?.id ?? '' }}
      />
    </>
  );
}
