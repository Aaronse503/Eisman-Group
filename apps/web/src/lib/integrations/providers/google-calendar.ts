import { sql } from '@/lib/db/client';
import { upsertMapped } from '../mapping';
import {
  providerFetch,
  IntegrationError,
  type IntegrationAdapter,
  type SyncContext,
  type SyncResult,
} from '../types';

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string; organizer?: boolean }[];
}

/** Builds the consent URL. Only calendar scopes are ever requested. */
export function buildAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  return (await providerFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })) as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
}

async function accessToken(credentials: Record<string, string>) {
  if (credentials.accessToken && Number(credentials.expiresAt ?? 0) > Date.now() + 60_000) {
    return credentials.accessToken;
  }
  if (!credentials.refreshToken) {
    throw new IntegrationError(
      'The Google Calendar connection needs to be re-authorised.',
      'No valid access token or refresh token is stored.',
    );
  }
  const refreshed = (await providerFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId!,
      client_secret: credentials.clientSecret!,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })) as { access_token: string; expires_in: number };
  return refreshed.access_token;
}

function demoEvents(): { calendarId: string; calendarName: string; events: GoogleEvent[] }[] {
  const now = Date.now();
  const mk = (i: number, title: string, offsetDays: number, minutes: number): GoogleEvent => {
    const start = new Date(now + offsetDays * 86_400_000);
    start.setUTCHours(15, 0, 0, 0);
    return {
      id: `demo-gcal-${i}`,
      status: 'confirmed',
      summary: title,
      description: 'Demo calendar event. No Google request was made.',
      location: 'Google Meet',
      hangoutLink: 'https://meet.google.com/demo-abc-defg',
      start: { dateTime: start.toISOString(), timeZone: 'America/New_York' },
      end: { dateTime: new Date(start.getTime() + minutes * 60_000).toISOString(), timeZone: 'America/New_York' },
      attendees: [{ email: 'aaron@eismandigital.com', responseStatus: 'accepted', organizer: true }],
    };
  };
  return [
    {
      calendarId: 'demo-primary',
      calendarName: 'Work (demo)',
      events: [
        mk(1, 'Northwind — monthly performance review', 2, 45),
        mk(2, 'ParFax partnership sync', 4, 30),
        mk(3, 'Investor call — Fairway Ventures', 6, 30),
        mk(4, 'Weekly executive review', 7, 60),
        mk(5, 'Creative review — Saltwater Athletic', -3, 45),
      ],
    },
  ];
}

