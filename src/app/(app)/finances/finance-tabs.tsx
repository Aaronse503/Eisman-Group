'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DataTable } from '@/components/data-table';
import { RevenueChart, type TrendPoint } from '@/components/dashboard/revenue-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger, Progress } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SourceBadge, StatusBadge, healthTone } from '@/components/ui/status';
import { SourceNote } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { formatCurrency, formatPercent, titleCase } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import { setInvoiceStatusAction } from '@/server/actions/finance';
import type {
  ExpenseRow, InvoiceRow, PaymentRow, SubscriptionRow,
} from '@/lib/queries/finance';

const CHART_COLORS = [
  'var(--color-emerald-600)', 'var(--color-gold-600)', 'var(--color-emerald-400)',
  'var(--color-gold-800)', 'var(--color-emerald-800)', 'var(--color-gold-400)',
  'var(--color-emerald-300)', 'var(--color-charcoal-500)',
];

interface Props {
  defaultTab: string;
  trend: TrendPoint[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  subscriptions: SubscriptionRow[];
  profitability: {
    id: string; name: string; company_name: string; currency: string; revenue: number;
    direct_cost: number; margin: number; margin_pct: number | null; health_score: number; status: string;
  }[];
  breakdown: { category: string; total: number }[];
  projection: { week_start: string; inflow: number; outflow: number; net: number }[];
  concentration: { total: number; rows: { name: string; revenue: number; share: number }[] };
  adjustments: {
    id: string; label: string; metric: string; amount: number; currency: string;
    period_start: string; period_end: string; note: string | null; source_label: string;
    created_by: string | null; company_name: string;
  }[];
  contractorPayments: {
    id: string; number: string | null; amount: number; currency: string; status: string;
    due_date: string | null; member_name: string; company_name: string;
  }[];
  canWrite: boolean;
  canAct: boolean;
  showCompany: boolean;
  rangeLabel: string;
}

export function FinanceTabs(props: Props) {
  const router = useRouter();
  const [statusTarget, setStatusTarget] = React.useState<{ invoice: InvoiceRow; status: string } | null>(null);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const invoiceColumns = React.useMemo<ColumnDef<InvoiceRow, unknown>[]>(() => {
    const cols: ColumnDef<InvoiceRow, unknown>[] = [
      { id: 'number', header: 'Invoice', accessorKey: 'number', cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
      {
        id: 'client_name',
        header: 'Client',
        accessorKey: 'client_name',
        cell: ({ row }) =>
          row.original.client_id ? (
            <Link href={`/crm/clients/${row.original.client_id}`} className="text-[var(--accent)] hover:underline">
              {row.original.client_name}
            </Link>
          ) : (
            <span className="text-[var(--fg-subtle)]">Unattributed</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <StatusBadge status={row.original.days_overdue > 0 ? 'past_due' : row.original.status} />
            {row.original.days_overdue > 0 ? (
              <span className="tnum text-xs text-[var(--danger)]">{row.original.days_overdue}d</span>
            ) : null}
          </span>
        ),
      },
      { id: 'issue_date', header: 'Issued', accessorKey: 'issue_date', cell: ({ row }) => fmtDate(row.original.issue_date) },
      { id: 'due_date', header: 'Due', accessorKey: 'due_date', cell: ({ row }) => fmtDate(row.original.due_date) },
      {
        id: 'total',
        header: 'Total',
        accessorKey: 'total',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.total, row.original.currency)}</span>,
      },
      {
        id: 'amount_due',
        header: 'Due',
        accessorKey: 'amount_due',
        cell: ({ row }) => (
          <span className={row.original.amount_due > 0 ? 'tnum font-medium text-[var(--warning)]' : 'tnum text-[var(--fg-subtle)]'}>
            {formatCurrency(row.original.amount_due, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        accessorKey: 'source',
        cell: ({ row }) => <SourceBadge source={row.original.source} isDemo={row.original.is_demo} />,
      },
    ];
    if (props.canAct) {
      cols.push({
        id: '__actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.source === 'stripe' ? (
            <span className="text-xs text-[var(--fg-subtle)]">Managed in Stripe</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusTarget({ invoice: row.original, status: row.original.status === 'paid' ? 'open' : 'paid' });
                setReason('');
              }}
            >
              {row.original.status === 'paid' ? 'Reopen' : 'Mark paid'}
            </Button>
          ),
      });
    }
    if (props.showCompany) {
      cols.splice(2, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    }
    return cols;
  }, [props.canAct, props.showCompany]);

  const paymentColumns = React.useMemo<ColumnDef<PaymentRow, unknown>[]>(
    () => [
      { id: 'occurred_at', header: 'Date', accessorKey: 'occurred_at', cell: ({ row }) => fmtDate(row.original.occurred_at) },
      {
        id: 'client_name',
        header: 'Client',
        accessorKey: 'client_name',
        cell: ({ row }) => row.original.client_name ?? <span className="text-[var(--fg-subtle)]">—</span>,
      },
      { id: 'description', header: 'Description', accessorKey: 'description', cell: ({ row }) => row.original.description ?? '—' },
      {
        id: 'amount',
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span className={row.original.amount < 0 ? 'tnum text-[var(--danger)]' : 'tnum'}>
            {formatCurrency(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <StatusBadge status={row.original.status} />
            {row.original.failure_reason ? (
              <span className="text-xs text-[var(--danger)]">{row.original.failure_reason}</span>
            ) : null}
          </span>
        ),
      },
      { id: 'method', header: 'Method', accessorKey: 'method', cell: ({ row }) => titleCase(row.original.method ?? '—') },
      { id: 'source', header: 'Source', accessorKey: 'source', cell: ({ row }) => <SourceBadge source={row.original.source} isDemo={row.original.is_demo} /> },
    ],
    [],
  );

  const expenseColumns = React.useMemo<ColumnDef<ExpenseRow, unknown>[]>(
    () => [
      { id: 'incurred_on', header: 'Date', accessorKey: 'incurred_on', cell: ({ row }) => fmtDate(row.original.incurred_on) },
      { id: 'description', header: 'Description', accessorKey: 'description' },
      { id: 'category', header: 'Category', accessorKey: 'category', cell: ({ row }) => <Badge tone="outline">{titleCase(row.original.category)}</Badge> },
      {
        id: 'vendor',
        header: 'Vendor / person',
        accessorFn: (row) => row.vendor_name ?? row.member_name ?? '',
        cell: ({ row }) => row.original.vendor_name ?? row.original.member_name ?? '—',
      },
      { id: 'client_name', header: 'Client', accessorKey: 'client_name', cell: ({ row }) => row.original.client_name ?? '—' },
      {
        id: 'amount',
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.amount, row.original.currency)}</span>,
      },
      { id: 'recurring', header: 'Recurring', accessorKey: 'recurring', cell: ({ row }) => (row.original.recurring ? titleCase(row.original.recurring) : '—') },
    ],
    [],
  );

