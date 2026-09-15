'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, LayoutGrid, Table2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { KanbanBoard } from '@/components/kanban';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HealthBadge, StatusBadge } from '@/components/ui/status';
import { NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { formatCurrency, titleCase } from '@/lib/utils';
import { fmtDate, isOverdue } from '@/lib/dates';
import { moveClientStageAction } from '@/server/actions/crm';
import { CLIENT_STAGES } from '@/lib/domain/crm';
import type { ClientRow } from '@/lib/domain/crm';

const STAGE_COLUMNS = CLIENT_STAGES.map((stage) => ({
  id: stage,
  title: titleCase(stage),
}));

export function ClientsView({
  clients,
  canWrite,
  showCompany,
}: {
  clients: ClientRow[];
  canWrite: boolean;
  showCompany: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string>('all');
  const [health, setHealth] = React.useState<string>('all');

  const filtered = React.useMemo(
    () =>
      clients.filter((c) => {
        if (status !== 'all' && c.status !== status) return false;
        if (health === 'at_risk' && c.health_score >= 60) return false;
        if (health === 'healthy' && c.health_score < 80) return false;
        return true;
      }),
    [clients, status, health],
  );

  const columns = React.useMemo<ColumnDef<ClientRow, unknown>[]>(() => {
    const cols: ColumnDef<ClientRow, unknown>[] = [
      {
        id: 'name',
        header: 'Client',
        accessorKey: 'name',
        cell: ({ row }) => (
          <Link
            href={`/crm/clients/${row.original.id}`}
            className="font-medium text-[var(--fg)] hover:text-[var(--accent)] hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'stage',
        header: 'Stage',
        accessorKey: 'stage',
        cell: ({ row }) => <span className="text-sm">{titleCase(row.original.stage)}</span>,
      },
      {
        id: 'health_score',
        header: 'Health',
        accessorKey: 'health_score',
        cell: ({ row }) => <HealthBadge score={row.original.health_score} />,
      },
      {
        id: 'monthly_retainer',
        header: 'Retainer',
        accessorKey: 'monthly_retainer',
        cell: ({ row }) => (
          <span className="tnum">
            {row.original.monthly_retainer
              ? `${formatCurrency(row.original.monthly_retainer, row.original.currency)}/mo`
              : '—'}
          </span>
        ),
      },
      {
        id: 'outstanding',
        header: 'Outstanding',
        accessorKey: 'outstanding',
        cell: ({ row }) =>
          row.original.outstanding > 0 ? (
            <span className="tnum font-medium text-[var(--warning)]">
              {formatCurrency(row.original.outstanding, row.original.currency)}
            </span>
          ) : (
            <span className="text-[var(--fg-subtle)]">—</span>
          ),
      },
      {
        id: 'open_tasks',
        header: 'Tasks',
        accessorKey: 'open_tasks',
        cell: ({ row }) => (
          <span className="tnum flex items-center gap-1.5 text-sm">
            {row.original.open_tasks}
            {row.original.overdue_tasks > 0 ? (
              <Badge tone="danger" className="px-1.5 py-0">
                {row.original.overdue_tasks} late
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: 'renewal_date',
        header: 'Renewal',
        accessorKey: 'renewal_date',
        cell: ({ row }) => (
          <span className={row.original.renewal_date && isOverdue(row.original.renewal_date) ? 'text-[var(--warning)]' : ''}>
            {fmtDate(row.original.renewal_date)}
          </span>
        ),
      },
      { id: 'owner_name', header: 'Owner', accessorKey: 'owner_name', cell: ({ row }) => row.original.owner_name ?? '—' },
    ];
    if (showCompany) {
      cols.splice(1, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    }
    return cols;
  }, [showCompany]);

  const onMove = canWrite
    ? async (id: string, stage: string) => {
        const result = await moveClientStageAction(id, stage);
        if (result.ok) {
          toast.success(`Moved to ${titleCase(stage)}`);
          router.refresh();
        } else {
          toast.error(result.error);
        }
      }
    : undefined;

  const toolbar = (
    <>
      <NativeSelect
        aria-label="Filter by status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 w-[9.5rem]"
      >
        <option value="all">All statuses</option>
        {['prospect', 'active', 'paused', 'former', 'referral_partner'].map((s) => (
          <option key={s} value={s}>{titleCase(s)}</option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by health"
        value={health}
        onChange={(e) => setHealth(e.target.value)}
        className="h-9 w-[9rem]"
      >
        <option value="all">All health</option>
        <option value="at_risk">At risk (&lt;60)</option>
        <option value="healthy">Healthy (80+)</option>
      </NativeSelect>
    </>
  );

  return (
    <Tabs defaultValue="table">
      <div className="mb-4 flex items-center justify-between gap-2">
        <TabsList className="w-auto">
          <TabsTrigger value="table">
            <Table2 className="size-3.5" /> Table
          </TabsTrigger>
          <TabsTrigger value="board">
            <LayoutGrid className="size-3.5" /> Board
          </TabsTrigger>
        </TabsList>
        <p className="text-sm text-[var(--fg-muted)]">
          {filtered.length} of {clients.length}
        </p>
      </div>

      <TabsContent value="table">
        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="Search clients…"
          toolbar={toolbar}
          exportFilename="clients"
          initialSorting={[{ id: 'name', desc: false }]}
          emptyTitle="No clients yet"
          emptyDescription="Add your first client to start tracking retainers, health and delivery."
          emptyAction={
            canWrite ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/crm/clients/new">Add a client</Link>
              </Button>
            ) : null
          }
        />
      </TabsContent>

      <TabsContent value="board">
        <div className="mb-3 flex flex-wrap items-center gap-2">{toolbar}</div>
        <KanbanBoard
          columns={STAGE_COLUMNS}
          items={filtered.map((c) => ({ ...c, columnId: c.stage }))}
          onMove={onMove}
          readOnly={!canWrite}
          columnSummary={(_, items) =>
            items.length
              ? `${formatCurrency(items.reduce((a, b) => a + Number(b.monthly_retainer), 0), 'USD', { compact: true })}/mo`
              : null
          }
          renderCard={(client) => (
            <Link
              href={`/crm/clients/${client.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition-colors hover:border-[var(--accent)]/50"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</p>
                <HealthBadge score={client.health_score} />
              </div>
              <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                {client.monthly_retainer
                  ? `${formatCurrency(client.monthly_retainer, client.currency)}/mo`
                  : 'No retainer'}
                {showCompany ? ` · ${client.company_name}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={client.status} />
                {client.overdue_tasks > 0 ? (
                  <Badge tone="danger">
                    <AlertTriangle className="size-3" /> {client.overdue_tasks}
                  </Badge>
                ) : null}
                {client.outstanding > 0 ? (
                  <Badge tone="warning">{formatCurrency(client.outstanding, client.currency, { compact: true })} due</Badge>
                ) : null}
              </div>
            </Link>
          )}
        />
      </TabsContent>
    </Tabs>
  );
}
