'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import { scheduleInvestorFollowUpAction } from '@/server/actions/growth';

function local(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function FollowUpScheduler({
  investorId,
  current,
}: {
  investorId: string;
  current: Date | string | null;
}) {
  const router = useRouter();
  const [when, setWhen] = React.useState(current ? local(new Date(current)) : '');
  const [pending, setPending] = React.useState(false);

  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setWhen(local(d));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await scheduleInvestorFollowUpAction(investorId, when);
    setPending(false);
    if (result.ok) {
      toast.success('Follow-up scheduled and a reminder created');
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-[var(--border)] pt-3">
      <Label htmlFor="follow-up-at">Schedule a follow-up</Label>
      <Input
        id="follow-up-at"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        required
      />
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'In 3 days', days: 3 },
          { label: 'Next week', days: 7 },
          { label: 'In 2 weeks', days: 14 },
          { label: 'In a month', days: 30 },
        ].map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => quick(p.days)}
            className="rounded-full border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {p.label}
          </button>
        ))}
      </div>
      <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!when} className="w-full">
        <CalendarClock /> Schedule
      </Button>
    </form>
  );
}
