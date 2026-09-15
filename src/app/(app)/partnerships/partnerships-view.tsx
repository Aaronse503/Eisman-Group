'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { LayoutGrid, MapPin, Table2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { KanbanBoard } from '@/components/kanban';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger, Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status';
import { formatCurrency, titleCase } from '@/lib/utils';
import { fmtDate, fmtRelative } from '@/lib/dates';
import { movePartnershipStageAction } from '@/server/actions/growth';
import { PARTNERSHIP_CATEGORIES, PARTNERSHIP_STAGES, type PartnershipRow } from '@/lib/domain/growth';

export function PartnershipsView({
  partnerships,
  canWrite,
  showCompany,
}: {
  partnerships: PartnershipRow[];
  canWrite: boolean;
  showCompany: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = React.useState('all');

  const filtered = React.useMemo(
    () => (category === 'all' ? partnerships : partnerships.filter((p) => p.category === category)),
    [partnerships, category],
  );

  const columns = React.useMemo<ColumnDef<PartnershipRow, unknown>[]>(() => {
    const cols: ColumnDef<PartnershipRow, unknown>[] = [
      {
        id: 'name',
        header: 'Partner',
        accessorKey: 'name',
        cell: ({ row }) => (
          <Link href={`/partnerships/${row.original.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        accessorKey: 'category',
        cell: ({ row }) => <Badge tone="outline">{titleCase(row.original.category)}</Badge>,
      },
      { id: 'stage', header: 'Stage', accessorKey: 'stage', cell: ({ row }) => <StatusBadge status={row.original.stage} /> },
      {
        id: 'estimated_value',
        header: 'Estimated value',
        accessorKey: 'estimated_value',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.estimated_value, row.original.currency)}</span>,
      },
      {
        id: 'probability',
        header: 'Probability',
        accessorKey: 'probability',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Progress value={row.original.probability} className="w-14" />
            <span className="tnum text-xs">{row.original.probability}%</span>
          </span>
        ),
      },
      {
        id: 'contract_status',
        header: 'Contract',
        accessorKey: 'contract_status',
        cell: ({ row }) => <StatusBadge status={row.original.contract_status} />,
      },
      {
        id: 'next_action',
        header: 'Next action',
        accessorKey: 'next_action',
        cell: ({ row }) =>
          row.original.next_action ? (
            <span className="text-sm">
              {row.original.next_action}
              {row.original.next_action_date ? (
                <span className="block text-xs text-[var(--fg-subtle)]">
                  {fmtDate(row.original.next_action_date)}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[var(--fg-subtle)]">—</span>
          ),
      },
      {
        id: 'last_interaction_at',
        header: 'Last touch',
        accessorKey: 'last_interaction_at',
        cell: ({ row }) => fmtRelative(row.original.last_interaction_at),
      },
      { id: 'owner_name', header: 'Owner', accessorKey: 'owner_name', cell: ({ row }) => row.original.owner_name ?? '—' },
    ];
    if (showCompany) cols.splice(1, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    return cols;
  }, [showCompany]);

  const filterBar = (
    <NativeSelect
      aria-label="Filter by category"
      value={category}
      onChange={(e) => setCategory(e.target.value)}
      className="h-9 w-[11rem]"
    >
      <option value="all">All categories</option>
      {PARTNERSHIP_CATEGORIES.map((c) => (
        <option key={c} value={c}>{titleCase(c)}</option>
      ))}
    </NativeSelect>
  );

  return (
    <Tabs defaultValue="board">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TabsList className="w-auto">
          <TabsTrigger value="board">
            <LayoutGrid className="size-3.5" /> Board
          </TabsTrigger>
          <TabsTrigger value="table">
            <Table2 className="size-3.5" /> Table
          </TabsTrigger>
        </TabsList>
        <p className="text-sm text-[var(--fg-muted)]">
          {filtered.length} of {partnerships.length}
        </p>
      </div>

      <TabsContent value="board">
        <div className="mb-3">{filterBar}</div>
        <KanbanBoard
          columns={PARTNERSHIP_STAGES.map((s) => ({ id: s, title: titleCase(s) }))}
          items={filtered.map((p) => ({ ...p, columnId: p.stage }))}
          readOnly={!canWrite}
          emptyMessage="No partnerships yet."
          columnSummary={(_, items) =>
            items.length
              ? formatCurrency(items.reduce((a, b) => a + Number(b.estimated_value), 0), 'USD', { compact: true })
              : null
          }
          onMove={
            canWrite
              ? async (id, stage) => {
                  const result = await movePartnershipStageAction(id, stage);
                  if (result.ok) {
                    toast.success(`Moved to ${titleCase(stage)}`);
                    router.refresh();
                  } else toast.error(result.error);
                }
              : undefined
          }
          renderCard={(p) => (
            <Link
              href={`/partnerships/${p.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition-colors hover:border-[var(--accent)]/50"
            >
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="tnum mt-0.5 text-xs text-[var(--fg-muted)]">
                {formatCurrency(p.estimated_value, p.currency, { compact: true })} · {p.probability}%
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="outline">{titleCase(p.category)}</Badge>
                {p.contract_status !== 'none' ? <StatusBadge status={p.contract_status} /> : null}
              </div>
              {p.pilot_location ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--fg-subtle)]">
                  <MapPin className="size-3" /> {p.pilot_location}
                </p>
              ) : null}
            </Link>
          )}
        />
      </TabsContent>

      <TabsContent value="table">
        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="Search partnerships…"
          toolbar={filterBar}
          exportFilename="partnerships"
          initialSorting={[{ id: 'estimated_value', desc: true }]}
          emptyTitle="No partnerships yet"
          emptyDescription="Track courses, retailers, OEMs, media and technology partners through to launch."
          emptyAction={
            canWrite ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/partnerships/new">Add a partnership</Link>
              </Button>
            ) : null
          }
        />
      </TabsContent>
    </Tabs>
  );
}
