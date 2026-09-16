import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { ContactForm } from './contact-form';

export const metadata: Metadata = { title: 'New contact' };
export const dynamic = 'force-dynamic';

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('crm:write', scope.companyId)) {
    return <ForbiddenState permission="crm:write" backHref="/crm/contacts" />;
  }

  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('crm:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));
  const clientId = Array.isArray(params.client) ? params.client[0] : params.client;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'CRM', href: '/crm' },
          { label: 'Contacts', href: '/crm/contacts' },
          { label: 'New' },
        ]}
        title="New contact"
      />
      <ContactForm
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          organizations: options.organizations,
          users: options.users,
          clients: options.clients,
        }}
        defaults={{
          companyId: scope.companyId ?? writable[0]?.id ?? '',
          clientId: clientId ?? 'none',
        }}
      />
    </>
  );
}
