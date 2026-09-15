import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getInvestor, getInvestorContacts } from '@/lib/queries/growth';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { InvestorForm } from '../../new/investor-form';

export const dynamic = 'force-dynamic';

const local = (d: Date | null) =>
  d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export default async function EditInvestorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const investor = await getInvestor(id);
  if (!investor) notFound();
  const companyId = investor.pitching_company_id ?? investor.company_id;
  if (!companyId || !actor.can('investor:write', companyId)) {
    return <ForbiddenState permission="investor:write" backHref={`/investors/${id}`} />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('investor:write', c.id));
  const [options, contacts] = await Promise.all([
    getFormOptions(writable.map((c) => c.id)),
    getInvestorContacts(id),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Investors', href: '/investors' },
          { label: investor.name, href: `/investors/${id}` },
          { label: 'Edit' },
        ]}
        title={`Edit ${investor.name}`}
      />
      <InvestorForm
        investorId={id}
        initialContactIds={contacts.map((c) => c.id)}
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          organizations: options.organizations,
          contacts: options.contacts,
          users: options.users,
        }}
        defaults={{
          pitchingCompanyId: companyId,
          name: investor.name,
          website: investor.website ?? '',
          investorType: investor.investor_type as 'vc',
          checkSizeMin: investor.check_size_min ?? '',
          checkSizeMax: investor.check_size_max ?? '',
          currency: investor.currency,
          stagePreferences: investor.stage_preferences,
          industryFocus: investor.industry_focus.join(', '),
          geography: investor.geography ?? '',
          portfolioCompanies: investor.portfolio_companies.join(', '),
          warmIntroSource: investor.warm_intro_source ?? '',
          outreachStatus: investor.outreach_status as 'not_started',
          pipelineStage: investor.pipeline_stage as 'researching',
          interestLevel: investor.interest_level as 'unknown',
          probability: investor.probability,
          potentialAmount: investor.potential_amount,
          objections: investor.objections ?? '',
          requestedMaterials: investor.requested_materials ?? '',
          dataRoomAccess: investor.data_room_access,
          lastContactAt: local(investor.last_contact_at),
          nextFollowUpAt: local(investor.next_follow_up_at),
          firstMeetingAt: local(investor.first_meeting_at),
          notes: investor.notes ?? '',
          organizationId: investor.organization_id ?? 'none',
        }}
      />
    </>
  );
}
