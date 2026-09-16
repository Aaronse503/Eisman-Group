import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { sql } from '@/lib/db/client';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { MemberForm } from './member-form';

export const metadata: Metadata = { title: 'Add to team' };
export const dynamic = 'force-dynamic';

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('team:write', scope.companyId)) {
    return <ForbiddenState permission="team:write" backHref="/team" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('team:write', c.id));
  const ids = writable.map((c) => c.id);

  const [options, departments, managers] = await Promise.all([
    getFormOptions(ids),
    sql<{ id: string; name: string; company_id: string }>(
      `select id, name, company_id from departments where company_id = any($1) and archived_at is null order by name`,
      [ids],
    ),
    sql<{ id: string; full_name: string; company_id: string }>(
      `select id, full_name, company_id from members
       where company_id = any($1) and deleted_at is null and not is_vacant order by full_name`,
      [ids],
    ),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Team', href: '/team' }, { label: 'Add' }]}
        title="Add to the team"
        description="Add an employee, a contractor, or an open role you are hiring for."
      />
      <MemberForm
        canSetPay={actor.can('team:compensation_read', scope.companyId)}
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          departments,
          managers,
          users: options.users,
        }}
        defaults={{ companyId: scope.companyId ?? writable[0]?.id ?? '' }}
      />
    </>
  );
}
