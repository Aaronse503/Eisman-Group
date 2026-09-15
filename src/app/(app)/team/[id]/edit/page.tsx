import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getMember } from '@/lib/queries/team';
import { getFormOptions } from '@/lib/queries/options';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { MemberForm } from '../../new/member-form';

export const dynamic = 'force-dynamic';

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const probe = await getMember(id, false);
  if (!probe) notFound();
  if (!actor.can('team:write', probe.company_id)) {
    return <ForbiddenState permission="team:write" backHref={`/team/${id}`} />;
  }
  const canSetPay = actor.can('team:compensation_read', probe.company_id);
  const member = canSetPay ? ((await getMember(id, true)) ?? probe) : probe;

  const [options, departments, managers] = await Promise.all([
    getFormOptions([member.company_id]),
    sql<{ id: string; name: string; company_id: string }>(
      `select id, name, company_id from departments where company_id = $1 and archived_at is null order by name`,
      [member.company_id],
    ),
    sql<{ id: string; full_name: string; company_id: string }>(
      `select id, full_name, company_id from members
       where company_id = $1 and deleted_at is null and not is_vacant and id <> $2 order by full_name`,
      [member.company_id, id],
    ),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Team', href: '/team' }, { label: member.full_name, href: `/team/${id}` }, { label: 'Edit' }]}
        title={`Edit ${member.full_name}`}
      />
      <MemberForm
        memberId={id}
        canSetPay={canSetPay}
        options={{
          companies: [{ id: member.company_id, name: member.company_name }],
          departments,
          managers,
          users: options.users,
        }}
        defaults={{
          companyId: member.company_id,
          fullName: member.full_name,
          email: member.email ?? '',
          phone: member.phone ?? '',
          kind: member.kind as 'employee',
          title: member.title,
          roleDescription: member.role_description ?? '',
          departmentId: member.department_id ?? 'none',
          userId: member.user_id ?? 'none',
          employmentType: member.employment_type as 'full_time',
          payRate: member.pay_rate ?? '',
          payRateUnit: member.pay_rate_unit ?? '',
          paySchedule: member.pay_schedule ?? '',
          currency: member.currency,
          startDate: member.start_date ?? '',
          endDate: member.end_date ?? '',
          status: member.status as 'active',
          skills: member.skills.join(', '),
          capacityHours: member.capacity_hours,
          location: member.location ?? '',
          isVacant: member.is_vacant,
        }}
      />
    </>
  );
}
