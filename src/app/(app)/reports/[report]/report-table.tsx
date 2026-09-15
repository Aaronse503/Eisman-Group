'use client';
import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Printer } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber, titleCase } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';

interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  currency?: boolean;
  percent?: boolean;
}

const DATE_KEYS = /(_at|_date|^month$)/;

function renderCell(column: Column, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-[var(--fg-subtle)]">—</span>;
  }
  if (column.currency) return <span className="tnum">{formatCurrency(Number(value))}</span>;
  if (column.percent) return <span className="tnum">{Number(value)}%</span>;
  if (column.numeric) return <span className="tnum">{formatNumber(Number(value))}</span>;
  if (DATE_KEYS.test(column.key)) {
    if (column.key === 'month') {
      const [year, m] = String(value).split('-');
      return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });
    }
    return fmtDate(value as string);
  }
  const text = String(value);
  // Status-like values read better in title case.
  return /^[a-z_]+$/.test(text) && text.length < 24 ? titleCase(text) : text;
}

export function ReportTable({
  columns,
  rows,
  filename,
  title,
  subtitle,
}: {
  columns: Column[];
  rows: Record<string, unknown>[];
  filename: string;
  title: string;
  subtitle: string;
}) {
  const tableColumns = React.useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        header: column.label,
        accessorFn: (row) => row[column.key],
        cell: ({ row }) => renderCell(column, row.original[column.key]),
      })),
    [columns],
  );

  const totals = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const column of columns) {
      if (!column.numeric || column.percent) continue;
      out[column.key] = rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0);
    }
    return out;
  }, [columns, rows]);

  return (
    <div className="space-y-4">
      <div className="print-hide flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      {/* Print-only heading, so a printed sheet is self-describing. */}
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm">{subtitle}</p>
      </div>

      <DataTable
        data={rows}
        columns={tableColumns}
        searchPlaceholder="Filter rows…"
        exportFilename={filename}
        pageSize={50}
        emptyTitle="No data for this period"
        emptyDescription="Try a wider date range, or a different company."
      />

      {Object.keys(totals).length && rows.length ? (
        <div className="flex flex-wrap gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3 print-break">
          {columns
            .filter((c) => c.numeric && !c.percent)
            .map((column) => (
              <div key={column.key}>
                <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">
                  Total {column.label.toLowerCase()}
                </p>
                <p className="tnum font-semibold">
                  {column.currency
                    ? formatCurrency(totals[column.key] ?? 0)
                    : formatNumber(totals[column.key] ?? 0)}
                </p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
