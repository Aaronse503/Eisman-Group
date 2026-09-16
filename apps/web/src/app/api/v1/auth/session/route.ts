import { authed } from '@/lib/api/route';
import { sessionPayload } from '@/lib/api/session-payload';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { headers, cookies } from 'next/headers';

/**
 * The current session, for a device resuming after being closed.
 *
 * The token is echoed back so the client can keep one object; nothing new is
 * issued. If the session has expired or been revoked, this is a 401 and the
 * device knows to sign in again.
 */
export const GET = authed(async ({ actor }) => {
  const authorization = (await headers()).get('authorization');
  const bearer = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : undefined;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value ?? '';

  return sessionPayload(actor, token, actor.sessionExpiresAt);
});
