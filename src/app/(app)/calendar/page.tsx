import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listMeetings, getUpcomingActionItems } from '@/lib/queries/meetings';
import { addDays, startOfWeek, fmtDate } from '@/lib/dates';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { CalendarView } from './calendar-view';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('calendar:read', scope.companyId)) return <ForbiddenState permission="calendar:read" />;

  const weekParam = Array.isArray(params.week) ? params.week[0] : params.week;
  const anchor = weekParam ? new Date(`${weekParam}T12:00:00Z`) : new Date();
  const start = startOfWeek(anchor, { weekStartsOn: 1 });

  const [meetings, actionItems] = await Promise.all([
    listMeetings({
      companyIds: scope.companyIds,
      from: addDays(start, -60),
      to: addDays(start, 90),
    }),
    getUpcomingActionItems(scope.companyIds, actor.user.id),
  ]);

  const canWrite = actor.can('calendar:write', scope.companyId);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Meetings, agendas, notes and the action items that come out of them."
        actions={
          canWrite ? (
            <Button asChild variant="primary">
              <Link href={`/calendar/new${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                <Plus /> New meeting
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <CalendarView
            meetings={meetings}
            weekStart={start.toISOString().slice(0, 10)}
            showCompany={scope.isHoldings}
          />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your action items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {actionItems.length === 0 ? (
                <p className="text-sm text-[var(--fg-muted)]">Nothing outstanding from your meetings.</p>
              ) : (
                actionItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--border)] p-2.5 text-sm">
                    <p>{item.text}</p>
                    <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                      {item.meeting_id ? (
                        <Link href={`/calendar/${item.meeting_id}`} className="hover:underline">
                          {item.meeting_title}
                        </Link>
                      ) : null}
                      {item.due_date ? ` · due ${fmtDate(item.due_date)}` : ''}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calendar sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
              <p>
                Meetings created here live in this system. Connect Google Calendar to pull in
                external events, attendees and conference links.
              </p>
              <Button asChild variant="secondary" size="sm">
                <Link href="/integrations#google_calendar">Calendar integration</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
