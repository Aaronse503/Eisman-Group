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
import { setCompanyArchivedAction } from '@/server/actions/companies';

export function ArchiveCompany({
  companyId,
  companyName,
  archived,
}: {
  companyId: string;
  companyName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [confirmName, setConfirmName] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const canSubmit = reason.trim().length >= 4 && (archived || confirmName.trim() === companyName);

  const submit = async () => {
    setPending(true);
    const result = await setCompanyArchivedAction({ companyId, archived: !archived, reason });
    setPending(false);
    if (result.ok) {
      toast.success(archived ? `${companyName} restored` : `${companyName} archived`);
      setOpen(false);
      setReason('');
      setConfirmName('');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={archived ? 'secondary' : 'danger'}>
          {archived ? <RotateCcw /> : <Archive />}
          {archived ? 'Restore company' : 'Archive company'}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{archived ? 'Restore' : 'Archive'} {companyName}</DialogTitle>
          <DialogDescription>
            {archived
              ? 'The company will reappear in the switcher and in consolidated views.'
              : 'The company is hidden from the switcher and consolidated views. No records are deleted.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="archive-reason" required>
              Reason
            </Label>
            <Input
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wound down at the end of the fiscal year"
            />
            <p className="text-xs text-[var(--fg-subtle)]">Recorded in the audit log with your name.</p>
          </div>
          {!archived ? (
            <div className="space-y-1.5">
              <Label htmlFor="archive-confirm" required>
                Type <span className="font-mono">{companyName}</span> to confirm
              </Label>
              <Input
                id="archive-confirm"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={archived ? 'primary' : 'danger'}
            disabled={!canSubmit}
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
