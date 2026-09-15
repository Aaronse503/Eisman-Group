'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monitor, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtDateTime, fmtRelative } from '@/lib/dates';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/server/actions/auth';

interface SessionView {
  id: string;
  issuedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

/** Turns a user-agent string into something a person can recognise. */
function describeAgent(agent: string | null) {
  if (!agent) return 'Unknown device';
  const browser =
    /Edg\//.test(agent) ? 'Edge'
    : /Chrome\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) && !/Chrome/.test(agent) ? 'Safari'
    : /Firefox\//.test(agent) ? 'Firefox'
    : 'Browser';
  const os =
    /Windows/.test(agent) ? 'Windows'
    : /Mac OS X|Macintosh/.test(agent) ? 'macOS'
    : /Android/.test(agent) ? 'Android'
    : /iPhone|iPad/.test(agent) ? 'iOS'
    : /Linux/.test(agent) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

export function SessionsList({ sessions }: { sessions: SessionView[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const others = sessions.filter((s) => !s.current);

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Monitor className="mt-0.5 size-4 shrink-0 text-[var(--fg-subtle)]" />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {describeAgent(session.userAgent)}
                {session.current ? <Badge tone="success">This device</Badge> : null}
              </p>
              <p className="text-xs text-[var(--fg-subtle)]">
                {session.ip ?? 'Unknown address'} · active {fmtRelative(session.lastSeenAt)} · expires{' '}
                {fmtDateTime(session.expiresAt)}
              </p>
            </div>
          </div>
          {!session.current ? (
            <Button
              variant="ghost"
              size="sm"
              loading={pending === session.id}
              onClick={async () => {
                setPending(session.id);
                const result = await revokeSessionAction(session.id);
                setPending(null);
                if (result.ok) {
                  toast.success('Session revoked');
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Revoke
            </Button>
          ) : null}
        </div>
      ))}

      {others.length ? (
        <Button
          variant="danger"
          size="sm"
          loading={pending === 'all'}
          onClick={async () => {
            setPending('all');
            const result = await revokeOtherSessionsAction();
            setPending(null);
            if (result.ok) {
              toast.success('All other devices signed out');
              router.refresh();
            }
          }}
        >
          <ShieldOff /> Sign out all other devices
        </Button>
      ) : null}
    </div>
  );
}
