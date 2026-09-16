'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status';
import { titleCase } from '@/lib/utils';
import { ORGANIZATION_ROLES, type OrganizationRow } from '@/lib/domain/crm';

export function OrganizationsView({
  organizations,
  canWrite,
  showCompany,
}: {
  organizations: OrganizationRow[];
  canWrite: boolean;
  showCompany: boolean;
}) {
  const [role, setRole] = React.useState('all');
  const filtered = React.useMemo(
    () => (role === 'all' ? organizations : organizations.filter((o) => o.roles.includes(role))),
    [organizations, role],
  );

  const columns = React.useMemo<ColumnDef<OrganizationRow, unknown>[]>(() => {
    const cols: ColumnDef<OrganizationRow, unknown>[] = [
      {
        id: 'name',
        header: 'Organization',
        accessorKey: 'name',
        cell: ({ row }) => (
          <Link
            href={`/crm/organizations/${row.original.id}`}
            className="font-medium hover:text-[var(--accent)] hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        accessorFn: (row) => row.roles.join(', '),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.length ? (
              row.original.roles.map((r) => (
                <Badge key={r} tone="accent">{titleCase(r)}</Badge>
              ))
            ) : (
              <span className="text-[var(--fg-subtle)]">—</span>
            )}
          </span>
        ),
      },
      { id: 'industry', header: 'Industry', accessorKey: 'industry', cell: ({ row }) => row.original.industry ?? '—' },
      {
        id: 'website',
        header: 'Website',
        accessorKey: 'website',
        cell: ({ row }) =>
          row.original.website ? (
            <a
              href={row.original.website}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-[var(--accent)] hover:underline"
            >
              {row.original.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink className="size-3" />
            </a>
          ) : (
            '—'
          ),
      },
      { id: 'contacts', header: 'Contacts', accessorKey: 'contacts', cell: ({ row }) => <span className="tnum">{row.original.contacts}</span> },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (row) => [row.city, row.country].filter(Boolean).join(', '),
        cell: ({ row }) => [row.original.city, row.original.country].filter(Boolean).join(', ') || '—',
      },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ];
    if (showCompany) cols.splice(1, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    return cols;
  }, [showCompany]);

  return (
    <DataTable
      data={filtered}
      columns={columns}
      searchPlaceholder="Search organizations…"
      exportFilename="organizations"
      initialSorting={[{ id: 'name', desc: false }]}
      toolbar={
        <NativeSelect
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-9 w-[10rem]"
        >
          <option value="all">All roles</option>
          {ORGANIZATION_ROLES.map((r) => (
            <option key={r} value={r}>{titleCase(r)}</option>
          ))}
        </NativeSelect>
      }
      emptyTitle="No organizations yet"
      emptyDescription="Organizations group contacts and carry the relationship to a client, vendor or partner."
      emptyAction={
        canWrite ? (
          <Button asChild variant="primary" size="sm">
            <Link href="/crm/organizations/new">Add an organization</Link>
          </Button>
        ) : null
      }
    />
  );
}
