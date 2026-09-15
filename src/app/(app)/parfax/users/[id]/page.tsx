import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getParfaxUser, getParfaxUserDetail } from '@/lib/queries/parfax';
import { getNotes } from '@/lib/queries/records';
import { listAudit } from '@/lib/audit';
import { listActivity } from '@/lib/activity';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/dates';
import { formatCurrency, formatNumber, formatPercent, titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList, SourceNote } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { SourceBadge, StatusBadge } from '@/components/ui/status';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import { NotesPanel, ActivityTimeline } from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';
import { ParfaxNav } from '../../parfax-nav';
import { UserAdminPanel } from './admin-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getParfaxUser(id);
  return { title: user?.name ?? user?.email ?? 'ParFax user' };
}

export default async function ParfaxUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    return <ForbiddenState permission="parfax:read" />;
  }

  const user = await getParfaxUser(id);
  if (!user) notFound();

  const canAdmin = actor.can('parfax:user_admin', parfax.id);
  const [detail, notes, audit, activity] = await Promise.all([
    getParfaxUserDetail(id),
    getNotes('parfax_user', id),
    actor.can('audit:read', parfax.id)
      ? listAudit({ entityType: 'parfax_user', entityId: id, limit: 40 })
      : Promise.resolve([]),
    listActivity({ entityType: 'parfax_user', entityId: id, limit: 25 }),
  ]);

  const verified = detail.scans.filter((s) => s.verified);
  const correct = verified.filter((s) => s.verified_correct);
  const subscription = detail.subscriptions[0] ?? null;

  return (
    <>
      <TrackView entityType="parfax_user" entityId={id} label={user.email} href={`/parfax/users/${id}`} companyId={parfax.id} />
      <PageHeader
        breadcrumbs={[
          { label: 'ParFax', href: '/parfax' },
          { label: 'Users', href: '/parfax/users' },
          { label: user.name ?? user.email },
        ]}
        title={user.name ?? user.email}
        description={user.email}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={user.status} />
            <Badge tone={user.plan === 'free' ? 'neutral' : 'accent'}>{titleCase(user.plan)}</Badge>
            {user.promo_access ? <Badge tone="gold">Promo: {user.promo_access}</Badge> : null}
            {user.merged_into_id ? <Badge tone="warning">Merged</Badge> : null}
            <SourceBadge source={user.source} isDemo={user.is_demo} />
          </div>
        }
      />
      <ParfaxNav />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scans" value={formatNumber(user.scan_count)} hint={`${verified.length} verified`} />
        <StatCard
          label="Scan accuracy"
          value={verified.length ? formatPercent((correct.length / verified.length) * 100) : '—'}
          hint={verified.length ? `${correct.length}/${verified.length} verified correct` : 'No verified scans'}
        />
        <StatCard
          label="Lifetime value"
          value={formatCurrency(user.lifetime_value)}
          hint="Read from the billing system; not editable here"
        />
        <StatCard
          label="Last active"
          value={user.last_active_at ? fmtRelative(user.last_active_at) : 'Never'}
          hint={`Signed up ${fmtDate(user.signup_at)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">Scans ({detail.scans.length})</TabsTrigger>
              <TabsTrigger value="billing">Billing ({detail.subscriptions.length})</TabsTrigger>
              <TabsTrigger value="marketplace">Marketplace ({detail.marketplace.length})</TabsTrigger>
              <TabsTrigger value="support">Support ({detail.issues.length})</TabsTrigger>
              {audit.length ? <TabsTrigger value="audit">Audit ({audit.length})</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle>Scan activity</CardTitle>
                  <SourceNote source="Scan records held in this system" />
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {detail.scans.length === 0 ? (
                    <EmptyState title="No scans recorded" className="border-0 py-6" />
                  ) : (
                    detail.scans.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {s.brand} {s.model}
                          </span>
                          <span className="block text-xs text-[var(--fg-subtle)]">
                            {titleCase(s.club_type ?? '')} · {fmtDateTime(s.scanned_at)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {s.confidence !== null ? (
                            <Badge tone="neutral">{Number(s.confidence).toFixed(0)}% confident</Badge>
                          ) : null}
                          {s.verified ? (
                            <Badge tone={s.verified_correct ? 'success' : 'danger'}>
                              {s.verified_correct ? 'Verified correct' : 'Verified wrong'}
                            </Badge>
                          ) : null}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="billing">
              <Card>
                <CardHeader>
                  <CardTitle>Subscriptions</CardTitle>
                  <SourceNote source="Mirrored from the billing provider. Plan and price changes must be made there." />
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.subscriptions.length === 0 ? (
                    <EmptyState title="No subscription history" className="border-0 py-6" />
                  ) : (
                    detail.subscriptions.map((s) => (
                      <div key={s.id} className="rounded-lg border border-[var(--border)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{titleCase(s.plan)}</span>
                          <span className="flex items-center gap-2">
                            <span className="tnum text-sm">
                              {formatCurrency(s.amount, s.currency)}/{s.interval}
                            </span>
                            <StatusBadge status={s.status} />
                            <SourceBadge source={s.source} />
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                          Started {fmtDate(s.started_at)}
                          {s.current_period_end ? ` · renews ${fmtDate(s.current_period_end)}` : ''}
                          {s.canceled_at ? ` · cancelled ${fmtDate(s.canceled_at)}` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="marketplace">
              <Card>
                <CardHeader>
                  <CardTitle>Marketplace activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {detail.marketplace.length === 0 ? (
                    <EmptyState title="No marketplace activity" className="border-0 py-6" />
                  ) : (
                    detail.marketplace.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <Badge tone="outline">{titleCase(m.kind)}</Badge> {m.item}
                        </span>
                        <span className="tnum shrink-0 text-[var(--fg-muted)]">
                          {formatCurrency(m.amount)} · {fmtDate(m.occurred_at)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="support">
              <Card>
                <CardHeader>
                  <CardTitle>Support issues</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.issues.length === 0 ? (
                    <EmptyState title="No support issues" className="border-0 py-6" />
                  ) : (
                    detail.issues.map((i) => (
                      <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{i.subject}</span>
                          <span className="block text-xs text-[var(--fg-subtle)]">
                            {titleCase(i.category ?? '')} · opened {fmtDate(i.opened_at)}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          <Badge tone={i.priority === 'urgent' ? 'danger' : i.priority === 'high' ? 'warning' : 'neutral'}>
                            {titleCase(i.priority)}
                          </Badge>
                          <StatusBadge status={i.status} />
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {audit.length ? (
              <TabsContent value="audit">
                <Card>
                  <CardHeader>
                    <CardTitle>Administrative history</CardTitle>
                    <SourceNote source="Append-only audit log. These records cannot be edited or deleted by anyone, including administrators." />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {audit.map((a) => (
                      <div key={a.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{titleCase(a.action.replace(/\./g, ' '))}</span>
                          <Badge tone={a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'neutral'}>
                            {titleCase(a.severity)}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                          {a.actor_name ?? a.actor_email ?? 'System'} · {fmtDateTime(a.created_at)}
                        </p>
                        {a.reason ? <p className="mt-1 text-[var(--fg-muted)]">{a.reason}</p> : null}
                        {a.before_value || a.after_value ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <div>
                              <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Before</p>
                              <pre className="overflow-x-auto rounded bg-[var(--surface-sunken)] p-2 text-[11px]">
                                {JSON.stringify(a.before_value ?? null, null, 1)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">After</p>
                              <pre className="overflow-x-auto rounded bg-[var(--surface-sunken)] p-2 text-[11px]">
                                {JSON.stringify(a.after_value ?? null, null, 1)}
                              </pre>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>

          <NotesPanel
            target={{ entityType: 'parfax_user', entityId: id }}
            notes={notes}
            canWrite={canAdmin}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={1}
                items={[
                  { label: 'External id', value: user.external_id ?? '—' },
                  { label: 'Handle', value: user.handle ?? '—' },
                  { label: 'Region', value: [user.region, user.country].filter(Boolean).join(', ') || '—' },
                  { label: 'Acquisition', value: titleCase(user.acquisition_source ?? '—') },
                  { label: 'Signed up', value: fmtDateTime(user.signup_at) },
                  {
                    label: 'Subscription',
                    value: subscription ? `${titleCase(subscription.plan)} · ${titleCase(subscription.status)}` : 'None',
                  },
                  {
                    label: 'Promotional access',
                    value: user.promo_access
                      ? `${user.promo_access}${user.promo_expires_at ? ` until ${fmtDate(user.promo_expires_at)}` : ''}`
                      : 'None',
                  },
                ]}
              />
            </CardContent>
          </Card>

          {canAdmin ? (
            <UserAdminPanel
              userId={id}
              email={user.email}
              status={user.status}
              promoAccess={user.promo_access}
              promoExpiresAt={user.promo_expires_at}
              name={user.name}
              handle={user.handle}
              country={user.country}
              region={user.region}
              acquisitionSource={user.acquisition_source}
            />
          ) : (
            <Card>
              <CardContent className="flex items-start gap-2 py-4 text-sm text-[var(--fg-muted)]">
                <Info className="mt-0.5 size-4 shrink-0" />
                Administrative actions need the ParFax user administration permission.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>

          <p className="text-xs text-[var(--fg-subtle)]">
            Need the full history?{' '}
            <Link href="/settings/audit" className="text-[var(--accent)] hover:underline">
              Open the audit log
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
