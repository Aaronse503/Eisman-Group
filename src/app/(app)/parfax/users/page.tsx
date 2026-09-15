import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { findParfaxDuplicates, listParfaxUsers } from '@/lib/queries/parfax';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { ParfaxNav } from '../parfax-nav';
import { ParfaxUsersView } from './users-view';

export const metadata: Metadata = { title: 'ParFax users' };
export const dynamic = 'force-dynamic';

export default async function ParfaxUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    return <ForbiddenState permission="parfax:read" />;
  }

  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const canAdmin = actor.can('parfax:user_admin', parfax.id);
  const [users, duplicates] = await Promise.all([
    listParfaxUsers({
      search: one('q'),
      plan: one('plan'),
      status: one('status'),
      activeWithinDays: one('active') === '30d' ? 30 : undefined,
      limit: 500,
    }),
    canAdmin ? findParfaxDuplicates() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'ParFax', href: '/parfax' }, { label: 'Users' }]}
        title="ParFax users"
        description="Search accounts, review activity, record notes and make audited administrative changes."
      />
      <ParfaxNav />
      <ParfaxUsersView
        users={users}
        duplicates={duplicates}
        canAdmin={canAdmin}
        canExport={actor.can('export:run', parfax.id) && canAdmin}
      />
      <SourceNote
        className="mt-4"
        source="ParFax account records in this system. Plan and billing status are owned by the billing provider and are read-only here — change them there, not in this app."
      />
    </>
  );
}
