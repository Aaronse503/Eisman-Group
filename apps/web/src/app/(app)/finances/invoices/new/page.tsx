import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { InvoiceForm } from './invoice-form';

export const metadata: Metadata = { title: 'New invoice' };
export const dynamic = 'force-dynamic';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('finance:write', scope.companyId)) {
    return <ForbiddenState permission="finance:write" backHref="/finances" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('finance:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Finances', href: '/finances' }, { label: 'New invoice' }]}
        title="New invoice"
        description="A record of what you billed. This is not an invoicing engine — nothing is sent from here."
      />
      <InvoiceForm
        companies={writable.map((c) => ({ id: c.id, name: c.name }))}
        clients={options.clients}
        defaults={{ companyId: scope.companyId ?? writable[0]?.id ?? '' }}
      />
    </>
  );
}
