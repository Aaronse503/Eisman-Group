import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Mail, Pencil } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getInvestor, getInvestorContacts } from '@/lib/queries/growth';
import { getRecordSidecars, getOutreach } from '@/lib/queries/records';
import { listActivity } from '@/lib/activity';
import { fmtDate, fmtDateTime, fmtRelative, isOverdue } from '@/lib/dates';
import { formatCurrency, titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList, SourceNote } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat-card';
import {
  ActivityTimeline, AttachmentsPanel, CommentsPanel, CustomFieldsPanel,
  NotesPanel, OutreachPanel, RemindersPanel, TagsPanel,
} from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';
import { INVESTOR_TYPE_LABELS } from '@/lib/domain/growth';
import { FollowUpScheduler } from './follow-up';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investor = await getInvestor(id);
  return { title: investor?.name ?? 'Investor' };
}

export default async function InvestorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const investor = await getInvestor(id);
  if (!investor) notFound();

  const companyId = investor.pitching_company_id ?? investor.company_id;
  if (!companyId || !actor.canReadCompany(companyId) || !actor.can('investor:read', companyId)) {
    return <ForbiddenState permission="investor:read" backHref="/investors" />;
  }
  const canWrite = actor.can('investor:write', companyId);
  const companySlug = actor.companies.find((c) => c.id === companyId)?.slug ?? '';

  const [contacts, sidecars, outreach, activity] = await Promise.all([
    getInvestorContacts(id),
    getRecordSidecars('investor', id, companyId),
    getOutreach('investor', id),
    listActivity({ entityType: 'investor', entityId: id, limit: 30 }),
  ]);

  const weighted = (Number(investor.potential_amount) * investor.probability) / 100;

  return (
    <>
      <TrackView entityType="investor" entityId={id} label={investor.name} href={`/investors/${id}`} companyId={companyId} />
      <PageHeader
        breadcrumbs={[{ label: 'Investors', href: '/investors' }, { label: investor.name }]}
        title={investor.name}
        description={investor.notes ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={investor.pipeline_stage} />
            <Badge tone="outline">{INVESTOR_TYPE_LABELS[investor.investor_type] ?? investor.investor_type}</Badge>
            <Badge tone="outline">Raising for {investor.pitching_company_name}</Badge>
            {investor.data_room_access ? <Badge tone="warning">Data room granted</Badge> : null}
            {investor.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <Button asChild variant="secondary">
              <Link href={`/investors/${id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Potential investment"
          value={formatCurrency(investor.potential_amount, investor.currency, { compact: true })}
          hint={`${formatCurrency(weighted, investor.currency, { compact: true })} weighted at ${investor.probability}%`}
        />
        <StatCard
          label="Check size"
          value={
            investor.check_size_min || investor.check_size_max
              ? `${formatCurrency(investor.check_size_min ?? 0, investor.currency, { compact: true })}–${formatCurrency(investor.check_size_max ?? 0, investor.currency, { compact: true })}`
              : 'Unknown'
          }
        />
        <StatCard label="Last contact" value={fmtRelative(investor.last_contact_at)} hint={`${investor.interaction_count} interactions logged`} />
        <StatCard
          label="Next follow-up"
          value={investor.next_follow_up_at ? fmtDate(investor.next_follow_up_at) : 'Not scheduled'}
          tone={
            investor.next_follow_up_at && isOverdue(investor.next_follow_up_at)
              ? 'danger'
              : investor.next_follow_up_at
                ? 'default'
                : 'warning'
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Fit</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={2}
                items={[
                  {
                    label: 'Website',
                    value: investor.website ? (
                      <a href={investor.website} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        {investor.website.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" />
                      </a>
                    ) : '—',
                  },
                  { label: 'Geography', value: investor.geography ?? '—' },
                  {
                    label: 'Stage preference',
                    value: investor.stage_preferences.length ? (
                      <span className="flex flex-wrap gap-1">
                        {investor.stage_preferences.map((s) => (
                          <Badge key={s} tone="neutral">{titleCase(s)}</Badge>
                        ))}
                      </span>
                    ) : '—',
                  },
                  {
                    label: 'Industry focus',
                    value: investor.industry_focus.length ? investor.industry_focus.join(', ') : '—',
                  },
                  {
                    label: 'Relevant portfolio',
                    value: investor.portfolio_companies.length ? investor.portfolio_companies.join(', ') : '—',
                    span: true,
                  },
                  { label: 'Warm intro via', value: investor.warm_intro_source ?? 'No warm path identified' },
                  { label: 'Relationship owner', value: investor.owner_name ?? 'Unassigned' },
                  { label: 'Objections', value: investor.objections ?? 'None recorded', span: true },
                  { label: 'Requested materials', value: investor.requested_materials ?? '—', span: true },
                  {
                    label: 'First meeting',
                    value: investor.first_meeting_at ? fmtDateTime(investor.first_meeting_at) : 'Not yet',
                  },
                  { label: 'Interest level', value: titleCase(investor.interest_level) },
                ]}
              />
            </CardContent>
          </Card>

          <CustomFieldsPanel
            target={{ entityType: 'investor', entityId: id }}
            fields={sidecars.customFields}
            canWrite={canWrite}
          />

          <OutreachPanel
            target={{ entityType: 'investor', entityId: id }}
            entries={outreach}
            canWrite={canWrite}
          />

          <NotesPanel
            target={{ entityType: 'investor', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', companyId)}
          />
          <CommentsPanel
            target={{ entityType: 'investor', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium">{titleCase(investor.pipeline_stage)}</span>
                  <span className="tnum text-sm text-[var(--fg-muted)]">{investor.probability}%</span>
                </div>
                <Progress value={investor.probability} tone={investor.probability >= 70 ? 'success' : 'accent'} />
              </div>
              <SourceNote source="Probability defaults to the stage and can be overridden per investor." />
              {canWrite ? <FollowUpScheduler investorId={id} current={investor.next_follow_up_at} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {contacts.length === 0 ? (
                <EmptyState title="No contacts linked" className="border-0 py-6" />
              ) : (
                contacts.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--border)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/crm/contacts/${c.id}`} className="truncate text-sm font-medium hover:underline">
                        {c.full_name}
                      </Link>
                      {c.is_primary ? <Badge tone="accent">Primary</Badge> : null}
                    </div>
                    <p className="text-xs text-[var(--fg-subtle)]">{c.title ?? '—'}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                          <Mail className="size-3" /> {c.email}
                        </a>
                      ) : null}
                      {c.linkedin_url ? (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                          LinkedIn <ExternalLink className="size-2.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagsPanel
                target={{ entityType: 'investor', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          <RemindersPanel
            target={{ entityType: 'investor', entityId: id }}
            reminders={sidecars.reminders}
            canWrite={canWrite}
          />

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=investor&id=${id}&company=${companySlug}`}
            canWrite={actor.can('knowledge:write', companyId)}
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
