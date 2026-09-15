import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getPartnership, getPartnershipContacts } from '@/lib/queries/growth';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { PartnershipForm } from '../../new/partnership-form';

export const dynamic = 'force-dynamic';

export default async function EditPartnershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const partnership = await getPartnership(id);
  if (!partnership) notFound();
  if (!actor.can('partnership:write', partnership.company_id)) {
    return <ForbiddenState permission="partnership:write" backHref={`/partnerships/${id}`} />;
  }
  const [options, contacts] = await Promise.all([
    getFormOptions([partnership.company_id]),
    getPartnershipContacts(id),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Partnerships', href: '/partnerships' },
          { label: partnership.name, href: `/partnerships/${id}` },
          { label: 'Edit' },
        ]}
        title={`Edit ${partnership.name}`}
      />
      <PartnershipForm
        partnershipId={id}
        initialContactIds={contacts.map((c) => c.id)}
        options={{
          companies: [{ id: partnership.company_id, name: partnership.company_name }],
          organizations: options.organizations,
          contacts: options.contacts,
          users: options.users,
        }}
        defaults={{
          companyId: partnership.company_id,
          name: partnership.name,
          category: partnership.category as 'other',
          stage: partnership.stage as 'identified',
          organizationId: partnership.organization_id ?? 'none',
          estimatedValue: partnership.estimated_value,
          currency: partnership.currency,
          revenueShare: partnership.revenue_share ?? '',
          pilotLocation: partnership.pilot_location ?? '',
          equipmentRequirements: partnership.equipment_requirements ?? '',
          contractStatus: partnership.contract_status as 'none',
          launchDate: partnership.launch_date ?? '',
          probability: partnership.probability,
          nextAction: partnership.next_action ?? '',
          nextActionDate: partnership.next_action_date ?? '',
          notes: partnership.notes ?? '',
        }}
      />
    </>
  );
}
