import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Banknote, CalendarDays, CircleCheckBig, ExternalLink, Globe, Mail, Pencil, Phone, Users,
} from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { sql } from '@/lib/db/client';
import { getClient, getClientContacts, getClientFinance, getClientTeam } from '@/lib/queries/crm';
import { getRecordSidecars, getOutreach } from '@/lib/queries/records';
import { listActivity } from '@/lib/activity';
import { fmtDate, fmtDateTime, fmtRelative, isOverdue } from '@/lib/dates';
import { formatCurrency, titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HealthBadge, PriorityBadge, SourceBadge, StatusBadge } from '@/components/ui/status';
import { Tabs, TabsContent, TabsList, TabsTrigger, Progress } from '@/components/ui/misc';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat-card';
import {
  ActivityTimeline, AttachmentsPanel, CommentsPanel, CustomFieldsPanel,
  NotesPanel, OutreachPanel, RemindersPanel, TagsPanel,
} from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';
import { ArchiveRecord } from '@/components/record/archive-record';
import { archiveClientAction } from '@/server/actions/crm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.name ?? 'Client' };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const client = await getClient(id);
  if (!client) notFound();
  if (!actor.canReadCompany(client.company_id) || !actor.can('crm:read', client.company_id)) {
    return <ForbiddenState permission="crm:read" backHref="/crm" />;
  }

  const canWrite = actor.can('crm:write', client.company_id);
  const canSeeFinance = actor.can('finance:read', client.company_id);

  const [contacts, team, sidecars, outreach, activity, tasks, meetings, finance, projects] =
    await Promise.all([
      getClientContacts(id),
      getClientTeam(id),
      getRecordSidecars('client', id, client.company_id),
      getOutreach('client', id),
      listActivity({ entityType: 'client', entityId: id, limit: 40 }),
      sql<{
        id: string; title: string; status: string; priority: string; due_at: Date | null;
        assignee_name: string | null; completed_at: Date | null;
      }>(
        `select t.id, t.title, t.status, t.priority, t.due_at, t.completed_at, u.name as assignee_name
         from tasks t left join users u on u.id = t.assignee_user_id
         where t.client_id = $1 and t.deleted_at is null
         order by (t.status = 'done'), t.due_at nulls last limit 40`,
        [id],
      ),
      sql<{ id: string; title: string; starts_at: Date; status: string; template: string }>(
        `select id, title, starts_at, status, template from meetings
         where client_id = $1 and deleted_at is null
         order by starts_at desc limit 20`,
        [id],
      ),
      canSeeFinance ? getClientFinance(id) : Promise.resolve({ invoices: [], payments: [] }),
      sql<{ id: string; name: string; status: string; due_date: string | null }>(
        `select id, name, status, due_date from projects
         where client_id = $1 and deleted_at is null order by name`,
        [id],
      ),
    ]);

  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const socials = (client.socials ?? {}) as Record<string, string | null>;

  return (
    <>
      <TrackView
        entityType="client"
        entityId={id}
        label={client.name}
        href={`/crm/clients/${id}`}
        companyId={client.company_id}
      />

      <PageHeader
        breadcrumbs={[
          { label: 'CRM', href: '/crm' },
          { label: 'Clients', href: '/crm' },
          { label: client.name },
        ]}
        title={client.name}
        description={client.goals ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={client.status} />
            <Badge tone="outline">{titleCase(client.stage)}</Badge>
            <HealthBadge score={client.health_score} />
            <Badge tone="outline">{client.company_name}</Badge>
            {client.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
            {client.archived_at ? <Badge tone="neutral">Archived</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <>
              <Button asChild variant="secondary">
                <Link href={`/crm/clients/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <ArchiveRecord
                label={client.name}
                archived={Boolean(client.archived_at)}
                action={async (payload) => {
                  'use server';
                  return archiveClientAction({ id, ...payload });
                }}
                description="Archiving hides the client from lists and removes it from the knowledge index. No records are deleted."
              />
            </>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeFinance ? (
          <>
            <StatCard
              label="Monthly retainer"
              value={client.monthly_retainer ? formatCurrency(client.monthly_retainer, client.currency) : '—'}
              hint={client.contract_value ? `${formatCurrency(client.contract_value, client.currency)} contract value` : undefined}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(client.outstanding, client.currency)}
              tone={client.outstanding > 0 ? 'warning' : 'success'}
              hint={`Billing: ${titleCase(client.billing_status)}`}
            />
          </>
        ) : null}
        <StatCard
          label="Open tasks"
          value={String(openTasks.length)}
          tone={client.overdue_tasks > 0 ? 'danger' : 'default'}
          hint={client.overdue_tasks ? `${client.overdue_tasks} overdue` : 'Nothing overdue'}
        />
        <StatCard
          label="Renewal"
          value={client.renewal_date ? fmtDate(client.renewal_date) : '—'}
          tone={client.renewal_date && isOverdue(client.renewal_date) ? 'warning' : 'default'}
          hint={client.contract_end ? `Contract ends ${fmtDate(client.contract_end)}` : undefined}
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="work">Work ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="meetings">Meetings ({meetings.length})</TabsTrigger>
          {canSeeFinance ? <TabsTrigger value="finance">Finance</TabsTrigger> : null}
          <TabsTrigger value="documents">Documents ({sidecars.documents.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Engagement</CardTitle>
                </CardHeader>
                <CardContent>
                  <DefinitionList
                    columns={2}
                    items={[
                      { label: 'Account owner', value: client.owner_name ?? 'Unassigned' },
                      { label: 'Organization', value: client.organization_name ?? '—' },
                      {
                        label: 'Services',
                        value: client.services.length ? (
                          <span className="flex flex-wrap gap-1">
                            {client.services.map((s) => (
                              <Badge key={s} tone="accent">{s}</Badge>
                            ))}
                          </span>
                        ) : '—',
                      },
                      { label: 'Contract', value: `${fmtDate(client.contract_start)} → ${fmtDate(client.contract_end)}` },
                      { label: 'Goals', value: client.goals ?? '—', span: true },
                      { label: 'Deliverables', value: client.deliverables ?? '—', span: true },
                      { label: 'KPIs', value: client.kpis ?? '—', span: true },
                      {
                        label: 'Risks',
                        value: client.risks ? (
                          <span className="text-[var(--danger)]">{client.risks}</span>
                        ) : 'None recorded',
                        span: true,
                      },
                      {
                        label: 'Next action',
                        value: client.next_action
                          ? `${client.next_action}${client.next_action_date ? ` — due ${fmtDate(client.next_action_date)}` : ''}`
                          : '—',
                        span: true,
                      },
                    ]}
                  />
                </CardContent>
              </Card>

              <CustomFieldsPanel
                target={{ entityType: 'client', entityId: id }}
                fields={sidecars.customFields}
                canWrite={canWrite}
              />

              <NotesPanel
                target={{ entityType: 'client', entityId: id }}
                notes={sidecars.notes}
                canWrite={canWrite && actor.can('knowledge:write', client.company_id)}
              />

              <CommentsPanel
                target={{ entityType: 'client', entityId: id }}
                comments={sidecars.comments}
                currentUserId={actor.user.id}
                canWrite={canWrite}
              />
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="tnum text-2xl font-semibold">{client.health_score}</span>
                      <HealthBadge score={client.health_score} />
                    </div>
                    <Progress
                      value={client.health_score}
                      tone={client.health_score >= 80 ? 'success' : client.health_score >= 60 ? 'gold' : 'danger'}
                    />
                  </div>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    Health is set by the account owner. It is not computed from activity, so it always
                    reflects a human judgement.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Links &amp; tags</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    {client.website ? (
                      <a
                        href={client.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
                      >
                        <Globe className="size-4" /> {client.website.replace(/^https?:\/\//, '')}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                    {socials.linkedin ? (
                      <a
                        href={socials.linkedin}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
                      >
                        <ExternalLink className="size-4" /> LinkedIn
                      </a>
                    ) : null}
                  </div>
                  <TagsPanel
                    target={{ entityType: 'client', entityId: id }}
                    tags={sidecars.tags}
                    available={sidecars.availableTags}
                    canWrite={canWrite}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="size-4 text-[var(--fg-subtle)]" /> Delivery team
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {team.length === 0 ? (
                    <p className="text-sm text-[var(--fg-muted)]">No one assigned yet.</p>
                  ) : (
                    team.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{m.name}</span>
                        <Badge tone="outline">{titleCase(m.role)}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <RemindersPanel
                target={{ entityType: 'client', entityId: id }}
                reminders={sidecars.reminders}
                canWrite={canWrite}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Contacts</CardTitle>
              {canWrite ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/crm/contacts/new?client=${id}&company=${client.company_slug}`}>
                    Add contact
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2">
              {contacts.length === 0 ? (
                <EmptyState
                  title="No contacts linked"
                  description="Add the people you actually work with at this client."
                  className="border-0"
                />
              ) : (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/crm/contacts/${c.id}`}
                        className="text-sm font-medium hover:text-[var(--accent)] hover:underline"
                      >
                        {c.full_name}
                      </Link>
                      <p className="text-xs text-[var(--fg-subtle)]">{c.title ?? '—'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                          <Mail className="size-3.5" /> {c.email}
                        </a>
                      ) : null}
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-[var(--fg-muted)]">
                          <Phone className="size-3.5" /> {c.phone}
                        </a>
                      ) : null}
                      {c.is_primary ? <Badge tone="accent">Primary</Badge> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CircleCheckBig className="size-4 text-[var(--fg-subtle)]" /> Tasks
                </CardTitle>
                {actor.can('task:write', client.company_id) ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/tasks/new?client=${id}&company=${client.company_slug}`}>New task</Link>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2">
                {tasks.length === 0 ? (
                  <EmptyState title="No tasks" description="Work assigned to this client shows up here." className="border-0" />
                ) : (
                  tasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        <span className="block text-xs text-[var(--fg-subtle)]">
                          {t.assignee_name ?? 'Unassigned'}
                          {t.due_at ? ` · due ${fmtDate(t.due_at)}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <PriorityBadge priority={t.priority} />
                        <StatusBadge status={isOverdue(t.due_at, t.completed_at) ? 'overdue' : t.status} />
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Projects</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {projects.length === 0 ? (
                  <p className="text-sm text-[var(--fg-muted)]">No projects.</p>
                ) : (
                  projects.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="meetings">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-[var(--fg-subtle)]" /> Meetings
                </CardTitle>
                {actor.can('calendar:write', client.company_id) ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/calendar/new?client=${id}&company=${client.company_slug}`}>New meeting</Link>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2">
                {meetings.length === 0 ? (
                  <EmptyState title="No meetings" className="border-0" />
                ) : (
                  meetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/calendar/${m.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.title}</span>
                        <span className="block text-xs text-[var(--fg-subtle)]">{fmtDateTime(m.starts_at)}</span>
                      </span>
                      <StatusBadge status={m.status} />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <OutreachPanel
              target={{ entityType: 'client', entityId: id }}
              entries={outreach}
              canWrite={canWrite}
              title="Communication history"
            />
          </div>
        </TabsContent>

        {canSeeFinance ? (
          <TabsContent value="finance">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="size-4 text-[var(--fg-subtle)]" /> Invoices
                  </CardTitle>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/finances?tab=invoices&company=${client.company_slug}`}>All</Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {finance.invoices.length === 0 ? (
                    <EmptyState title="No invoices" className="border-0" />
                  ) : (
                    finance.invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{inv.number}</p>
                          <p className="text-xs text-[var(--fg-subtle)]">
                            Issued {fmtDate(inv.issue_date)}
                            {inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tnum text-sm font-medium">
                            {formatCurrency(inv.total, inv.currency)}
                          </span>
                          <StatusBadge status={inv.status} />
                          <SourceBadge source={inv.source} isDemo={inv.is_demo} />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {finance.payments.length === 0 ? (
                    <EmptyState title="No payments" className="border-0" />
                  ) : (
                    finance.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{p.description ?? titleCase(p.method ?? 'Payment')}</p>
                          <p className="text-xs text-[var(--fg-subtle)]">{fmtDate(p.occurred_at)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tnum text-sm font-medium">{formatCurrency(p.amount, p.currency)}</span>
                          <StatusBadge status={p.status} />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}

        <TabsContent value="documents">
          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=client&id=${id}&company=${client.company_slug}`}
            canWrite={actor.can('knowledge:write', client.company_id)}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Record activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityTimeline entries={activity} />
              </CardContent>
            </Card>
            <OutreachPanel
              target={{ entityType: 'client', entityId: id }}
              entries={outreach}
              canWrite={canWrite}
            />
          </div>
          <p className="mt-4 text-xs text-[var(--fg-subtle)]">
            Created {fmtRelative(client.created_at)}.
          </p>
        </TabsContent>
      </Tabs>
    </>
  );
}
