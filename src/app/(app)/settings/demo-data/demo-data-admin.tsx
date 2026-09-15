'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DEMO_RESET_PHRASE } from '@/lib/validation/demo';
import { resetDemoDataAction, type DemoResetSummary } from '@/server/actions/demo';

export function DemoDataAdmin({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reseed, setReseed] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<DemoResetSummary | null>(null);

  function reset() {
    setConfirm('');
    setReason('');
    setReseed(true);
  }

  async function submit() {
    setPending(true);
    const res = await resetDemoDataAction({ confirm, reason, reseed });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResult(res.data);
    setOpen(false);
    reset();
    toast.success(
      res.data.reseeded
        ? `Cleared ${res.data.deletedTotal.toLocaleString()} demo records and reseeded.`
        : `Cleared ${res.data.deletedTotal.toLocaleString()} demo records.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
        <p className="text-[var(--fg-muted)]">
          A reset removes the sample clients, tasks, documents, invoices, ParFax activity and the
          demo sign-ins. Your account, your companies and your settings stay exactly as they are.
        </p>
      </div>

      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="size-4" />
        Reset demo data
      </Button>
      {disabled ? (
        <p className="text-xs text-[var(--fg-subtle)]">
          <code>DISABLE_DEMO_DATA=true</code> is set, so demo data cannot be cleared or seeded here.
        </p>
      ) : null}

      {result ? (
        <div className="rounded-lg border border-[var(--border)] p-4 text-sm">
          <p className="font-medium">
            {result.reseeded ? 'Demo data reset and reseeded' : 'Demo data cleared'}
          </p>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            {result.deletedTotal.toLocaleString()} rows deleted
            {result.reseeded
              ? `, ${Object.values(result.counts).reduce((a, b) => a + b, 0).toLocaleString()} demo records seeded.`
              : '.'}
          </p>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset demo data</DialogTitle>
            <DialogDescription>
              Only rows flagged as demo are deleted. Records you created are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--border)] p-3">
              <div>
                <Label htmlFor="demo-reseed">Reseed afterwards</Label>
                <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                  Rebuild a fresh demo dataset once the old one is cleared. Turn this off to leave the
                  system empty of demo data.
                </p>
              </div>
              <Switch id="demo-reseed" checked={reseed} onCheckedChange={setReseed} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-reason">Reason</Label>
              <Input
                id="demo-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you resetting demo data?"
              />
              <p className="text-xs text-[var(--fg-subtle)]">Stored with your name in the audit log.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-confirm">
                Type <span className="font-mono">{DEMO_RESET_PHRASE}</span> to confirm
              </Label>
              <Input
                id="demo-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={submit}
              disabled={pending || confirm.trim() !== DEMO_RESET_PHRASE || reason.trim().length < 4}
            >
              {pending ? (reseed ? 'Resetting and reseeding…' : 'Resetting…') : 'Reset demo data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
