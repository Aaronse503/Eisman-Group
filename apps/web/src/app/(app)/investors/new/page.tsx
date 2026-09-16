import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { InvestorForm } from './investor-form';

export const metadata: Metadata = { title: 'New investor' };
export const dynamic = 'force-dynamic';

export default async function NewInvestorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('investor:write', scope.companyId)) {
    return <ForbiddenState permission="investor:write" backHref="/investors" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('investor:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Investors', href: '/investors' }, { label: 'New' }]}
        title="New investor"
        description="Investors are tracked at the holding level; pick which company is raising from them."
      />
      <InvestorForm
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          organizations: options.organizations,
          contacts: options.contacts,
          users: options.users,
        }}
        defaults={{ pitchingCompanyId: scope.companyId ?? writable[0]?.id ?? '' }}
      />
    </>
  );
}
