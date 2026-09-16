'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, List, Video } from 'lucide-react';
import {
  addDays, endOfWeek, fmtDate, fmtTime, startOfWeek, toDate,
} from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { cn, titleCase } from '@/lib/utils';
import { MEETING_TEMPLATES, type MeetingRow } from '@/lib/domain/meetings';

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CalendarView({
  meetings,
  weekStart,
  showCompany,
}: {
  meetings: MeetingRow[];
  weekStart: string;
  showCompany: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [template, setTemplate] = React.useState('all');

  const filtered = React.useMemo(
    () => (template === 'all' ? meetings : meetings.filter((m) => m.template === template)),
    [meetings, template],
  );

  const start = startOfWeek(new Date(`${weekStart}T12:00:00Z`), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, MeetingRow[]>();
  for (const m of filtered) {
    const key = dayKey(new Date(m.starts_at));
    byDay.set(key, [...(byDay.get(key) ?? []), m]);
  }

  const shiftWeek = (weeks: number) => {
    const params = new URLSearchParams(search.toString());
    params.set('week', dayKey(addDays(start, weeks * 7)));
    router.push(`${pathname}?${params.toString()}`);
  };

  const todayKey = dayKey(new Date());
  const upcoming = filtered
    .filter((m) => new Date(m.ends_at) >= new Date())
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const past = filtered
    .filter((m) => new Date(m.ends_at) < new Date())
    .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));

  const filterBar = (
    <NativeSelect
      aria-label="Filter by meeting type"
      value={template}
      onChange={(e) => setTemplate(e.target.value)}
      className="h-9 w-[12rem]"
    >
      <option value="all">All meeting types</option>
      {MEETING_TEMPLATES.map((t) => (
        <option key={t.id} value={t.id}>{t.label}</option>
      ))}
    </NativeSelect>
  );

  return (
    <Tabs defaultValue="week">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TabsList className="w-auto">
          <TabsTrigger value="week">
            <CalendarDays className="size-3.5" /> Week
          </TabsTrigger>
          <TabsTrigger value="list">
            <List className="size-3.5" /> List
          </TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">{filterBar}</div>
      </div>

      <TabsContent value="week">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon-sm" onClick={() => shiftWeek(-1)} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="icon-sm" onClick={() => shiftWeek(1)} aria-label="Next week">
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const params = new URLSearchParams(search.toString());
                params.delete('week');
                router.push(`${pathname}?${params.toString()}`);
              }}
            >
              Today
            </Button>
          </div>
          <p className="text-sm font-medium">
            {fmtDate(start, 'MMM d')} – {fmtDate(endOfWeek(start, { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const items = (byDay.get(key) ?? []).sort(
              (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
            );
            return (
              <div
                key={key}
                className={cn(
                  'flex min-h-32 flex-col rounded-[var(--radius-card)] border bg-[var(--surface)] p-2',
                  key === todayKey ? 'border-[var(--accent)]' : 'border-[var(--border)]',
                )}
              >
                <p
                  className={cn(
                    'mb-2 text-xs font-semibold',
                    key === todayKey ? 'text-[var(--accent)]' : 'text-[var(--fg-subtle)]',
                  )}
                >
                  {fmtDate(day, 'EEE d')}
                </p>
                <div className="space-y-1.5">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-[var(--fg-subtle)]">—</p>
                  ) : (
                    items.map((m) => (
                      <Link
                        key={m.id}
                        href={`/calendar/${m.id}`}
                        className="block rounded-md border-l-2 bg-[var(--surface-sunken)] px-2 py-1.5 transition-colors hover:bg-[var(--accent-soft)]"
                        style={{ borderLeftColor: 'var(--accent)' }}
                      >
                        <span className="tnum block text-[11px] text-[var(--fg-subtle)]">
                          {fmtTime(m.starts_at)}
                        </span>
                        <span className="block truncate text-xs font-medium">{m.title}</span>
                        {m.client_name ? (
                          <span className="block truncate text-[11px] text-[var(--fg-subtle)]">
                            {m.client_name}
                          </span>
                        ) : null}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TabsContent>

      <TabsContent value="list">
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled"
                description="Create a meeting, or connect Google Calendar under Integrations."
              />
            ) : (
              <div className="space-y-2">
                {upcoming.map((m) => (
                  <MeetingRowCard key={m.id} meeting={m} showCompany={showCompany} />
                ))}
              </div>
            )}
          </section>

          {past.length ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
                Past ({past.length})
              </h2>
              <div className="space-y-2">
                {past.map((m) => (
                  <MeetingRowCard key={m.id} meeting={m} showCompany={showCompany} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function MeetingRowCard({ meeting, showCompany }: { meeting: MeetingRow; showCompany: boolean }) {
  const start = toDate(meeting.starts_at)!;
  return (
    <Card className="transition-colors hover:border-[var(--accent)]/45">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        <div className="w-16 shrink-0 text-center">
          <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">
            {fmtDate(start, 'MMM')}
          </p>
          <p className="tnum text-xl leading-none font-semibold">{fmtDate(start, 'd')}</p>
          <p className="tnum text-[11px] text-[var(--fg-subtle)]">{fmtTime(start)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/calendar/${meeting.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
            {meeting.title}
          </Link>
          <p className="truncate text-xs text-[var(--fg-subtle)]">
            {[
              titleCase(meeting.template),
              meeting.client_name,
              showCompany ? meeting.company_name : null,
              meeting.location,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {meeting.open_action_items > 0 ? (
            <Badge tone="warning">{meeting.open_action_items} open actions</Badge>
          ) : null}
          {meeting.participant_count ? (
            <Badge tone="outline">{meeting.participant_count} attending</Badge>
          ) : null}
          {meeting.meeting_url ? (
            <a
              href={meeting.meeting_url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            >
              <Video className="size-3.5" /> Join
            </a>
          ) : null}
          {meeting.source !== 'internal' ? <Badge tone="accent">Synced</Badge> : null}
          {meeting.is_demo ? <Badge tone="gold">Demo</Badge> : null}
          <StatusBadge status={meeting.status} />
        </div>
      </CardContent>
    </Card>
  );
}
