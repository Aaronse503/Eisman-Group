'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, UserCog, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label, Progress } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import { cn, titleCase } from '@/lib/utils';
import { reassignManagerAction } from '@/server/actions/team';

export interface OrgNodeView {
  id: string;
  full_name: string;
  title: string;
  kind: string;
  status: string;
  is_vacant: boolean;
  department_name: string | null;
  capacity_hours: number;
  allocated_pct: number;
  assigned_clients: number;
  company_name: string;
  manager_id: string | null;
  children: OrgNodeView[];
}

export function OrgChart({
  roots,
  everyone,
  canEdit,
}: {
  roots: OrgNodeView[];
  everyone: { id: string; full_name: string; title: string }[];
  canEdit: boolean;
}) {
  const [target, setTarget] = React.useState<OrgNodeView | null>(null);

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No one on the chart yet"
        description="Add people to this company to build the reporting structure."
      />
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {roots.map((node) => (
          <OrgBranch key={node.id} node={node} depth={0} canEdit={canEdit} onReassign={setTarget} />
        ))}
      </ul>
      <ReassignDialog
        target={target}
        everyone={everyone}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

function OrgBranch({
  node,
  depth,
  canEdit,
  onReassign,
}: {
  node: OrgNodeView;
  depth: number;
  canEdit: boolean;
  onReassign: (node: OrgNodeView) => void;
}) {
  const [open, setOpen] = React.useState(depth < 2);
  const utilisation = Math.min(node.allocated_pct, 100);

  return (
    <li>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border bg-[var(--surface)] p-3',
          node.is_vacant ? 'border-dashed border-[var(--border-strong)]' : 'border-[var(--border)]',
        )}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Collapse reports' : 'Expand reports'}
            className="rounded p-0.5 text-[var(--fg-subtle)] hover:text-[var(--fg)]"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-5" aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {node.is_vacant ? (
              <span className="font-medium text-[var(--fg-muted)] italic">{node.full_name}</span>
            ) : (
              <Link href={`/team/${node.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
                {node.full_name}
              </Link>
            )}
            {node.is_vacant ? <Badge tone="warning">Open role</Badge> : null}
            <Badge tone="outline">{titleCase(node.kind)}</Badge>
            {node.status !== 'active' ? <Badge tone="neutral">{titleCase(node.status)}</Badge> : null}
          </div>
          <p className="truncate text-xs text-[var(--fg-subtle)]">
            {[node.title, node.department_name].filter(Boolean).join(' · ')}
            {node.children.length ? ` · ${node.children.length} direct report${node.children.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        {!node.is_vacant ? (
          <div className="w-32 shrink-0">
            <div className="flex items-center justify-between text-[11px] text-[var(--fg-subtle)]">
              <span>Allocated</span>
              <span className="tnum">{node.allocated_pct}%</span>
            </div>
            <Progress
              value={utilisation}
              tone={node.allocated_pct > 100 ? 'danger' : node.allocated_pct > 85 ? 'warning' : 'accent'}
            />
            <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">
              {node.assigned_clients} client{node.assigned_clients === 1 ? '' : 's'} · {node.capacity_hours}h/wk
            </p>
          </div>
        ) : null}

        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => onReassign(node)}>
            <UserCog /> <span className="hidden sm:inline">Reassign</span>
          </Button>
        ) : null}
      </div>

      {open && node.children.length > 0 ? (
        <ul className="mt-2 space-y-2 border-l border-[var(--border)] pl-4 sm:pl-6">
          {node.children.map((child) => (
            <OrgBranch key={child.id} node={child} depth={depth + 1} canEdit={canEdit} onReassign={onReassign} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ReassignDialog({
  target,
  everyone,
  onClose,
}: {
  target: OrgNodeView | null;
  everyone: { id: string; full_name: string; title: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [managerId, setManagerId] = React.useState('none');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setManagerId(target?.manager_id ?? 'none');
    setReason('');
  }, [target]);

  const submit = async () => {
    if (!target) return;
    setPending(true);
    const result = await reassignManagerAction({ memberId: target.id, managerId, reason });
    setPending(false);
    if (result.ok) {
      toast.success('Reporting line updated and logged');
      onClose();
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Change who {target?.full_name} reports to</DialogTitle>
          <DialogDescription>
            Reporting changes are recorded in the org change log and the audit log with your reason.
            Circular reporting lines are rejected.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reassign-manager">Reports to</Label>
            <NativeSelect
              id="reassign-manager"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="none">Nobody (top of the chart)</option>
              {everyone
                .filter((p) => p.id !== target?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} — {p.title}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reassign-reason" required>
              Reason
            </Label>
            <Input
              id="reassign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Moving delivery under Operations"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} disabled={reason.trim().length < 4} onClick={submit}>
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
