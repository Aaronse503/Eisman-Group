'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { LayoutGrid, Table2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { KanbanBoard } from '@/components/kanban';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { Tabs, TabsContent, TabsList, TabsTrigger, Progress } from '@/components/ui/misc';
import { formatCurrency, titleCase } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import { moveDealStageAction } from '@/server/actions/crm';
import { DEAL_STAGES, type DealRow } from '@/lib/domain/crm';

export function DealsView({
  deals,
  canWrite,
  showCompany,
}: {
  deals: DealRow[];
  canWrite: boolean;
  showCompany: boolean;
}) {
  const router = useRouter();

  const columns = React.useMemo<ColumnDef<DealRow, unknown>[]>(() => {
    const cols: ColumnDef<DealRow, unknown>[] = [
      { id: 'name', header: 'Deal', accessorKey: 'name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: 'stage', header: 'Stage', accessorKey: 'stage', cell: ({ row }) => <StatusBadge status={row.original.stage} /> },
      {
        id: 'value',
        header: 'Value',
        accessorKey: 'value',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.value, row.original.currency)}</span>,
      },
      {
        id: 'probability',
        header: 'Probability',
        accessorKey: 'probability',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Progress value={row.original.probability} className="w-16" />
            <span className="tnum text-xs">{row.original.probability}%</span>
          </span>
        ),
      },
      {
        id: 'weighted',
        header: 'Weighted',
        accessorFn: (row) => (Number(row.value) * row.probability) / 100,
        cell: ({ row }) => (
          <span className="tnum">
            {formatCurrency((Number(row.original.value) * row.original.probability) / 100, row.original.currency)}
          </span>
        ),
      },
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
            (row.original.organization_name ?? '—')
          ),
      },
      {
        id: 'expected_close',
        header: 'Expected close',
        accessorKey: 'expected_close',
        cell: ({ row }) => fmtDate(row.original.expected_close),
      },
      { id: 'owner_name', header: 'Owner', accessorKey: 'owner_name', cell: ({ row }) => row.original.owner_name ?? '—' },
    ];
    if (showCompany) cols.splice(1, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    return cols;
  }, [showCompany]);

  const onMove = canWrite
    ? async (id: string, stage: string) => {
        const result = await moveDealStageAction(id, stage);
        if (result.ok) {
          toast.success(`Moved to ${titleCase(stage)}`);
          router.refresh();
        } else toast.error(result.error);
      }
    : undefined;

  return (
    <Tabs defaultValue="board">
      <TabsList className="mb-4 w-auto">
        <TabsTrigger value="board">
          <LayoutGrid className="size-3.5" /> Board
        </TabsTrigger>
        <TabsTrigger value="table">
          <Table2 className="size-3.5" /> Table
        </TabsTrigger>
      </TabsList>

      <TabsContent value="board">
        <KanbanBoard
          columns={DEAL_STAGES.map((s) => ({ id: s, title: titleCase(s) }))}
          items={deals.map((d) => ({ ...d, columnId: d.stage }))}
          onMove={onMove}
          readOnly={!canWrite}
          emptyMessage="No deals yet. Create one to start tracking new business."
          columnSummary={(_, items) =>
            items.length ? formatCurrency(items.reduce((a, b) => a + Number(b.value), 0), 'USD', { compact: true }) : null
          }
          renderCard={(deal) => (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
              <p className="truncate text-sm font-medium">{deal.name}</p>
              <p className="tnum mt-0.5 text-xs text-[var(--fg-muted)]">
                {formatCurrency(deal.value, deal.currency)} · {deal.probability}%
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {deal.client_name ? <Badge tone="outline">{deal.client_name}</Badge> : null}
                {deal.expected_close ? <Badge tone="neutral">{fmtDate(deal.expected_close, 'MMM d')}</Badge> : null}
              </div>
            </div>
          )}
        />
      </TabsContent>

      <TabsContent value="table">
        <DataTable
          data={deals}
          columns={columns}
          searchPlaceholder="Search deals…"
          exportFilename="deals"
          initialSorting={[{ id: 'value', desc: true }]}
          emptyTitle="No deals yet"
          emptyDescription="Deals track new business through discovery, proposal and close."
        />
      </TabsContent>
    </Tabs>
  );
}
