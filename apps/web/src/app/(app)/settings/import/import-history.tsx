'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { fmtDateTime } from '@/lib/dates';
import { titleCase } from '@/lib/utils';
import { rollbackImportAction } from '@/server/actions/import';

interface ImportView {
  id: string;
  entityType: string;
  filename: string;
  status: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  rolledBackAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  company: string | null;
}

export function ImportHistory({ imports }: { imports: ImportView[] }) {
  const router = useRouter();
  const [target, setTarget] = React.useState<ImportView | null>(null);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  if (!imports.length) {
    return <EmptyState title="No imports yet" description="Files you import will be listed here with their results." />;
  }

  return (
    <>
      <div className="space-y-2">
        {imports.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.filename}</p>
              <p className="text-xs text-[var(--fg-subtle)]">
                {titleCase(item.entityType)}
                {item.company ? ` · ${item.company}` : ''} · {item.createdBy ?? 'Unknown'} ·{' '}
                {fmtDateTime(item.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="success">{item.created} created</Badge>
              {item.updated ? <Badge tone="info">{item.updated} updated</Badge> : null}
              {item.skipped ? <Badge tone="neutral">{item.skipped} skipped</Badge> : null}
              {item.failed ? <Badge tone="danger">{item.failed} failed</Badge> : null}
              <StatusBadge status={item.rolledBackAt ? 'cancelled' : item.status} />
              {!item.rolledBackAt && item.created > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTarget(item);
                    setReason('');
                  }}
                >
                  <Undo2 /> Roll back
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Roll back this import</DialogTitle>
            <DialogDescription>
              This deletes the {target?.created} record(s) the import created.
              {target?.updated
                ? ` The ${target.updated} record(s) it updated are left as they are — their previous values were not snapshotted, so reverting them would be a guess.`
                : ''}{' '}
              The rollback is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="rollback-reason" required>
              Reason
            </Label>
            <Input
              id="rollback-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong file — these belong to a different company"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={reason.trim().length < 4}
              onClick={async () => {
                if (!target) return;
                setPending(true);
                const result = await rollbackImportAction(target.id, reason);
                setPending(false);
                if (result.ok) {
                  toast.success(`Removed ${result.data.removed} record(s)`);
                  setTarget(null);
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Roll back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
