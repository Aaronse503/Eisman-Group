import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { runDueReminders } from '@/lib/api/reminders';

/**
 * Delivers reminders that have come due.
 *
 * Called by a scheduler, not by a person, so it authenticates with
 * `CRON_SECRET` rather than a session. With no secret configured the endpoint
 * refuses to run at all: an open endpoint that writes notifications to other
 * people is not a safe default.
 */
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return false;
  const given = Buffer.from(value.trim());
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Reminder delivery is not configured. Set CRON_SECRET and call this endpoint on a schedule.',
        code: 'not_configured',
      },
      { status: 503 },
    );
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'Not authorised.', code: 'unauthenticated' }, { status: 401 });
  }

  const result = await runDueReminders();
  return NextResponse.json(result);
}
