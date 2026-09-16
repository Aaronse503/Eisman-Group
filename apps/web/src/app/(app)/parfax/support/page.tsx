import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { listSupportIssues } from '@/lib/queries/parfax';
import { formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { ForbiddenState } from '@/components/ui/states';
import { ParfaxNav } from '../parfax-nav';
import { SupportBoard } from './support-board';

export const metadata: Metadata = { title: 'ParFax support' };
export const dynamic = 'force-dynamic';

export default async function ParfaxSupportPage() {
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    return <ForbiddenState permission="parfax:read" />;
  }
  const issues = await listSupportIssues();
  const open = issues.filter((i) => ['open', 'in_progress', 'waiting'].includes(i.status));
  const urgent = open.filter((i) => i.priority === 'urgent' || i.priority === 'high');

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'ParFax', href: '/parfax' }, { label: 'Support' }]}
        title="Support issues"
        description="Player-reported problems, their status, and who is on them."
      />
      <ParfaxNav />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Open" value={formatNumber(open.length)} tone={open.length > 10 ? 'warning' : 'default'} />
        <StatCard label="High or urgent" value={formatNumber(urgent.length)} tone={urgent.length > 0 ? 'danger' : 'success'} />
        <StatCard label="Resolved" value={formatNumber(issues.filter((i) => i.status === 'resolved').length)} />
        <StatCard label="All issues" value={formatNumber(issues.length)} />
      </div>

      <SupportBoard issues={issues} canAdmin={actor.can('parfax:user_admin', parfax.id)} />
    </>
  );
}