export const googleCalendarAdapter: IntegrationAdapter = {
  id: 'google_calendar',

  async test(credentials) {
    const token = await accessToken(credentials);
    const list = (await providerFetch(`${API}/users/me/calendarList?maxResults=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })) as { items?: { id: string; summary: string; primary?: boolean }[] };
    const primary = list.items?.find((c) => c.primary) ?? list.items?.[0];
    return {
      ok: true,
      accountId: primary?.id,
      accountName: primary?.id ?? 'Google Calendar',
      scopes: GOOGLE_SCOPES,
      message: `Connected. ${list.items?.length ?? 0} calendar(s) visible.`,
    };
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const log: SyncResult['log'] = [];
    const push = (level: 'info' | 'warn' | 'error', message: string) => {
      log.push({ level, message, at: new Date().toISOString() });
      ctx.log(level, message);
    };
    if (!ctx.companyId) throw new IntegrationError('Google Calendar must be connected to a company.');

    let sources: { calendarId: string; calendarName: string; events: GoogleEvent[] }[];

    if (ctx.demo) {
      sources = demoEvents();
      push('info', 'Demo mode: using built-in calendar fixtures. No Google request was made.');
    } else {
      const token = await accessToken(ctx.credentials);
      const headers = { Authorization: `Bearer ${token}` };
      const list = (await providerFetch(`${API}/users/me/calendarList?maxResults=50`, { headers })) as {
        items?: { id: string; summary: string; timeZone?: string; selected?: boolean }[];
      };
      const enabled = (ctx.connection.config.calendarIds as string[] | undefined) ?? null;
      const timeMin = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const timeMax = new Date(Date.now() + 120 * 86_400_000).toISOString();
      sources = [];
      for (const cal of list.items ?? []) {
        if (enabled && !enabled.includes(cal.id)) continue;
        const page = (await providerFetch(
          `${API}/calendars/${encodeURIComponent(cal.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${timeMin}&timeMax=${timeMax}`,
          { headers },
        )) as { items?: GoogleEvent[] };
        sources.push({ calendarId: cal.id, calendarName: cal.summary, events: page.items ?? [] });
      }
      push('info', `Read ${sources.reduce((n, s) => n + s.events.length, 0)} event(s) across ${sources.length} calendar(s).`);
    }

    const contacts = await sql<{ id: string; email: string | null }>(
      `select id, email from contacts where company_id = $1 and email is not null and deleted_at is null`,
      [ctx.companyId],
    );
    const contactByEmail = new Map(contacts.map((c) => [c.email!.toLowerCase(), c.id]));
    const users = await sql<{ id: string; email: string }>(`select id, email from users`);
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    let written = 0;
    let conflicts = 0;
    let read = 0;

    for (const source of sources) {
      const existing = await sql<{ id: string }>(
        `select id from calendars where company_id = $1 and external_id = $2 and provider = 'google'`,
        [ctx.companyId, source.calendarId],
      );
      const calendarId =
        existing[0]?.id ??
        (
          await sql<{ id: string }>(
            `insert into calendars (company_id, connection_id, name, external_id, provider, is_demo)
             values ($1,$2,$3,$4,'google',$5) returning id`,
            [ctx.companyId, ctx.connection.id, source.calendarName, source.calendarId, ctx.demo],
          )
        )[0]!.id;

      for (const event of source.events) {
        read++;
        if (event.status === 'cancelled') continue;
        const startsAt = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00Z` : null);
        const endsAt = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T23:59:59Z` : null);
        if (!startsAt || !endsAt) continue;

        const r = await upsertMapped({
          connectionId: ctx.connection.id,
          provider: 'google_calendar',
          entityType: 'meeting',
          externalId: event.id,
          table: 'meetings',
          values: {
            company_id: ctx.companyId,
            calendar_id: calendarId,
            title: event.summary ?? '(no title)',
            location: event.location ?? null,
            meeting_url: event.hangoutLink ?? null,
            starts_at: new Date(startsAt),
            ends_at: new Date(endsAt),
            timezone: event.start?.timeZone ?? 'America/New_York',
            all_day: Boolean(event.start?.date),
            agenda: event.description ?? null,
            status: new Date(endsAt) < new Date() ? 'held' : 'scheduled',
            source: 'google_calendar',
            external_id: event.id,
            external_url: event.htmlLink ?? null,
            external_synced_at: new Date(),
            is_demo: ctx.demo,
          },
          matchOn: [
            { column: 'source', value: 'google_calendar' },
            { column: 'external_id', value: event.id },
          ],
          // Meeting notes, decisions and associations are authored here.
          localOwnedColumns: ['notes', 'decisions', 'client_id', 'project_id', 'template', 'follow_up_date'],
        });
        if (r.action === 'conflict') {
          conflicts++;
          continue;
        }
        written++;

        await sql(`delete from meeting_participants where meeting_id = $1`, [r.id]);
        for (const attendee of event.attendees ?? []) {
          const email = attendee.email?.toLowerCase();
          await sql(
            `insert into meeting_participants
               (meeting_id, user_id, contact_id, email, name, response, is_organizer)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [
              r.id,
              email ? (userByEmail.get(email) ?? null) : null,
              email ? (contactByEmail.get(email) ?? null) : null,
              attendee.email ?? null,
              attendee.displayName ?? null,
              ['accepted', 'declined', 'tentative'].includes(attendee.responseStatus ?? '')
                ? attendee.responseStatus
                : 'needs_action',
              attendee.organizer ?? false,
            ],
          );
        }
      }
    }

    push('info', `Wrote ${written} meeting(s).`);
    return { recordsRead: read, recordsWritten: written, conflicts, log };
  },
};
