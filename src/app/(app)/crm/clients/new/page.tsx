import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { ClientForm } from './client-form';

export const metadata: Metadata = { title: 'New client' };
export const dynamic = 'force-dynamic';

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('crm:write', scope.companyId)) {
    return <ForbiddenState permission="crm:write" backHref="/crm" />;
  }

  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('crm:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'CRM', href: '/crm' }, { label: 'New client' }]}
        title="New client"
        description="Create the account record. Contacts, tasks, documents and invoices attach to it afterwards."
      />
      <ClientForm
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          organizations: options.organizations,
          users: options.users,
        }}
        defaults={{ companyId: scope.companyId ?? writable[0]?.id ?? '' }}
      />
    </>
  );
}
