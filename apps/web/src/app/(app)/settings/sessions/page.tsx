import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { listSessionsForUser } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SessionsList } from './sessions-list';

export const metadata: Metadata = { title: 'Sessions' };
export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const actor = await requireActor();
  const sessions = await listSessionsForUser(actor.user.id);

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Every device currently signed in as you. Sessions expire automatically; revoking one
            signs that device out immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsList
            sessions={sessions.map((s) => ({
              id: s.id,
              issuedAt: s.issued_at,
              lastSeenAt: s.last_seen_at,
              expiresAt: s.expires_at,
              ip: s.ip,
              userAgent: s.user_agent,
              current: s.id === actor.sessionId,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
