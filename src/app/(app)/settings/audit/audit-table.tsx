'use client';
import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { fmtDateTime } from '@/lib/dates';
import { titleCase } from '@/lib/utils';

export interface AuditEntryView {
  id: string;
  createdAt: Date;
  actor: string;
  action: string;
  entityType: string;
  entityLabel: string | null;
  entityId: string | null;
  company: string | null;
  reason: string | null;
  severity: string;
  before: unknown;
  after: unknown;
}

const SEVERITY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  info: 'neutral',
  notice: 'info',
  warning: 'warning',
  critical: 'danger',
};

export function AuditTable({ entries }: { entries: AuditEntryView[] }) {
  const [selected, setSelected] = React.useState<AuditEntryView | null>(null);

  const columns = React.useMemo<ColumnDef<AuditEntryView, unknown>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'When',
        accessorKey: 'createdAt',
        cell: ({ row }) => <span className="tnum text-xs">{fmtDateTime(row.original.createdAt)}</span>,
      },
      { id: 'actor', header: 'Who', accessorKey: 'actor' },
      {
        id: 'action',
        header: 'Action',
        accessorKey: 'action',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
      },
      {
        id: 'entityLabel',
        header: 'Record',
        accessorFn: (row) => row.entityLabel ?? row.entityType,
        cell: ({ row }) => (
          <span className="min-w-0">
            <span className="block truncate">{row.original.entityLabel ?? '—'}</span>
            <span className="block text-xs text-[var(--fg-subtle)]">
              {titleCase(row.original.entityType)}
            </span>
          </span>
        ),
      },
      { id: 'company', header: 'Company', accessorKey: 'company', cell: ({ row }) => row.original.company ?? '—' },
      {
        id: 'severity',
        header: 'Severity',
        accessorKey: 'severity',
        cell: ({ row }) => (
          <Badge tone={SEVERITY_TONE[row.original.severity] ?? 'neutral'}>
            {titleCase(row.original.severity)}
          </Badge>
        ),
      },
      {
        id: 'reason',
        header: 'Reason',
        accessorKey: 'reason',
        cell: ({ row }) =>
          row.original.reason ? (
            <span className="line-clamp-1 text-sm">{row.original.reason}</span>
          ) : (
            <span className="text-[var(--fg-subtle)]">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        data={entries}
        columns={columns}
        searchPlaceholder="Search by action, record or person…"
        exportFilename="audit-log"
        pageSize={50}
        onRowClick={(row) => setSelected(row)}
        emptyTitle="Nothing recorded yet"
        emptyDescription="Sensitive actions — financial changes, permission changes, imports, exports, integrations and administrative edits — appear here."
      />

      <Dialog open={Boolean(selected)} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selected?.action}</DialogTitle>
            <DialogDescription>
              {selected ? `${selected.actor} · ${fmtDateTime(selected.createdAt)}` : ''}
              {selected?.company ? ` · ${selected.company}` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {selected?.entityLabel ? (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                  Record
                </p>
                <p className="text-sm">
                  {selected.entityLabel}{' '}
                  <span className="text-[var(--fg-subtle)]">({titleCase(selected.entityType)})</span>
                </p>
              </div>
            ) : null}
            {selected?.reason ? (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                  Reason given
                </p>
                <p className="text-sm">{selected.reason}</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                  Before
                </p>
                <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 text-xs">
                  {JSON.stringify(selected?.before ?? null, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                  After
                </p>
                <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 text-xs">
                  {JSON.stringify(selected?.after ?? null, null, 2)}
                </pre>
              </div>
            </div>
            <p className="text-xs text-[var(--fg-subtle)]">
              Entry id {selected?.id}. Values matching password, token, key, SSN, bank or card
              patterns are redacted before storage.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
