'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger, Progress } from '@/components/ui/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SourceBadge, StatusBadge } from '@/components/ui/status';
import { SourceNote } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { formatCurrency, titleCase } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import { setContractorInvoiceStatusAction } from '@/server/actions/finance';
import { OrgChart, type OrgNodeView } from './org-chart';
import type { MemberRow } from '@/lib/queries/team';

interface ContractorInvoice {
  id: string; company_name: string; member_id: string; member_name: string;
  number: string | null; period_start: string | null; period_end: string | null;
  amount: number; currency: string; status: string; due_date: string | null;
  paid_at: Date | null; source: string; is_demo: boolean;
}

export function TeamTabs({
  defaultTab,
  members,
  invoices,
  orgRoots,
  orgChanges,
  capacity,
  canWrite,
  canSeePay,
  canApprove,
  showCompany,
}: {
  defaultTab: string;
  members: MemberRow[];
  invoices: ContractorInvoice[];
  orgRoots: OrgNodeView[];
  orgChanges: {
    id: string; member_name: string; from_manager: string | null; to_manager: string | null;
    reason: string; actor_name: string | null; created_at: Date;
  }[];
  capacity: { id: string; full_name: string; kind: string; capacity_hours: number; allocated_pct: number; company_name: string }[];
  canWrite: boolean;
  canSeePay: boolean;
  canApprove: boolean;
  showCompany: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = React.useState<{ invoice: ContractorInvoice; status: 'approved' | 'paid' } | null>(null);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const memberColumns = React.useMemo<ColumnDef<MemberRow, unknown>[]>(() => {
    const cols: ColumnDef<MemberRow, unknown>[] = [
      {
        id: 'full_name',
        header: 'Name',
        accessorKey: 'full_name',
        cell: ({ row }) =>
          row.original.is_vacant ? (
            <span className="text-[var(--fg-muted)] italic">{row.original.full_name}</span>
          ) : (
            <Link href={`/team/${row.original.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
              {row.original.full_name}
            </Link>
          ),
      },
      { id: 'title', header: 'Title', accessorKey: 'title' },
      { id: 'kind', header: 'Type', accessorKey: 'kind', cell: ({ row }) => <Badge tone="outline">{titleCase(row.original.kind)}</Badge> },
      { id: 'department_name', header: 'Department', accessorKey: 'department_name', cell: ({ row }) => row.original.department_name ?? '—' },
      { id: 'manager_name', header: 'Reports to', accessorKey: 'manager_name', cell: ({ row }) => row.original.manager_name ?? '—' },
      {
        id: 'allocated_pct',
        header: 'Allocated',
        accessorKey: 'allocated_pct',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Progress
              value={Math.min(row.original.allocated_pct, 100)}
              className="w-14"
              tone={row.original.allocated_pct > 100 ? 'danger' : row.original.allocated_pct > 85 ? 'warning' : 'accent'}
            />
            <span className="tnum text-xs">{row.original.allocated_pct}%</span>
          </span>
        ),
      },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: 'skills',
        header: 'Skills',
        accessorFn: (row) => row.skills.join(', '),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.skills.slice(0, 3).map((s) => (
              <Badge key={s} tone="neutral">{s}</Badge>
            ))}
            {row.original.skills.length > 3 ? (
              <span className="text-xs text-[var(--fg-subtle)]">+{row.original.skills.length - 3}</span>
            ) : null}
          </span>
        ),
      },
    ];
    if (canSeePay) {
      cols.splice(6, 0, {
        id: 'pay_rate',
        header: 'Pay rate',
        accessorKey: 'pay_rate',
        cell: ({ row }) =>
          row.original.pay_rate ? (
            <span className="tnum">
              {formatCurrency(row.original.pay_rate, row.original.currency)}
              <span className="text-xs text-[var(--fg-subtle)]">/{row.original.pay_rate_unit}</span>
            </span>
          ) : (
            '—'
          ),
      });
    }
    if (showCompany) cols.splice(1, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    return cols;
  }, [canSeePay, showCompany]);

  const invoiceColumns = React.useMemo<ColumnDef<ContractorInvoice, unknown>[]>(() => {
    const cols: ColumnDef<ContractorInvoice, unknown>[] = [
      {
        id: 'member_name',
        header: 'Contractor',
        accessorKey: 'member_name',
        cell: ({ row }) => (
          <Link href={`/team/${row.original.member_id}`} className="font-medium hover:underline">
            {row.original.member_name}
          </Link>
        ),
      },
      { id: 'number', header: 'Invoice', accessorKey: 'number', cell: ({ row }) => row.original.number ?? '—' },
      {
        id: 'period',
        header: 'Period',
        accessorFn: (row) => row.period_end ?? '',
        cell: ({ row }) =>
          row.original.period_start && row.original.period_end
            ? `${fmtDate(row.original.period_start, 'MMM d')} – ${fmtDate(row.original.period_end, 'MMM d')}`
            : '—',
      },
      {
        id: 'amount',
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.amount, row.original.currency)}</span>,
      },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: 'due_date', header: 'Due', accessorKey: 'due_date', cell: ({ row }) => fmtDate(row.original.due_date) },
      { id: 'source', header: 'Source', accessorKey: 'source', cell: ({ row }) => <SourceBadge source={row.original.source} isDemo={row.original.is_demo} /> },
    ];
    if (canApprove) {
      cols.push({
        id: '__actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'paid' ? (
            <span className="text-xs text-[var(--fg-subtle)]">Paid {fmtDate(row.original.paid_at)}</span>
          ) : (
            <div className="flex gap-1">
              {row.original.status === 'submitted' ? (
                <Button variant="ghost" size="sm" onClick={() => { setTarget({ invoice: row.original, status: 'approved' }); setReason(''); }}>
                  Approve
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => { setTarget({ invoice: row.original, status: 'paid' }); setReason(''); }}>
                Mark paid
              </Button>
            </div>
          ),
      });
    }
    return cols;
  }, [canApprove]);

  const everyone = React.useMemo(
    () => members.filter((m) => !m.is_vacant).map((m) => ({ id: m.id, full_name: m.full_name, title: m.title })),
    [members],
  );

  const confirm = async () => {
    if (!target) return;
    setPending(true);
    const result = await setContractorInvoiceStatusAction(target.invoice.id, target.status, reason);
    setPending(false);
    if (result.ok) {
      toast.success(`Invoice ${target.status}`);
      setTarget(null);
      router.refresh();
    } else toast.error(result.error);
  };

  const overallocated = capacity.filter((c) => c.allocated_pct > 100);

  return (
    <>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="people">People ({members.length})</TabsTrigger>
          <TabsTrigger value="chart">Org chart</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="invoices">Contractor invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="changes">Change log</TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <DataTable
            data={members}
            columns={memberColumns}
            searchPlaceholder="Search people…"
            exportFilename="team"
            initialSorting={[{ id: 'full_name', desc: false }]}
            emptyTitle="Nobody here yet"
            emptyDescription="Add employees and contractors, or import them from Gusto or a CSV."
            emptyAction={
              canWrite ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/team/new">Add someone</Link>
                </Button>
              ) : null
            }
          />
          {!canSeePay ? (
            <SourceNote
              className="mt-2"
              source="Pay rates are hidden. They are visible only to Finance, Company Admins and the Holdings Owner."
            />
          ) : null}
        </TabsContent>

        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Reporting structure</CardTitle>
              <SourceNote source="Maintained here. Every reporting change is recorded with a reason in the change log." />
            </CardHeader>
            <CardContent>
              <OrgChart roots={orgRoots} everyone={everyone} canEdit={canWrite} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity">
          <Card>
            <CardHeader>
              <CardTitle>Capacity and allocation</CardTitle>
              <SourceNote source="Allocation is the sum of client assignment percentages. It is a planning figure, not tracked time." />
            </CardHeader>
            <CardContent className="space-y-3">
              {overallocated.length ? (
                <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                  {overallocated.length} {overallocated.length === 1 ? 'person is' : 'people are'} allocated
                  above 100%.
                </div>
              ) : null}
              {capacity.length === 0 ? (
                <EmptyState title="No active people" className="border-0" />
              ) : (
                capacity.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/team/${c.id}`} className="truncate hover:underline">
                        {c.full_name}
                        <span className="ml-1.5 text-xs text-[var(--fg-subtle)]">{titleCase(c.kind)}</span>
                      </Link>
                      <span className="tnum shrink-0 text-[var(--fg-muted)]">
                        {c.allocated_pct}% of {c.capacity_hours}h
                      </span>
                    </div>
                    <Progress
                      value={Math.min(c.allocated_pct, 100)}
                      tone={c.allocated_pct > 100 ? 'danger' : c.allocated_pct > 85 ? 'warning' : 'accent'}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <DataTable
            data={invoices}
            columns={invoiceColumns}
            searchPlaceholder="Search contractor invoices…"
            exportFilename="contractor-invoices"
            initialSorting={[{ id: 'period', desc: true }]}
            emptyTitle="No contractor invoices"
            emptyDescription="Import them from Gusto or a CSV, or record them manually."
          />
        </TabsContent>

        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <CardTitle>Org change log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {orgChanges.length === 0 ? (
                <EmptyState title="No reporting changes recorded" className="border-0" />
              ) : (
                orgChanges.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                    <p>
                      <strong>{c.member_name}</strong> moved from{' '}
                      <span className="text-[var(--fg-muted)]">{c.from_manager ?? 'nobody'}</span> to{' '}
                      <span className="text-[var(--fg-muted)]">{c.to_manager ?? 'nobody'}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                      {c.actor_name ?? 'System'} · {fmtDate(c.created_at)} · {c.reason}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {target?.status === 'paid' ? 'Mark as paid' : 'Approve'} — {target?.invoice.member_name}
            </DialogTitle>
            <DialogDescription>
              {target ? formatCurrency(target.invoice.amount, target.invoice.currency) : ''}. This is a
              financial action and is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label htmlFor="ci-reason" className="text-sm font-medium">
              Reason
            </label>
            <Input
              id="ci-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Hours verified against the timesheet"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={reason.trim().length < 4} onClick={confirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
