import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getMeeting, getParticipants } from '@/lib/queries/meetings';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { MeetingForm } from '../../new/meeting-form';

export const dynamic = 'force-dynamic';

const local = (d: Date) =>
  new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  if (!actor.can('calendar:write', meeting.company_id)) {
    return <ForbiddenState permission="calendar:write" backHref={`/calendar/${id}`} />;
  }
  const [options, participants] = await Promise.all([
    getFormOptions([meeting.company_id]),
    getParticipants(id),
  ]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Calendar', href: '/calendar' },
          { label: meeting.title, href: `/calendar/${id}` },
          { label: 'Edit' },
        ]}
        title="Edit meeting"
      />
      <MeetingForm
        meetingId={id}
        synced={meeting.source !== 'internal'}
        initialParticipants={{
          userIds: participants.filter((p) => p.user_id).map((p) => p.user_id!),
          contactIds: participants.filter((p) => p.contact_id).map((p) => p.contact_id!),
        }}
        options={{
          companies: [{ id: meeting.company_id, name: meeting.company_name }],
          users: options.users,
          clients: options.clients,
          contacts: options.contacts,
          projects: options.projects,
        }}
        defaults={{
          companyId: meeting.company_id,
          title: meeting.title,
          template: meeting.template as 'general',
          startsAt: local(meeting.starts_at),
          endsAt: local(meeting.ends_at),
          timezone: meeting.timezone,
          location: meeting.location ?? '',
          meetingUrl: meeting.meeting_url ?? '',
          agenda: meeting.agenda ?? '',
          notes: meeting.notes ?? '',
          decisions: meeting.decisions ?? '',
          followUpDate: meeting.follow_up_date ?? '',
          status: meeting.status as 'scheduled',
          clientId: meeting.client_id ?? 'none',
          projectId: meeting.project_id ?? 'none',
          ownerUserId: meeting.owner_user_id ?? 'none',
        }}
      />
    </>
  );
}
