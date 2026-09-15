'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Mail, Phone } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { titleCase } from '@/lib/utils';
import { CONTACT_ROLES, type ContactRow } from '@/lib/domain/crm';

export function ContactsView({
  contacts,
  canWrite,
  showCompany,
}: {
  contacts: ContactRow[];
  canWrite: boolean;
  showCompany: boolean;
}) {
  const [role, setRole] = React.useState('all');
  const filtered = React.useMemo(
    () => (role === 'all' ? contacts : contacts.filter((c) => c.roles.includes(role))),
    [contacts, role],
  );

  const columns = React.useMemo<ColumnDef<ContactRow, unknown>[]>(() => {
    const cols: ColumnDef<ContactRow, unknown>[] = [
      {
        id: 'full_name',
        header: 'Name',
        accessorKey: 'full_name',
        cell: ({ row }) => (
          <Link
            href={`/crm/contacts/${row.original.id}`}
            className="font-medium hover:text-[var(--accent)] hover:underline"
          >
            {row.original.full_name}
          </Link>
        ),
      },
      { id: 'title', header: 'Title', accessorKey: 'title', cell: ({ row }) => row.original.title ?? '—' },
      {
        id: 'organization_name',
        header: 'Organization',
        accessorKey: 'organization_name',
        cell: ({ row }) => row.original.organization_name ?? '—',
      },
      {
        id: 'roles',
        header: 'Roles',
        accessorFn: (row) => row.roles.join(', '),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.length === 0 ? (
              <span className="text-[var(--fg-subtle)]">—</span>
            ) : (
              row.original.roles.map((r) => (
                <Badge key={r} tone="outline">
                  {titleCase(r)}
                </Badge>
              ))
            )}
          </span>
        ),
      },
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) =>
          row.original.email ? (
            <a
              href={`mailto:${row.original.email}`}
              className="flex items-center gap-1 text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="size-3.5" /> {row.original.email}
            </a>
          ) : (
            '—'
          ),
      },
      {
        id: 'phone',
        header: 'Phone',
        accessorKey: 'phone',
        cell: ({ row }) =>
          row.original.phone ? (
            <span className="flex items-center gap-1 text-[var(--fg-muted)]">
              <Phone className="size-3.5" /> {row.original.phone}
            </span>
          ) : (
            '—'
          ),
      },
      { id: 'owner_name', header: 'Owner', accessorKey: 'owner_name', cell: ({ row }) => row.original.owner_name ?? '—' },
    ];
    if (showCompany) {
      cols.splice(3, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    }
    return cols;
  }, [showCompany]);

  return (
    <DataTable
      data={filtered}
      columns={columns}
      searchPlaceholder="Search contacts…"
      exportFilename="contacts"
      initialSorting={[{ id: 'full_name', desc: false }]}
      toolbar={
        <NativeSelect
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-9 w-[10rem]"
        >
          <option value="all">All roles</option>
          {CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>
              {titleCase(r)}
            </option>
          ))}
        </NativeSelect>
      }
      emptyTitle="No contacts yet"
      emptyDescription="Add the people behind your clients, partners and investors. One person can hold several roles."
      emptyAction={
        canWrite ? (
          <Button asChild variant="primary" size="sm">
            <Link href="/crm/contacts/new">Add a contact</Link>
          </Button>
        ) : null
      }
    />
  );
}
