'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { ActionResult } from '@/lib/validation/schemas';

/**
 * Shared archive/restore control. Every archive requires a reason, which is
 * written to the audit log — archiving is the only "delete" for business
 * records, and it is always reversible and always attributable.
 */
export function ArchiveRecord({
  label,
  archived,
  action,
  description,
  triggerVariant = 'ghost',
}: {
  label: string;
  archived: boolean;
  action: (payload: { archived: boolean; reason: string }) => Promise<ActionResult<unknown>>;
  description?: string;
  triggerVariant?: 'ghost' | 'danger' | 'secondary';
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const submit = async () => {
    setPending(true);
    const result = await action({ archived: !archived, reason });
    setPending(false);
    if (result.ok) {
      toast.success(archived ? `${label} restored` : `${label} archived`);
      setOpen(false);
      setReason('');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>
          {archived ? <RotateCcw /> : <Archive />}
          {archived ? 'Restore' : 'Archive'}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {archived ? 'Restore' : 'Archive'} {label}
          </DialogTitle>
          <DialogDescription>
            {description ??
              'Archived records are hidden from lists but never deleted. You can restore this at any time.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="archive-record-reason" required>
              Reason
            </Label>
            <Input
              id="archive-record-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this changing?"
              autoFocus
            />
            <p className="text-xs text-[var(--fg-subtle)]">
              Recorded in the audit log with your name and the time.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={archived ? 'primary' : 'danger'}
            disabled={reason.trim().length < 4}
            loading={pending}
            onClick={submit}
          >
            {archived ? 'Restore' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
