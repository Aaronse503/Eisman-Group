'use client';
import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { EmptyState } from '@/components/ui/states';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toCsv, downloadCsv } from '@/lib/csv/client';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Enables the search box and searches across every visible cell. */
  searchPlaceholder?: string;
  initialSorting?: SortingState;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Adds a leading selection column and exposes the selected rows. */
  enableSelection?: boolean;
  onSelectionChange?: (rows: T[]) => void;
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode;
  exportFilename?: string;
  className?: string;
  stickyHeader?: boolean;
}

export function DataTable<T extends object>({
  data,
  columns,
  searchPlaceholder = 'Search…',
  initialSorting = [],
  pageSize = 25,
  onRowClick,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  toolbar,
  enableSelection,
  onSelectionChange,
  bulkActions,
  exportFilename,
  className,
  stickyHeader = true,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const allColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!enableSelection) return columns;
    const selectCol: ColumnDef<T, unknown> = {
      id: '__select',
      size: 36,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows"
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
    return [selectCol, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  React.useEffect(() => {
    onSelectionChange?.(selectedRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  const handleExport = () => {
    const visible = table
      .getVisibleLeafColumns()
      .filter((c) => c.id !== '__select' && c.id !== '__actions');
    const header = visible.map((c) => String(c.columnDef.header ?? c.id));
    const rows = table.getFilteredRowModel().rows.map((row) =>
      visible.map((col) => {
        const value = row.getValue(col.id);
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }),
    );
    downloadCsv(`${exportFilename ?? 'export'}.csv`, toCsv([header, ...rows]));
  };

  const total = table.getFilteredRowModel().rows.length;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
              aria-label={searchPlaceholder}
            />
          </div>
          {toolbar}
        </div>
        <div className="flex items-center gap-2">
          {exportFilename ? (
            <Button variant="ghost" size="sm" onClick={handleExport} title="Export visible rows to CSV">
              <Download /> <span className="hidden sm:inline">Export</span>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Columns3 /> <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide() && c.id !== '__select')
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {String(column.columnDef.header ?? column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {enableSelection && selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--accent-soft-fg)]">
            {selectedRows.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions?.(selectedRows, () => setRowSelection({}))}
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead
              className={cn(
                'bg-[var(--surface-sunken)] text-left',
                stickyHeader && 'sticky top-0 z-10',
              )}
            >
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const dir = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                        className="border-b border-[var(--border)] px-3 py-2.5 text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase"
                        aria-sort={
                          dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
                        }
                      >
                        {header.isPlaceholder ? null : sortable ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--fg)]"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {dir === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : dir === 'desc' ? (
                              <ArrowDown className="size-3" />
                            ) : null}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b border-[var(--border)] last:border-b-0',
                    onRowClick && 'cursor-pointer',
                    'hover:bg-[var(--surface-sunken)]/70',
                    row.getIsSelected() && 'bg-[var(--accent-soft)]',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total === 0 ? (
          <EmptyState
            title={globalFilter ? 'No matches' : emptyTitle}
            description={
              globalFilter ? `Nothing matches “${globalFilter}”.` : emptyDescription
            }
            action={globalFilter ? null : emptyAction}
            className="border-0"
          />
        ) : null}
      </div>

      {total > table.getState().pagination.pageSize ? (
        <div className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
          <p className="text-[var(--fg-muted)]">
            Showing{' '}
            <span className="tnum font-medium text-[var(--fg)]">
              {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                total,
              )}
            </span>{' '}
            of <span className="tnum font-medium text-[var(--fg)]">{total}</span>
          </p>
          <div className="flex items-center gap-2">
            <NativeSelect
              value={String(table.getState().pagination.pageSize)}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 w-[5.5rem]"
              aria-label="Rows per page"
            >
              {[10, 25, 50, 100, 250].map((n) => (
                <option key={n} value={n}>
                  {n} rows
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
