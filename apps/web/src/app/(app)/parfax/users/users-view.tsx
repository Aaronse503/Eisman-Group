'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Download, Merge } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SourceBadge, StatusBadge } from '@/components/ui/status';
import { formatCurrency, formatNumber, titleCase } from '@/lib/utils';
import { fmtDate, fmtRelative } from '@/lib/dates';
import { downloadCsv } from '@/lib/csv/client';
import { exportParfaxUsersAction, mergeParfaxUsersAction } from '@/server/actions/parfax';
import type { ParfaxUserRow } from '@/lib/queries/parfax';

export function ParfaxUsersView({
  users,
  duplicates,
  canAdmin,
  canExport,
}: {
  users: ParfaxUserRow[];
  duplicates: { key: string; ids: string[]; emails: string[]; names: string[] }[];
  canAdmin: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportReason, setExportReason] = React.useState('');
  const [mergeTarget, setMergeTarget] = React.useState<{ ids: string[]; emails: string[] } | null>(null);
  const [keepId, setKeepId] = React.useState('');
  const [mergeReason, setMergeReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const filtered = React.useMemo(
    () =>
      users.filter((u) => {
        if (plan === 'paid' && u.plan === 'free') return false;
        if (plan === 'free' && u.plan !== 'free') return false;
        if (plan !== 'all' && plan !== 'paid' && plan !== 'free' && u.plan !== plan) return false;
        if (status !== 'all' && u.status !== status) return false;
        return true;
      }),
    [users, plan, status],
  );

  const columns = React.useMemo<ColumnDef<ParfaxUserRow, unknown>[]>(
    () => [
      {
        id: 'email',
        header: 'User',
        accessorKey: 'email',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/parfax/users/${row.original.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
              {row.original.name ?? row.original.email}
            </Link>
            <p className="truncate text-xs text-[var(--fg-subtle)]">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: 'plan',
        header: 'Plan',
        accessorKey: 'plan',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <Badge tone={row.original.plan === 'free' ? 'neutral' : 'accent'}>
              {titleCase(row.original.plan)}
            </Badge>
            {row.original.promo_access ? <Badge tone="gold">Promo</Badge> : null}
          </span>
        ),
      },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: 'subscription_status',
        header: 'Subscription',
        accessorKey: 'subscription_status',
        cell: ({ row }) =>
          row.original.subscription_status ? (
            <StatusBadge status={row.original.subscription_status} />
          ) : (
            <span className="text-[var(--fg-subtle)]">None</span>
          ),
      },
      { id: 'signup_at', header: 'Signed up', accessorKey: 'signup_at', cell: ({ row }) => fmtDate(row.original.signup_at) },
      { id: 'last_active_at', header: 'Last active', accessorKey: 'last_active_at', cell: ({ row }) => fmtRelative(row.original.last_active_at) },
      {
        id: 'scan_count',
        header: 'Scans',
        accessorKey: 'scan_count',
        cell: ({ row }) => <span className="tnum">{formatNumber(row.original.scan_count)}</span>,
      },
      {
        id: 'lifetime_value',
        header: 'LTV',
        accessorKey: 'lifetime_value',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.lifetime_value)}</span>,
      },
      {
        id: 'open_issues',
        header: 'Issues',
        accessorKey: 'open_issues',
        cell: ({ row }) =>
          row.original.open_issues > 0 ? (
            <Badge tone="warning">{row.original.open_issues}</Badge>
          ) : (
            <span className="text-[var(--fg-subtle)]">—</span>
          ),
      },
      { id: 'country', header: 'Region', accessorFn: (row) => [row.region, row.country].filter(Boolean).join(', '), cell: ({ row }) => [row.original.region, row.original.country].filter(Boolean).join(', ') || '—' },
      { id: 'acquisition_source', header: 'Source', accessorKey: 'acquisition_source', cell: ({ row }) => titleCase(row.original.acquisition_source ?? '—') },
      { id: 'source', header: 'Record source', accessorKey: 'source', cell: ({ row }) => <SourceBadge source={row.original.source} isDemo={row.original.is_demo} /> },
    ],
    [],
  );

  return (
    <>
      {duplicates.length > 0 && canAdmin ? (
        <Card className="mb-4 border-[var(--warning)]/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="size-4 text-[var(--warning)]" /> Possible duplicate accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {duplicates.slice(0, 5).map((d) => (
              <div key={d.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-[var(--fg-muted)]">{d.emails.join(' · ')}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMergeTarget({ ids: d.ids, emails: d.emails });
                    setKeepId(d.ids[0]!);
                    setMergeReason('');
                  }}
                >
                  <Merge /> Resolve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        data={filtered}
        columns={columns}
        searchPlaceholder="Search by email, name, handle or external id…"
        exportFilename="parfax-users-visible"
        initialSorting={[{ id: 'signup_at', desc: true }]}
        toolbar={
          <>
            <NativeSelect aria-label="Filter by plan" value={plan} onChange={(e) => setPlan(e.target.value)} className="h-9 w-[9rem]">
              <option value="all">All plans</option>
              <option value="free">Free</option>
              <option value="paid">Any paid</option>
              {['plus', 'pro', 'team', 'lifetime'].map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-[9rem]">
              <option value="all">All statuses</option>
              {['active', 'suspended', 'pending', 'deleted'].map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </NativeSelect>
            {canExport ? (
              <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
                <Download /> Full export
              </Button>
            ) : null}
          </>
        }
        emptyTitle="No ParFax users"
        emptyDescription="Connect the ParFax CRM under Integrations, or import a CSV export."
      />

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Export ParFax users</DialogTitle>
            <DialogDescription>
              Exports the permitted operational fields only. The export is recorded in the audit log
              with your name, the reason and the row count.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="export-reason" required>
              Why is this export needed?
            </Label>
            <Input
              id="export-reason"
              className="mt-1.5"
              value={exportReason}
              onChange={(e) => setExportReason(e.target.value)}
              placeholder="e.g. Quarterly cohort analysis for the board pack"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={exportReason.trim().length < 10}
              onClick={async () => {
                setPending(true);
                const result = await exportParfaxUsersAction(exportReason);
                setPending(false);
                if (result.ok) {
                  downloadCsv('parfax-users.csv', result.data.csv);
                  toast.success(`Exported ${result.data.rows} account(s)`);
                  setExportOpen(false);
                  setExportReason('');
                } else toast.error(result.error);
              }}
            >
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(mergeTarget)} onOpenChange={(v) => !v && setMergeTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Resolve duplicate accounts</DialogTitle>
            <DialogDescription>
              Scans, subscriptions, support issues and notes move to the account you keep. The other
              account is marked as merged rather than deleted, so this is reversible and the original
              identifiers are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="merge-keep">Keep this account</Label>
              <NativeSelect id="merge-keep" value={keepId} onChange={(e) => setKeepId(e.target.value)}>
                {mergeTarget?.ids.map((id, i) => (
                  <option key={id} value={id}>{mergeTarget.emails[i]}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="merge-reason" required>
                Reason
              </Label>
              <Input
                id="merge-reason"
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                placeholder="e.g. Same player; confirmed by support ticket #482"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={mergeReason.trim().length < 10 || !mergeTarget || mergeTarget.ids.length < 2}
              onClick={async () => {
                if (!mergeTarget) return;
                const mergeId = mergeTarget.ids.find((id) => id !== keepId);
                if (!mergeId) return;
                setPending(true);
                const result = await mergeParfaxUsersAction({ keepId, mergeId, reason: mergeReason });
                setPending(false);
                if (result.ok) {
                  toast.success(`Merged. ${result.data.moved} related record(s) moved.`);
                  setMergeTarget(null);
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
