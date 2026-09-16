import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listContacts } from '@/lib/queries/crm';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { CrmNav } from '../crm-nav';
import { ContactsView } from './contacts-view';

export const metadata: Metadata = { title: 'Contacts' };
export const dynamic = 'force-dynamic';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('crm:read', scope.companyId)) return <ForbiddenState permission="crm:read" />;

  const role = Array.isArray(params.role) ? params.role[0] : params.role;
  const contacts = await listContacts({ companyIds: scope.companyIds, role });
  const canWrite = actor.can('crm:write', scope.companyId);

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Every person across your companies. A contact can be a client, an investor, an advisor and a partner at the same time."
        actions={
          canWrite ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/settings/import?entity=contact">
                  <Upload /> Import
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href={`/crm/contacts/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                  <Plus /> New contact
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <CrmNav active="contacts" scopeSlug={scope.slug} />
      <ContactsView contacts={contacts} canWrite={canWrite} showCompany={scope.isHoldings} />
    </>
  );
}
