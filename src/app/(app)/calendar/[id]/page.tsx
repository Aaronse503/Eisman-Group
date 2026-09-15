import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, MapPin, Pencil, Video } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getMeeting, getParticipants, getActionItems } from '@/lib/queries/meetings';
import { getRecordSidecars } from '@/lib/queries/records';
import { getFormOptions } from '@/lib/queries/options';
import { listActivity } from '@/lib/activity';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/dates';
import { titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status';
import { ForbiddenState } from '@/components/ui/states';
import {
  ActivityTimeline, AttachmentsPanel, CommentsPanel, NotesPanel, TagsPanel,
} from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';
import { ArchiveRecord } from '@/components/record/archive-record';
import { archiveMeetingAction } from '@/server/actions/meetings';
import { ActionItems } from './action-items';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  return { title: meeting?.title ?? 'Meeting' };
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const meeting = await getMeeting(id);
  if (!meeting) notFound();
  if (!actor.canReadCompany(meeting.company_id) || !actor.can('calendar:read', meeting.company_id)) {
    return <ForbiddenState permission="calendar:read" backHref="/calendar" />;
  }
  const canWrite = actor.can('calendar:write', meeting.company_id);

  const [participants, actionItems, sidecars, activity, options] = await Promise.all([
    getParticipants(id),
    getActionItems(id),
    getRecordSidecars('meeting', id, meeting.company_id),
    listActivity({ entityType: 'meeting', entityId: id, limit: 20 }),
    getFormOptions([meeting.company_id]),
  ]);

  return (
    <>
      <TrackView entityType="meeting" entityId={id} label={meeting.title} href={`/calendar/${id}`} companyId={meeting.company_id} />
      <PageHeader
        breadcrumbs={[{ label: 'Calendar', href: '/calendar' }, { label: meeting.title }]}
        title={meeting.title}
        description={`${fmtDate(meeting.starts_at, 'EEEE, MMMM d, yyyy')} · ${fmtTime(meeting.starts_at)} – ${fmtTime(meeting.ends_at)} (${meeting.timezone})`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={meeting.status} />
            <Badge tone="outline">{titleCase(meeting.template)}</Badge>
            <Badge tone="outline">{meeting.company_name}</Badge>
            {meeting.client_id ? (
              <Link href={`/crm/clients/${meeting.client_id}`}>
                <Badge tone="accent">{meeting.client_name}</Badge>
              </Link>
            ) : null}
            {meeting.source !== 'internal' ? (
              <Badge tone="accent">Synced from {titleCase(meeting.source)}</Badge>
            ) : null}
            {meeting.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <>
              {meeting.meeting_url ? (
                <Button asChild variant="primary">
                  <a href={meeting.meeting_url} target="_blank" rel="noreferrer noopener">
                    <Video /> Join
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="secondary">
                <Link href={`/calendar/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <ArchiveRecord
                label={meeting.title}
                archived={false}
                action={async (payload) => {
                  'use server';
                  return archiveMeetingAction({ id, ...payload });
                }}
              />
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {meeting.agenda ? (
            <Card>
              <CardHeader>
                <CardTitle>Agenda</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-[var(--fg-muted)]">{meeting.agenda}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.notes ? (
                <p className="text-sm whitespace-pre-wrap">{meeting.notes}</p>
              ) : (
                <p className="text-sm text-[var(--fg-muted)]">
                  No notes yet.{' '}
                  {canWrite ? (
                    <Link href={`/calendar/${id}/edit`} className="text-[var(--accent)] hover:underline">
                      Add them
                    </Link>
                  ) : null}
                </p>
              )}
            </CardContent>
          </Card>

          {meeting.decisions ? (
            <Card>
              <CardHeader>
                <CardTitle>Decisions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{meeting.decisions}</p>
              </CardContent>
            </Card>
          ) : null}

          <ActionItems
            meetingId={id}
            items={actionItems}
            users={options.users}
            canWrite={canWrite}
            canCreateTasks={actor.can('task:write', meeting.company_id)}
          />

          <NotesPanel
            target={{ entityType: 'meeting', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', meeting.company_id)}
          />
          <CommentsPanel
            target={{ entityType: 'meeting', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={1}
                items={[
                  { label: 'When', value: fmtDateTime(meeting.starts_at) },
                  { label: 'Duration', value: `${Math.round((+new Date(meeting.ends_at) - +new Date(meeting.starts_at)) / 60000)} minutes` },
                  {
                    label: 'Where',
                    value: meeting.location ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" /> {meeting.location}
                      </span>
                    ) : '—',
                  },
                  { label: 'Organiser', value: meeting.owner_name ?? '—' },
                  { label: 'Calendar', value: meeting.calendar_name ?? '—' },
                  { label: 'Follow-up', value: meeting.follow_up_date ? fmtDate(meeting.follow_up_date) : '—' },
                  {
                    label: 'Source',
                    value: meeting.external_url ? (
                      <a href={meeting.external_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        Open original <ExternalLink className="size-3" />
                      </a>
                    ) : 'Created here',
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Participants ({participants.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {participants.length === 0 ? (
                <p className="text-sm text-[var(--fg-muted)]">No participants recorded.</p>
              ) : (
                participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <Avatar name={p.name ?? p.email ?? '?'} size={28} />
                    <div className="min-w-0 flex-1">
                      {p.contact_id ? (
                        <Link href={`/crm/contacts/${p.contact_id}`} className="block truncate text-sm font-medium hover:underline">
                          {p.name ?? p.email}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium">{p.name ?? p.email}</p>
                      )}
                      <p className="truncate text-xs text-[var(--fg-subtle)]">{p.email ?? ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {p.is_organizer ? <Badge tone="accent">Host</Badge> : null}
                      <StatusBadge
                        status={p.response === 'needs_action' ? 'pending' : p.response}
                        label={titleCase(p.response === 'needs_action' ? 'No reply' : p.response)}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagsPanel
                target={{ entityType: 'meeting', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=meeting&id=${id}&company=${meeting.company_slug}`}
            canWrite={actor.can('knowledge:write', meeting.company_id)}
          />

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
