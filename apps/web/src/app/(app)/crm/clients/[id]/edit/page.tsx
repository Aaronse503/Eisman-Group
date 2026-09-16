import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getClient } from '@/lib/queries/crm';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { ClientForm } from '../../new/client-form';

export const dynamic = 'force-dynamic';

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const client = await getClient(id);
  if (!client) notFound();
  if (!actor.can('crm:write', client.company_id)) {
    return <ForbiddenState permission="crm:write" backHref={`/crm/clients/${id}`} />;
  }

  const options = await getFormOptions([client.company_id]);
  const socials = (client.socials ?? {}) as Record<string, string | null>;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'CRM', href: '/crm' },
          { label: client.name, href: `/crm/clients/${id}` },
          { label: 'Edit' },
        ]}
        title={`Edit ${client.name}`}
      />
      <ClientForm
        clientId={id}
        options={{
          companies: [{ id: client.company_id, name: client.company_name }],
          organizations: options.organizations,
          users: options.users,
        }}
        defaults={{
          companyId: client.company_id,
          name: client.name,
          status: client.status as 'active',
          stage: client.stage as 'new',
          organizationId: client.organization_id ?? 'none',
          accountOwnerId: client.account_owner_id ?? 'none',
          website: client.website ?? '',
          linkedin: socials.linkedin ?? '',
          instagram: socials.instagram ?? '',
          services: client.services.join(', '),
          monthlyRetainer: client.monthly_retainer,
          contractValue: client.contract_value,
          currency: client.currency,
          contractStart: client.contract_start ?? '',
          contractEnd: client.contract_end ?? '',
          renewalDate: client.renewal_date ?? '',
          billingStatus: client.billing_status as 'current',
          healthScore: client.health_score,
          goals: client.goals ?? '',
          deliverables: client.deliverables ?? '',
          kpis: client.kpis ?? '',
          risks: client.risks ?? '',
          nextAction: client.next_action ?? '',
          nextActionDate: client.next_action_date ?? '',
        }}
      />
    </>
  );
}
