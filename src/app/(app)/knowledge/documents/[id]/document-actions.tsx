'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { deleteDocumentAction, reindexDocumentAction } from '@/server/actions/knowledge';

export function DocumentActions({
  documentId,
  name,
  canReindex,
}: {
  documentId: string;
  name: string;
  canReindex: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Document actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canReindex ? (
            <DropdownMenuItem
              onSelect={async () => {
                const result = await reindexDocumentAction(documentId);
                if (result.ok) {
                  toast.success(`Re-indexed into ${result.data.chunks} passage(s)`);
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              <RefreshCw /> Re-index for search
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete {name}</DialogTitle>
            <DialogDescription>
              The document is removed from lists and from the search index. The stored file is kept,
              and the deletion is recorded in the audit log with your reason.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="delete-reason" required>
              Reason
            </Label>
            <Input
              id="delete-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={reason.trim().length < 4}
              onClick={async () => {
                setPending(true);
                const result = await deleteDocumentAction(documentId, reason);
                setPending(false);
                if (result.ok) {
                  toast.success('Document deleted');
                  router.push('/knowledge');
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
