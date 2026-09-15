import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Mail, Pencil, Phone } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getMember, getMemberAssignments, getContractorInvoices } from '@/lib/queries/team';
import { getRecordSidecars } from '@/lib/queries/records';
import { listActivity } from '@/lib/activity';
import { fmtDate } from '@/lib/dates';
import { formatCurrency, titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList, SourceNote } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, Progress } from '@/components/ui/misc';
import { SourceBadge, StatusBadge } from '@/components/ui/status';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import {
  ActivityTimeline, AttachmentsPanel, CommentsPanel, NotesPanel,
} from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';

export const dynamic = 'force-dynamic';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();

  // Resolve the company before deciding whether compensation may be read.
  const probe = await getMember(id, false);
  if (!probe) notFound();
  if (!actor.canReadCompany(probe.company_id) || !actor.can('team:read', probe.company_id)) {
    return <ForbiddenState permission="team:read" backHref="/team" />;
  }
  const canSeePay = actor.can('team:compensation_read', probe.company_id);
  const member = canSeePay ? await getMember(id, true) : probe;
  if (!member) notFound();

  const canWrite = actor.can('team:write', member.company_id);

  const [assignments, invoices, sidecars, activity] = await Promise.all([
    getMemberAssignments(id),
    canSeePay ? getContractorInvoices({ companyIds: [member.company_id], memberId: id }) : Promise.resolve([]),
    getRecordSidecars('member', id, member.company_id),
    listActivity({ entityType: 'member', entityId: id, limit: 25 }),
  ]);

  const companySlug = actor.companies.find((c) => c.id === member.company_id)?.slug ?? '';

  return (
    <>
      <TrackView entityType="member" entityId={id} label={member.full_name} href={`/team/${id}`} companyId={member.company_id} />
      <PageHeader
        breadcrumbs={[{ label: 'Team', href: '/team' }, { label: member.full_name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={member.full_name} size={36} />
            {member.full_name}
          </span>
        }
        description={member.role_description ?? member.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={member.status} />
            <Badge tone="outline">{titleCase(member.kind)}</Badge>
            <Badge tone="outline">{member.company_name}</Badge>
            {member.is_vacant ? <Badge tone="warning">Open role</Badge> : null}
            {member.external_source ? (
              <Badge tone="accent">Synced from {titleCase(member.external_source)}</Badge>
            ) : null}
            {member.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <Button asChild variant="secondary">
              <Link href={`/team/${id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={2}
                items={[
                  { label: 'Title', value: member.title },
                  { label: 'Department', value: member.department_name ?? '—' },
                  { label: 'Reports to', value: member.manager_name ?? '—' },
                  { label: 'Employment', value: titleCase(member.employment_type) },
                  {
                    label: 'Email',
                    value: member.email ? (
                      <a href={`mailto:${member.email}`} className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        <Mail className="size-3.5" /> {member.email}
                      </a>
                    ) : '—',
                  },
                  {
                    label: 'Phone',
                    value: member.phone ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3.5" /> {member.phone}
                      </span>
                    ) : '—',
                  },
                  { label: 'Started', value: fmtDate(member.start_date) },
                  { label: 'Ends', value: member.end_date ? fmtDate(member.end_date) : '—' },
                  { label: 'Location', value: member.location ?? '—' },
                  {
                    label: 'Skills',
                    value: member.skills.length ? (
                      <span className="flex flex-wrap gap-1">
                        {member.skills.map((s) => (
                          <Badge key={s} tone="neutral">{s}</Badge>
                        ))}
                      </span>
                    ) : '—',
                    span: true,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Client assignments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {assignments.length === 0 ? (
                <EmptyState title="Not assigned to any client" className="border-0 py-6" />
              ) : (
                assignments.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5">
                    <div className="min-w-0">
                      {a.client_id ? (
                        <Link href={`/crm/clients/${a.client_id}`} className="text-sm font-medium hover:underline">
                          {a.client_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium">{a.project_name ?? 'Internal'}</span>
                      )}
                      <p className="text-xs text-[var(--fg-subtle)]">
                        {titleCase(a.role)}
                        {a.start_date ? ` · since ${fmtDate(a.start_date)}` : ''}
                      </p>
                    </div>
                    <Badge tone="accent">{a.allocation_pct}%</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {canSeePay ? (
            <Card>
              <CardHeader>
                <CardTitle>Contractor invoices</CardTitle>
                <SourceNote source="Recorded here, imported from CSV, or synced from Gusto." />
              </CardHeader>
              <CardContent className="space-y-2">
                {invoices.length === 0 ? (
                  <EmptyState title="No invoices" className="border-0 py-6" />
                ) : (
                  invoices.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{inv.number ?? 'Invoice'}</p>
                        <p className="text-xs text-[var(--fg-subtle)]">
                          {inv.period_start && inv.period_end
                            ? `${fmtDate(inv.period_start, 'MMM d')} – ${fmtDate(inv.period_end, 'MMM d')}`
                            : ''}
                          {inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tnum text-sm font-medium">{formatCurrency(inv.amount, inv.currency)}</span>
                        <StatusBadge status={inv.status} />
                        <SourceBadge source={inv.source} isDemo={inv.is_demo} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          <NotesPanel
            target={{ entityType: 'member', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', member.company_id)}
          />
          <CommentsPanel
            target={{ entityType: 'member', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Capacity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="tnum text-2xl font-semibold">{member.allocated_pct}%</span>
                  <span className="text-sm text-[var(--fg-muted)]">of {member.capacity_hours}h/week</span>
                </div>
                <Progress
                  value={Math.min(member.allocated_pct, 100)}
                  tone={member.allocated_pct > 100 ? 'danger' : member.allocated_pct > 85 ? 'warning' : 'accent'}
                />
              </div>
              <p className="text-xs text-[var(--fg-subtle)]">
                Allocation is the sum of client assignment percentages — a planning figure, not
                tracked time.
              </p>
            </CardContent>
          </Card>

          {canSeePay ? (
            <Card>
              <CardHeader>
                <CardTitle>Compensation</CardTitle>
              </CardHeader>
              <CardContent>
                <DefinitionList
                  columns={1}
                  items={[
                    {
                      label: 'Pay rate',
                      value: member.pay_rate
                        ? `${formatCurrency(member.pay_rate, member.currency)} / ${member.pay_rate_unit}`
                        : '—',
                    },
                    { label: 'Schedule', value: member.pay_schedule ? titleCase(member.pay_schedule) : '—' },
                    { label: 'Unpaid invoices', value: formatCurrency(member.unpaid_amount, member.currency) },
                  ]}
                />
                <SourceNote
                  className="mt-3"
                  source="Visible to Finance, Company Admins and the Holdings Owner only. Changes are audited. Bank details and tax identifiers are never stored here."
                />
              </CardContent>
            </Card>
          ) : null}

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=member&id=${id}&company=${companySlug}`}
            canWrite={actor.can('knowledge:write', member.company_id)}
          />

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