  const subscriptionColumns = React.useMemo<ColumnDef<SubscriptionRow, unknown>[]>(
    () => [
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (row) => row.client_name ?? row.customer_label ?? '',
        cell: ({ row }) =>
          row.original.client_id ? (
            <Link href={`/crm/clients/${row.original.client_id}`} className="text-[var(--accent)] hover:underline">
              {row.original.client_name}
            </Link>
          ) : (
            (row.original.customer_label ?? '—')
          ),
      },
      { id: 'plan', header: 'Plan', accessorKey: 'plan' },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: 'mrr',
        header: 'MRR',
        accessorKey: 'mrr',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.mrr, row.original.currency)}</span>,
      },
      { id: 'interval', header: 'Billed', accessorKey: 'interval', cell: ({ row }) => `Every ${row.original.interval}` },
      {
        id: 'current_period_end',
        header: 'Renews',
        accessorKey: 'current_period_end',
        cell: ({ row }) => fmtDate(row.original.current_period_end),
      },
      { id: 'source', header: 'Source', accessorKey: 'source', cell: ({ row }) => <SourceBadge source={row.original.source} isDemo={row.original.is_demo} /> },
    ],
    [],
  );

  const confirmStatus = async () => {
    if (!statusTarget) return;
    setPending(true);
    const result = await setInvoiceStatusAction({
      id: statusTarget.invoice.id,
      status: statusTarget.status,
      reason,
    });
    setPending(false);
    if (result.ok) {
      toast.success('Invoice updated and recorded in the audit log');
      setStatusTarget(null);
      router.refresh();
    } else toast.error(result.error);
  };

  return (
    <>
      <Tabs defaultValue={props.defaultTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({props.invoices.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="cash">Cash flow</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue and expenses</CardTitle>
                <SourceNote source="Recorded payments and expenses, last 12 months" />
              </CardHeader>
              <CardContent>
                {props.trend.length ? <RevenueChart data={props.trend} /> : <EmptyState title="No data yet" className="border-0" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where the money goes</CardTitle>
                <SourceNote source={`Expenses, ${props.rangeLabel.toLowerCase()}`} />
              </CardHeader>
              <CardContent>
                {props.breakdown.length === 0 ? (
                  <EmptyState title="No expenses recorded" className="border-0 py-8" />
                ) : (
                  <>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={props.breakdown}
                            dataKey="total"
                            nameKey="category"
                            innerRadius={44}
                            outerRadius={70}
                            paddingAngle={2}
                          >
                            {props.breakdown.map((entry, i) => (
                              <Cell key={entry.category} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: 'var(--surface-raised)',
                              border: '1px solid var(--border)',
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                            formatter={(v: number, n: string) => [formatCurrency(v), titleCase(n)]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {props.breakdown.slice(0, 6).map((entry, i) => (
                        <li key={entry.category} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                              aria-hidden
                            />
                            {titleCase(entry.category)}
                          </span>
                          <span className="tnum text-[var(--fg-muted)]">{formatCurrency(entry.total)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue concentration</CardTitle>
                <SourceNote source={`Collected revenue by client, ${props.rangeLabel.toLowerCase()}`} />
              </CardHeader>
              <CardContent className="space-y-2">
                {props.concentration.rows.length === 0 ? (
                  <EmptyState title="No revenue in this period" className="border-0 py-8" />
                ) : (
                  props.concentration.rows.slice(0, 8).map((row) => (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{row.name}</span>
                        <span className="tnum shrink-0 text-[var(--fg-muted)]">
                          {formatCurrency(row.revenue)} · {formatPercent(row.share)}
                        </span>
                      </div>
                      <Progress value={row.share} tone={row.share >= 25 ? 'warning' : 'accent'} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upcoming contractor payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {props.contractorPayments.length === 0 ? (
                  <p className="text-sm text-[var(--fg-muted)]">Nothing outstanding.</p>
                ) : (
                  props.contractorPayments.slice(0, 8).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{p.member_name}</span>
                        <span className="block text-xs text-[var(--fg-subtle)]">
                          {p.due_date ? `Due ${fmtDate(p.due_date)}` : 'No due date'}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tnum font-medium">{formatCurrency(p.amount, p.currency)}</span>
                        <StatusBadge status={p.status} />
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <DataTable
            data={props.invoices}
            columns={invoiceColumns}
            searchPlaceholder="Search invoices…"
            exportFilename="invoices"
            initialSorting={[{ id: 'issue_date', desc: true }]}
            emptyTitle="No invoices"
            emptyDescription="Create one, import a CSV, or connect Stripe."
          />
        </TabsContent>

        <TabsContent value="payments">
          <DataTable
            data={props.payments}
            columns={paymentColumns}
            searchPlaceholder="Search payments…"
            exportFilename="payments"
            initialSorting={[{ id: 'occurred_at', desc: true }]}
            emptyTitle="No payments in this period"
          />
        </TabsContent>

        <TabsContent value="expenses">
          <DataTable
            data={props.expenses}
            columns={expenseColumns}
            searchPlaceholder="Search expenses…"
            exportFilename="expenses"
            initialSorting={[{ id: 'incurred_on', desc: true }]}
            emptyTitle="No expenses in this period"
          />
        </TabsContent>

        <TabsContent value="subscriptions">
          <DataTable
            data={props.subscriptions}
            columns={subscriptionColumns}
            searchPlaceholder="Search subscriptions…"
            exportFilename="subscriptions"
            initialSorting={[{ id: 'mrr', desc: true }]}
            emptyTitle="No subscriptions"
          />
        </TabsContent>

        <TabsContent value="profitability">
          <Card>
            <CardHeader>
              <CardTitle>Client profitability</CardTitle>
              <SourceNote source={`Collected revenue minus expenses attributed to each client, ${props.rangeLabel.toLowerCase()}. Unattributed overhead is excluded.`} />
            </CardHeader>
            <CardContent className="space-y-2">
              {props.profitability.filter((p) => p.revenue > 0 || p.direct_cost > 0).length === 0 ? (
                <EmptyState title="No attributed revenue or cost yet" className="border-0" />
              ) : (
                props.profitability
                  .filter((p) => p.revenue > 0 || p.direct_cost > 0)
                  .map((p) => (
                    <div key={p.id} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/crm/clients/${p.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
                          {p.name}
                        </Link>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="tnum">Revenue {formatCurrency(p.revenue, p.currency)}</span>
                          <span className="tnum text-[var(--fg-muted)]">Cost {formatCurrency(p.direct_cost, p.currency)}</span>
                          <Badge tone={p.margin >= 0 ? 'success' : 'danger'}>
                            {formatCurrency(p.margin, p.currency)}
                            {p.margin_pct !== null ? ` · ${formatPercent(p.margin_pct)}` : ''}
                          </Badge>
                          <Badge tone={healthTone(p.health_score)}>Health {p.health_score}</Badge>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash">
          <Card>
            <CardHeader>
              <CardTitle>Twelve-week cash projection</CardTitle>
              <SourceNote source="Open invoice due dates in, approved contractor invoices out. A projection from scheduled items, not a bank balance." />
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={props.projection} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="week_start"
                      tickFormatter={(v: string) => fmtDate(v, 'MMM d')}
                      tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCurrency(v, 'USD', { compact: true })}
                      tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }}
                      axisLine={false}
                      tickLine={false}
                      width={62}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      labelFormatter={(v: string) => `Week of ${fmtDate(v)}`}
                      formatter={(v: number, n: string) => [formatCurrency(v), titleCase(n)]}
                    />
                    <Bar dataKey="inflow" name="In" fill="var(--color-emerald-600)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="outflow" name="Out" fill="var(--color-gold-700)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card>
            <CardHeader>
              <CardTitle>Manual adjustments</CardTitle>
              <SourceNote source="Figures entered by hand. These are listed separately and are never blended into the connected totals above without saying so." />
            </CardHeader>
            <CardContent className="space-y-2">
              {props.adjustments.length === 0 ? (
                <EmptyState
                  title="No manual adjustments"
                  description="Use these for figures that pre-date this system, such as an accountant's export."
                  className="border-0"
                />
              ) : (
                props.adjustments.map((a) => (
                  <div key={a.id} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{a.label}</p>
                        <p className="text-xs text-[var(--fg-subtle)]">
                          {fmtDate(a.period_start)} – {fmtDate(a.period_end)} · {a.company_name}
                          {a.created_by ? ` · entered by ${a.created_by}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="outline">{titleCase(a.metric)}</Badge>
                        <span className="tnum font-medium">{formatCurrency(a.amount, a.currency)}</span>
                        <Badge tone="gold">{a.source_label}</Badge>
                      </div>
                    </div>
                    {a.note ? <p className="mt-1.5 text-sm text-[var(--fg-muted)]">{a.note}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(statusTarget)} onOpenChange={(v) => !v && setStatusTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.status === 'paid' ? 'Mark invoice as paid' : 'Reopen invoice'}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.invoice.number} ·{' '}
              {statusTarget ? formatCurrency(statusTarget.invoice.total, statusTarget.invoice.currency) : ''}
              . This is a financial change and is recorded in the audit log with the original and new
              values.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="text-sm font-medium" htmlFor="invoice-reason">
              Reason
            </label>
            <Input
              id="invoice-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wire received, confirmed against the bank statement"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} disabled={reason.trim().length < 4} onClick={confirmStatus}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
