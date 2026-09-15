import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Mail, MapPin, Pencil, Phone } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getPartnership, getPartnershipContacts } from '@/lib/queries/growth';
import { getRecordSidecars, getOutreach } from '@/lib/queries/records';
import { listActivity } from '@/lib/activity';
import { fmtDate, fmtRelative } from '@/lib/dates';
import { formatCurrency, formatNumber, titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList } from '@/components/ui/page';
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
import { ArchiveRecord } from '@/components/record/archive-record';
import { archivePartnershipAction } from '@/server/actions/growth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPartnership(id);
  return { title: p?.name ?? 'Partnership' };
}

export default async function PartnershipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const partnership = await getPartnership(id);
  if (!partnership) notFound();
  if (!actor.canReadCompany(partnership.company_id) || !actor.can('partnership:read', partnership.company_id)) {
    return <ForbiddenState permission="partnership:read" backHref="/partnerships" />;
  }
  const canWrite = actor.can('partnership:write', partnership.company_id);

  const [contacts, sidecars, outreach, activity] = await Promise.all([
    getPartnershipContacts(id),
    getRecordSidecars('partnership', id, partnership.company_id),
    getOutreach('partnership', id),
    listActivity({ entityType: 'partnership', entityId: id, limit: 30 }),
  ]);

  const performance = Object.entries(partnership.performance ?? {});

  return (
    <>
      <TrackView entityType="partnership" entityId={id} label={partnership.name} href={`/partnerships/${id}`} companyId={partnership.company_id} />
      <PageHeader
        breadcrumbs={[{ label: 'Partnerships', href: '/partnerships' }, { label: partnership.name }]}
        title={partnership.name}
        description={partnership.notes ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={partnership.stage} />
            <Badge tone="outline">{titleCase(partnership.category)}</Badge>
            <Badge tone="outline">{partnership.company_name}</Badge>
            {partnership.contract_status !== 'none' ? (
              <StatusBadge status={partnership.contract_status} />
            ) : null}
            {partnership.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <>
              <Button asChild variant="secondary">
                <Link href={`/partnerships/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <ArchiveRecord
                label={partnership.name}
                archived={false}
                action={async (payload) => {
                  'use server';
                  return archivePartnershipAction({ id, ...payload });
                }}
              />
            </>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Estimated value"
          value={formatCurrency(partnership.estimated_value, partnership.currency)}
          hint={`${formatCurrency((partnership.estimated_value * partnership.probability) / 100, partnership.currency)} weighted`}
        />
        <StatCard label="Probability" value={`${partnership.probability}%`} />
        <StatCard
          label="Launch"
          value={partnership.launch_date ? fmtDate(partnership.launch_date) : 'Not set'}
          hint={partnership.pilot_location ?? undefined}
        />
        <StatCard
          label="Last interaction"
          value={fmtRelative(partnership.last_interaction_at)}
          hint={partnership.next_action ?? 'No next action set'}
          tone={partnership.next_action ? 'default' : 'warning'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Agreement</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={2}
                items={[
                  { label: 'Organization', value: partnership.organization_name ?? '—' },
                  { label: 'Owner', value: partnership.owner_name ?? 'Unassigned' },
                  { label: 'Revenue share', value: partnership.revenue_share ?? '—', span: true },
                  {
                    label: 'Pilot location',
                    value: partnership.pilot_location ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" /> {partnership.pilot_location}
                      </span>
                    ) : '—',
                  },
                  { label: 'Contract status', value: <StatusBadge status={partnership.contract_status} /> },
                  { label: 'Equipment', value: partnership.equipment_requirements ?? '—', span: true },
                  {
                    label: 'Next action',
                    value: partnership.next_action
                      ? `${partnership.next_action}${partnership.next_action_date ? ` — ${fmtDate(partnership.next_action_date)}` : ''}`
                      : '—',
                    span: true,
                  },
                ]}
              />
            </CardContent>
          </Card>

          {performance.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Performance</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {performance.map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">
                      {titleCase(key)}
                    </p>
                    <p className="tnum text-lg font-semibold">
                      {typeof value === 'number' && key.includes('gmv')
                        ? formatCurrency(value)
                        : typeof value === 'number' && key.includes('pct')
                          ? `${value}%`
                          : formatNumber(Number(value))}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <CustomFieldsPanel
            target={{ entityType: 'partnership', entityId: id }}
            fields={sidecars.customFields}
            canWrite={canWrite}
          />

          <OutreachPanel
            target={{ entityType: 'partnership', entityId: id }}
            entries={outreach}
            canWrite={canWrite}
          />

          <NotesPanel
            target={{ entityType: 'partnership', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', partnership.company_id)}
          />
          <CommentsPanel
            target={{ entityType: 'partnership', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={partnership.probability} tone={partnership.probability >= 70 ? 'success' : 'accent'} />
              <p className="text-xs text-[var(--fg-subtle)]">
                {titleCase(partnership.stage)} · {partnership.probability}% likely to close
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key contacts</CardTitle>
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
                      {c.phone ? (
                        <span className="flex items-center gap-1 text-[var(--fg-muted)]">
                          <Phone className="size-3" /> {c.phone}
                        </span>
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
                target={{ entityType: 'partnership', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          <RemindersPanel
            target={{ entityType: 'partnership', entityId: id }}
            reminders={sidecars.reminders}
            canWrite={canWrite}
          />

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=partnership&id=${id}&company=${partnership.company_slug}`}
            canWrite={actor.can('knowledge:write', partnership.company_id)}
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
