import * as React from 'react';
import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import {
  PERMISSIONS, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS,
  type Permission,
} from '@/lib/rbac/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Roles & permissions' };
export const dynamic = 'force-dynamic';

export default async function PermissionsPage() {
  const actor = await requireActor();
  const myRoles = new Set(actor.grants.map((g) => g.role));

  const groups = new Map<string, Permission[]>();
  for (const permission of PERMISSIONS) {
    const [group] = permission.split(':');
    groups.set(group!, [...(groups.get(group!) ?? []), permission]);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your access</CardTitle>
          <CardDescription>
            Roles are granted per company. A grant with no company applies to every company, now and
            in future.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {actor.grants.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">You have no roles assigned.</p>
          ) : (
            actor.grants.map((g, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <span>{ROLE_LABELS[g.role]}</span>
                <Badge tone="outline">
                  {g.companyId
                    ? (actor.companies.find((c) => c.id === g.companyId)?.name ?? 'Company')
                    : 'All companies'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What each role can do</CardTitle>
          <CardDescription>
            The roles you hold are highlighted. This table is generated from the live permission
            matrix, so it is always accurate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid gap-2 sm:grid-cols-2">
            {ROLES.map((role) => (
              <div
                key={role}
                className={
                  myRoles.has(role)
                    ? 'rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3'
                    : 'rounded-lg border border-[var(--border)] p-3'
                }
              >
                <p className="text-sm font-medium">{ROLE_LABELS[role]}</p>
                <p className="text-xs text-[var(--fg-muted)]">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--surface-sunken)]">
                  <th scope="col" className="border-b border-[var(--border)] px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
                    Permission
                  </th>
                  {ROLES.map((role) => (
                    <th
                      key={role}
                      scope="col"
                      className="border-b border-[var(--border)] px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase"
                    >
                      {ROLE_LABELS[role].replace(' ', '\n')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...groups.entries()].map(([group, permissions]) => (
                  <React.Fragment key={group}>
                    <tr>
                      <td colSpan={ROLES.length + 1} className="bg-[var(--surface-sunken)]/60 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                        {titleCase(group)}
                      </td>
                    </tr>
                    {permissions.map((permission) => (
                      <tr key={permission} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-1.5 font-mono text-xs">{permission}</td>
                        {ROLES.map((role) => (
                          <td key={role} className="px-2 py-1.5 text-center">
                            {ROLE_PERMISSIONS[role].has(permission) ? (
                              <Check className="mx-auto size-3.5 text-[var(--success)]" aria-label="Allowed" />
                            ) : (
                              <Minus className="mx-auto size-3.5 text-[var(--fg-subtle)]" aria-label="Not allowed" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
