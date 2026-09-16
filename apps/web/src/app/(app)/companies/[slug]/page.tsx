import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Banknote, BookOpen, CalendarDays, CircleCheckBig, Handshake, Settings, Users, UsersRound,
} from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { sql } from '@/lib/db/client';
import { resolveRange, comparisonRange, fmtRelative } from '@/lib/dates';
import { getDashboardMetrics } from '@/lib/queries/dashboard';
import { listActivity } from '@/lib/activity';
import { formatCurrency, formatNumber, pctChange } from '@/lib/utils';
import { PageHeader, SectionHeading, DefinitionList } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState } from '@/components/ui/states';
import { ROLE_LABELS } from '@/lib/rbac/permissions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
}

const SHORTCUTS = [
  { href: '/crm', label: 'CRM', icon: Users, permission: 'crm:read' },
  { href: '/tasks', label: 'Tasks', icon: CircleCheckBig, permission: 'task:read' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, permission: 'calendar:read' },
  { href: '/finances', label: 'Finances', icon: Banknote, permission: 'finance:read' },
  { href: '/team', label: 'Team', icon: UsersRound, permission: 'team:read' },
  { href: '/partnerships', label: 'Partnerships', icon: Handshake, permission: 'partnership:read' },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen, permission: 'knowledge:read' },
] as const;

export default async function CompanyWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActor();
  const company = actor.companies.find((c) => c.slug === slug);
  if (!company) notFound();

  const range = resolveRange('last_30');
  const comparison = comparisonRange(range);
  const canSeeFinance = actor.can('finance:read', company.id);

  const [metrics, detail, members, activity] = await Promise.all([
    getDashboardMetrics({
      companyIds: [company.id],
      range,
      comparison,
      includeParfax: company.slug === 'parfax' && actor.can('parfax:read', company.id),
    }),
    sql<{
      legal_name: string | null; description: string | null; website: string | null;
      kind: string; created_at: Date; departments: number; folders: number;
    }>(
      `select c.legal_name, c.description, c.website, c.kind, c.created_at,
        (select count(*)::int from departments d where d.company_id = c.id and d.archived_at is null) as departments,
        (select count(*)::int from folders f where f.company_id = c.id) as folders
       from companies c where c.id = $1`,
      [company.id],
    ),
    sql<{ name: string; email: string; role: string }>(
      `select u.name, u.email, r.role
       from user_company_roles r join users u on u.id = r.user_id
       where r.company_id = $1 or r.company_id is null
       order by r.role, u.name limit 20`,
      [company.id],
    ),
    listActivity({ companyIds: [company.id], limit: 8 }),
  ]);

  const info = detail[0]!;
  const q = (href: string) => `${href}?company=${company.slug}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Companies', href: '/companies' }, { label: company.name }]}
        title={
          <span className="flex items-center gap-3">
            <span
              className="flex size-9 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ background: company.brand_color }}
              aria-hidden
            >
              {company.name.slice(0, 2).toUpperCase()}
            </span>
            {company.name}
          </span>
        }
        description={info.description ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={company.status} />
            <Badge tone="outline">{info.kind.replace(/^\w/, (c) => c.toUpperCase())}</Badge>
            <Badge tone="outline">{company.currency}</Badge>
            {company.is_demo ? <Badge tone="gold">Demo company</Badge> : null}
          </div>
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/?company=${company.slug}`}>Company dashboard</Link>
            </Button>
            {actor.can('company:write', company.id) ? (
              <Button asChild variant="ghost">
                <Link href={`/companies/${company.slug}/settings`}>
                  <Settings /> Settings
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {canSeeFinance ? (
          <StatCard
            label="Revenue (30d)"
            value={formatCurrency(metrics.revenue.current)}
            delta={pctChange(metrics.revenue.current, metrics.revenue.previous)}
            comparisonLabel="previous 30 days"
            href={q('/finances')}
          />
        ) : null}
        <StatCard label="Active clients" value={formatNumber(metrics.activeClients.current)} href={q('/crm')} />
        <StatCard
          label="Open tasks"
          value={formatNumber(metrics.openTasks)}
          hint={`${metrics.overdueTasks} overdue`}
          tone={metrics.overdueTasks > 0 ? 'warning' : 'default'}
          href={q('/tasks')}
        />
        <StatCard
          label="Partnership pipeline"
          value={formatCurrency(metrics.partnershipPipeline.value, company.currency, { compact: true })}
          hint={`${metrics.partnershipPipeline.count} open`}
          href={q('/partnerships')}
        />
      </div>

      <SectionHeading title="Jump into" />
      <div className="mb-6 flex flex-wrap gap-2">
        {SHORTCUTS.filter((s) => actor.can(s.permission, company.id)).map((s) => (
          <Button key={s.href} asChild variant="secondary" size="sm">
            <Link href={q(s.href)}>
              <s.icon /> {s.label}
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionList
              columns={1}
              items={[
                { label: 'Legal name', value: info.legal_name ?? '—' },
                {
                  label: 'Website',
                  value: info.website ? (
                    <a href={info.website} target="_blank" rel="noreferrer noopener" className="text-[var(--accent)] hover:underline">
                      {info.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : '—',
                },
                { label: 'Time zone', value: company.timezone },
                { label: 'Departments', value: info.departments },
                { label: 'Document folders', value: info.folders },
                { label: 'Created', value: fmtRelative(info.created_at) },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Who has access</CardTitle>
            {actor.can('user:manage', company.id) ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings/members">Manage</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-1.5">
            {members.length === 0 ? (
              <EmptyState title="No one assigned" className="border-0 py-6" />
            ) : (
              members.map((m) => (
                <div key={`${m.email}-${m.role}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-[var(--fg-subtle)]">{m.email}</span>
                  </span>
                  <Badge tone="outline">{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {activity.length === 0 ? (
              <EmptyState title="Nothing yet" className="border-0 py-6" />
            ) : (
              activity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p>{a.summary}</p>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    {a.actor_name ?? 'System'} · {fmtRelative(a.created_at)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
