import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { MeetingForm } from './meeting-form';

export const metadata: Metadata = { title: 'New meeting' };
export const dynamic = 'force-dynamic';

function defaultTimes() {
  const start = new Date();
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);
  const local = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return { startsAt: local(start), endsAt: local(end) };
}

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('calendar:write', scope.companyId)) {
    return <ForbiddenState permission="calendar:write" backHref="/calendar" />;
  }
  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('calendar:write', c.id));
  const options = await getFormOptions(writable.map((c) => c.id));
  const clientId = Array.isArray(params.client) ? params.client[0] : params.client;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'New meeting' }]}
        title="New meeting"
        description="Pick a template to start from a structured agenda."
      />
      <MeetingForm
        options={{
          companies: writable.map((c) => ({ id: c.id, name: c.name })),
          users: options.users,
          clients: options.clients,
          contacts: options.contacts,
          projects: options.projects,
        }}
        defaults={{
          companyId: scope.companyId ?? writable[0]?.id ?? '',
          clientId: clientId ?? 'none',
          ownerUserId: actor.user.id,
          ...defaultTimes(),
        }}
      />
    </>
  );
}
