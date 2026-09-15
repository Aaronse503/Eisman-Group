'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, LayoutGrid, Table2, Tag } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { KanbanBoard } from '@/components/kanban';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger, Progress } from '@/components/ui/misc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status';
import { formatCurrency, titleCase } from '@/lib/utils';
import { fmtDate, fmtRelative, isOverdue } from '@/lib/dates';
import { bulkTagInvestorsAction, moveInvestorStageAction } from '@/server/actions/growth';
import {
  INVESTOR_STAGES, INVESTOR_TYPES, INVESTOR_TYPE_LABELS, type InvestorRow,
} from '@/lib/domain/growth';

export function InvestorsView({
  investors,
  canWrite,
  duplicates,
  defaultView,
}: {
  investors: InvestorRow[];
  canWrite: boolean;
  duplicates: { normalized: string; ids: string[]; names: string[] }[];
  defaultView?: string;
}) {
  const router = useRouter();
  const [type, setType] = React.useState('all');
  const [stage, setStage] = React.useState('all');
  const [view, setView] = React.useState(defaultView ?? 'all');
  const [tagName, setTagName] = React.useState('');

  const filtered = React.useMemo(
    () =>
      investors.filter((i) => {
        if (type !== 'all' && i.investor_type !== type) return false;
        if (stage !== 'all' && i.pipeline_stage !== stage) return false;
        if (view === 'follow_up') {
          if (!i.next_follow_up_at) return false;
          const due = new Date(i.next_follow_up_at);
          if (due > new Date(Date.now() + 7 * 86_400_000)) return false;
        }
        if (view === 'active' && ['passed', 'not_a_fit'].includes(i.pipeline_stage)) return false;
        if (view === 'data_room' && !i.data_room_access) return false;
        return true;
      }),
    [investors, type, stage, view],
  );

  const columns = React.useMemo<ColumnDef<InvestorRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Investor',
        accessorKey: 'name',
        cell: ({ row }) => (
          <Link href={`/investors/${row.original.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'investor_type',
        header: 'Type',
        accessorKey: 'investor_type',
        cell: ({ row }) => <Badge tone="outline">{INVESTOR_TYPE_LABELS[row.original.investor_type] ?? row.original.investor_type}</Badge>,
      },
      {
        id: 'pipeline_stage',
        header: 'Stage',
        accessorKey: 'pipeline_stage',
        cell: ({ row }) => <StatusBadge status={row.original.pipeline_stage} />,
      },
      {
        id: 'primary_contact',
        header: 'Contact',
        accessorKey: 'primary_contact',
        cell: ({ row }) => row.original.primary_contact ?? <span className="text-[var(--fg-subtle)]">—</span>,
      },
      {
        id: 'check_size',
        header: 'Check size',
        accessorFn: (row) => row.check_size_max ?? 0,
        cell: ({ row }) =>
          row.original.check_size_min || row.original.check_size_max ? (
            <span className="tnum text-sm">
              {formatCurrency(row.original.check_size_min ?? 0, row.original.currency, { compact: true })}
              –{formatCurrency(row.original.check_size_max ?? 0, row.original.currency, { compact: true })}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'potential_amount',
        header: 'Potential',
        accessorKey: 'potential_amount',
        cell: ({ row }) => <span className="tnum">{formatCurrency(row.original.potential_amount, row.original.currency, { compact: true })}</span>,
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
        id: 'weighted',
        header: 'Weighted',
        accessorFn: (row) => (Number(row.potential_amount) * row.probability) / 100,
        cell: ({ row }) => (
          <span className="tnum">
            {formatCurrency((Number(row.original.potential_amount) * row.original.probability) / 100, row.original.currency, { compact: true })}
          </span>
        ),
      },
      {
        id: 'last_contact_at',
        header: 'Last contact',
        accessorKey: 'last_contact_at',
        cell: ({ row }) => fmtRelative(row.original.last_contact_at),
      },
      {
        id: 'next_follow_up_at',
        header: 'Next follow-up',
        accessorKey: 'next_follow_up_at',
        cell: ({ row }) =>
          row.original.next_follow_up_at ? (
            <span className={isOverdue(row.original.next_follow_up_at) ? 'font-medium text-[var(--danger)]' : ''}>
              {fmtDate(row.original.next_follow_up_at)}
            </span>
          ) : (
            <span className="text-[var(--fg-subtle)]">—</span>
          ),
      },
      {
        id: 'interest_level',
        header: 'Interest',
        accessorKey: 'interest_level',
        cell: ({ row }) => (
          <Badge
            tone={
              row.original.interest_level === 'high'
                ? 'success'
                : row.original.interest_level === 'medium'
                  ? 'gold'
                  : row.original.interest_level === 'low'
                    ? 'neutral'
                    : 'outline'
            }
          >
            {titleCase(row.original.interest_level)}
          </Badge>
        ),
      },
      {
        id: 'warm_intro_source',
        header: 'Warm intro',
        accessorKey: 'warm_intro_source',
        cell: ({ row }) => row.original.warm_intro_source ?? '—',
      },
      {
        id: 'geography',
        header: 'Geography',
        accessorKey: 'geography',
        cell: ({ row }) => row.original.geography ?? '—',
      },
      {
        id: 'stage_preferences',
        header: 'Stages',
        accessorFn: (row) => row.stage_preferences.join(', '),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.stage_preferences.map((s) => (
              <Badge key={s} tone="neutral">{titleCase(s)}</Badge>
            ))}
          </span>
        ),
      },
      {
        id: 'data_room_access',
        header: 'Data room',
        accessorKey: 'data_room_access',
        cell: ({ row }) => (row.original.data_room_access ? <Badge tone="warning">Granted</Badge> : '—'),
      },
      {
        id: 'pitching_company_name',
        header: 'Raising for',
        accessorKey: 'pitching_company_name',
        cell: ({ row }) => row.original.pitching_company_name ?? '—',
      },
      { id: 'owner_name', header: 'Owner', accessorKey: 'owner_name', cell: ({ row }) => row.original.owner_name ?? '—' },
      {
        id: 'interaction_count',
        header: 'Touches',
        accessorKey: 'interaction_count',
        cell: ({ row }) => <span className="tnum">{row.original.interaction_count}</span>,
      },
    ],
    [],
  );

  const toolbar = (
    <>
      <NativeSelect aria-label="Saved view" value={view} onChange={(e) => setView(e.target.value)} className="h-9 w-[11rem]">
        <option value="all">All investors</option>
        <option value="active">Active pipeline</option>
        <option value="follow_up">Needs follow-up (7d)</option>
        <option value="data_room">Data room granted</option>
      </NativeSelect>
      <NativeSelect aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-[10rem]">
        <option value="all">All types</option>
        {INVESTOR_TYPES.map((t) => (
          <option key={t} value={t}>{INVESTOR_TYPE_LABELS[t]}</option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)} className="h-9 w-[11rem]">
        <option value="all">All stages</option>
        {INVESTOR_STAGES.map((s) => (
          <option key={s} value={s}>{titleCase(s)}</option>
        ))}
      </NativeSelect>
    </>
  );

  return (
    <>
      {duplicates.length > 0 ? (
        <Card className="mb-4 border-[var(--warning)]/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="size-4 text-[var(--warning)]" /> Possible duplicates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {duplicates.map((d) => (
              <p key={d.normalized} className="text-[var(--fg-muted)]">
                {d.names.join(' · ')} look like the same investor.{' '}
                {d.ids.map((id, i) => (
                  <Link key={id} href={`/investors/${id}`} className="text-[var(--accent)] hover:underline">
                    Open {i + 1}
                    {i < d.ids.length - 1 ? ', ' : ''}
                  </Link>
                ))}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="table">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="w-auto">
            <TabsTrigger value="table">
              <Table2 className="size-3.5" /> Table
            </TabsTrigger>
            <TabsTrigger value="board">
              <LayoutGrid className="size-3.5" /> Pipeline
            </TabsTrigger>
          </TabsList>
          <p className="text-sm text-[var(--fg-muted)]">
            {filtered.length} of {investors.length}
          </p>
        </div>

        <TabsContent value="table">
          <DataTable
            data={filtered}
            columns={columns}
            searchPlaceholder="Search investors…"
            toolbar={toolbar}
            exportFilename="investors"
            initialSorting={[{ id: 'weighted', desc: true }]}
            enableSelection={canWrite}
            bulkActions={(rows, clear) => (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!tagName.trim()) return;
                  const result = await bulkTagInvestorsAction(rows.map((r) => r.id), tagName);
                  if (result.ok) {
                    toast.success(`Tagged ${result.data.tagged} investor(s)`);
                    setTagName('');
                    clear();
                    router.refresh();
                  } else toast.error(result.error);
                }}
              >
                <Input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="Tag name"
                  className="h-8 w-40"
                  aria-label="Tag name"
                />
                <Button type="submit" size="sm" variant="secondary" disabled={!tagName.trim()}>
                  <Tag /> Tag
                </Button>
              </form>
            )}
            emptyTitle="No investors yet"
            emptyDescription="Build the pipeline: research funds, track introductions, and log every conversation."
            emptyAction={
              canWrite ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/investors/new">Add an investor</Link>
                </Button>
              ) : null
            }
          />
        </TabsContent>

        <TabsContent value="board">
          <div className="mb-3 flex flex-wrap gap-2">{toolbar}</div>
          <KanbanBoard
            columns={INVESTOR_STAGES.map((s) => ({ id: s, title: titleCase(s) }))}
            items={filtered.map((i) => ({ ...i, columnId: i.pipeline_stage }))}
            readOnly={!canWrite}
            emptyMessage="No investors in the pipeline yet."
            columnSummary={(_, items) =>
              items.length
                ? formatCurrency(items.reduce((a, b) => a + Number(b.potential_amount), 0), 'USD', { compact: true })
                : null
            }
            onMove={
              canWrite
                ? async (id, stage) => {
                    const result = await moveInvestorStageAction(id, stage);
                    if (result.ok) {
                      toast.success(`Moved to ${titleCase(stage)}`);
                      router.refresh();
                    } else toast.error(result.error);
                  }
                : undefined
            }
            renderCard={(inv) => (
              <Link
                href={`/investors/${inv.id}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition-colors hover:border-[var(--accent)]/50"
              >
                <p className="truncate text-sm font-medium">{inv.name}</p>
                <p className="tnum mt-0.5 text-xs text-[var(--fg-muted)]">
                  {formatCurrency(inv.potential_amount, inv.currency, { compact: true })} · {inv.probability}%
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="outline">{INVESTOR_TYPE_LABELS[inv.investor_type] ?? inv.investor_type}</Badge>
                  {inv.next_follow_up_at && isOverdue(inv.next_follow_up_at) ? (
                    <Badge tone="danger">Follow up</Badge>
                  ) : null}
                  {inv.data_room_access ? <Badge tone="warning">Data room</Badge> : null}
                </div>
                {inv.primary_contact ? (
                  <p className="mt-1.5 truncate text-xs text-[var(--fg-subtle)]">{inv.primary_contact}</p>
                ) : null}
              </Link>
            )}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
