import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { sql } from '@/lib/db/client';
import { resolveRange } from '@/lib/dates';
import { getCompanyBreakdown } from '@/lib/queries/dashboard';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Companies' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const actor = await requireActor();
  const canCreate = actor.can('company:create');
  const canSeeFinance = actor.can('finance:read');
  const range = resolveRange('last_30');
  const ids = actor.companies.map((c) => c.id);

  const [breakdown, counts] = await Promise.all([
    canSeeFinance ? getCompanyBreakdown(ids, range) : Promise.resolve([]),
    sql<{
      id: string; contacts: number; members: number; documents: number; partnerships: number;
    }>(
      `select c.id,
        (select count(*)::int from contacts x where x.company_id = c.id and x.deleted_at is null) as contacts,
        (select count(*)::int from members x where x.company_id = c.id and x.deleted_at is null) as members,
        (select count(*)::int from documents x where x.company_id = c.id and x.deleted_at is null) as documents,
        (select count(*)::int from partnerships x where x.company_id = c.id and x.deleted_at is null) as partnerships
       from companies c where c.id = any($1)`,
      [ids],
    ),
  ]);

  const financeById = new Map(breakdown.map((b) => [b.id, b]));
  const countsById = new Map(counts.map((c) => [c.id, c]));
  const active = actor.companies.filter((c) => !c.archived_at);
  const archived = actor.companies.filter((c) => c.archived_at);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Every entity under Eisman Holdings. Each has its own workspace, permissions, dashboards and records."
        actions={
          canCreate ? (
            <Button asChild variant="primary">
              <Link href="/companies/new">
                <Plus /> New company
              </Link>
            </Button>
          ) : null
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Create your first company to start using the Command Center."
          action={
            canCreate ? (
              <Button asChild variant="primary">
                <Link href="/companies/new">
                  <Plus /> New company
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((company) => {
            const finance = financeById.get(company.id);
            const count = countsById.get(company.id);
            return (
              <Card key={company.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ background: company.brand_color }}
                        aria-hidden
                      >
                        {company.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <CardTitle className="truncate">{company.name}</CardTitle>
                        <p className="truncate text-xs text-[var(--fg-subtle)]">/{company.slug}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={company.status} />
                      {company.is_demo ? <Badge tone="gold">Demo</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {finance ? (
                      <>
                        <div>
                          <dt className="text-[11px] text-[var(--fg-subtle)] uppercase">Revenue (30d)</dt>
                          <dd className="tnum font-semibold">{formatCurrency(finance.revenue)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-[var(--fg-subtle)] uppercase">Active clients</dt>
                          <dd className="tnum font-semibold">{formatNumber(finance.clients)}</dd>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <dt className="text-[11px] text-[var(--fg-subtle)] uppercase">People</dt>
                      <dd className="tnum font-semibold">{formatNumber(count?.members ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--fg-subtle)] uppercase">Contacts</dt>
                      <dd className="tnum font-semibold">{formatNumber(count?.contacts ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--fg-subtle)] uppercase">Documents</dt>
                      <dd className="tnum font-semibold">{formatNumber(count?.documents ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[var(--fg-subtle)] uppercase">Partnerships</dt>
                      <dd className="tnum font-semibold">{formatNumber(count?.partnerships ?? 0)}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/companies/${company.slug}`}>Workspace</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/?company=${company.slug}`}>Dashboard</Link>
                    </Button>
                    {actor.can('company:write', company.id) ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/companies/${company.slug}/settings`}>Settings</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {archived.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
            Archived
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((company) => (
              <Card key={company.id} className="opacity-70">
                <CardContent className="flex items-center justify-between gap-2 pt-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{company.name}</p>
                    <p className="text-xs text-[var(--fg-subtle)]">Archived — records are preserved</p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/companies/${company.slug}/settings`}>Manage</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
