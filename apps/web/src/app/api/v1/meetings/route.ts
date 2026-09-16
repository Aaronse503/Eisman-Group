import type { MeetingSummary } from '@eisman/shared';
import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { listMeetings } from '@/lib/queries/meetings';
import { createMeetingAction } from '@/server/actions/meetings';

/**
 * Meetings in a window. Defaults to the next fortnight, which is what the
 * mobile calendar opens on.
 */
export const GET = authed<{ items: MeetingSummary[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const from = params.get('from') ? new Date(params.get('from')!) : new Date();
  const to = params.get('to')
    ? new Date(params.get('to')!)
    : new Date(Date.now() + 14 * 86_400_000);

  const rows = await listMeetings({
    companyIds: scope.companyIds,
    from,
    to,
    limit: Math.min(Number(params.get('limit') ?? 100), 200),
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: new Date(r.starts_at).toISOString(),
      endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
      location: r.location,
      conferenceUrl: r.meeting_url,
      clientName: r.client_name,
      companyName: r.company_name,
      participantCount: r.participant_count ?? 0,
      status: r.status,
      isDemo: r.is_demo,
    })),
  };
});

/** Creates a meeting. */
export const POST = authed(async ({ request }) => {
  const result = await createMeetingAction(await jsonBody(request));
  if (!result.ok) throw badRequest(result.error, result.fields);
  return { id: result.data.id };
});
