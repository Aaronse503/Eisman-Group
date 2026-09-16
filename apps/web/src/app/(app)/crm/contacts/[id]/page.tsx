import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Mail, Pencil, Phone } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { sql } from '@/lib/db/client';
import { getContact } from '@/lib/queries/crm';
import { getRecordSidecars, getOutreach } from '@/lib/queries/records';
import { listActivity } from '@/lib/activity';
import { fmtDateTime, fmtRelative } from '@/lib/dates';
import { titleCase } from '@/lib/utils';
import { PageHeader, DefinitionList } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import {
  ActivityTimeline, AttachmentsPanel, CommentsPanel, CustomFieldsPanel,
  NotesPanel, OutreachPanel, TagsPanel,
} from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  return { title: contact?.full_name ?? 'Contact' };
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const contact = await getContact(id);
  if (!contact) notFound();
  if (!actor.canReadCompany(contact.company_id) || !actor.can('crm:read', contact.company_id)) {
    return <ForbiddenState permission="crm:read" backHref="/crm/contacts" />;
  }
  const canWrite = actor.can('crm:write', contact.company_id);

  const [sidecars, outreach, activity, clients, meetings, investors, partnerships] = await Promise.all([
    getRecordSidecars('contact', id, contact.company_id),
    getOutreach('contact', id),
    listActivity({ entityType: 'contact', entityId: id, limit: 30 }),
    sql<{ id: string; name: string; status: string; is_primary: boolean }>(
      `select c.id, c.name, c.status, cc.is_primary from client_contacts cc
       join clients c on c.id = cc.client_id
       where cc.contact_id = $1 and c.deleted_at is null`,
      [id],
    ),
    sql<{ id: string; title: string; starts_at: Date; status: string }>(
      `select m.id, m.title, m.starts_at, m.status from meeting_participants mp
       join meetings m on m.id = mp.meeting_id
       where mp.contact_id = $1 and m.deleted_at is null
       order by m.starts_at desc limit 15`,
      [id],
    ),
    sql<{ id: string; name: string; pipeline_stage: string }>(
      `select i.id, i.name, i.pipeline_stage from investor_contacts ic
       join investors i on i.id = ic.investor_id
       where ic.contact_id = $1 and i.deleted_at is null`,
      [id],
    ),
    sql<{ id: string; name: string; stage: string }>(
      `select p.id, p.name, p.stage from partnership_contacts pc
       join partnerships p on p.id = pc.partnership_id
       where pc.contact_id = $1 and p.deleted_at is null`,
      [id],
    ),
  ]);

  const canSeeInvestors = actor.can('investor:read', contact.company_id);

  return (
    <>
      <TrackView
        entityType="contact"
        entityId={id}
        label={contact.full_name}
        href={`/crm/contacts/${id}`}
        companyId={contact.company_id}
      />

      <PageHeader
        breadcrumbs={[
          { label: 'CRM', href: '/crm' },
          { label: 'Contacts', href: '/crm/contacts' },
          { label: contact.full_name },
        ]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={contact.full_name} size={36} />
            {contact.full_name}
          </span>
        }
        description={[contact.title, contact.organization_name].filter(Boolean).join(' · ') || undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={contact.status} />
            {contact.roles.map((r) => (
              <Badge key={r} tone="accent">{titleCase(r)}</Badge>
            ))}
            <Badge tone="outline">{contact.company_name}</Badge>
            {contact.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          canWrite ? (
            <Button asChild variant="secondary">
              <Link href={`/crm/contacts/${id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={2}
                items={[
                  {
                    label: 'Email',
                    value: contact.email ? (
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        <Mail className="size-3.5" /> {contact.email}
                      </a>
                    ) : '—',
                  },
                  {
                    label: 'Phone',
                    value: contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5">
                        <Phone className="size-3.5" /> {contact.phone}
                      </a>
                    ) : '—',
                  },
                  { label: 'Secondary email', value: contact.secondary_email ?? '—' },
                  {
                    label: 'LinkedIn',
                    value: contact.linkedin_url ? (
                      <a href={contact.linkedin_url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        Profile <ExternalLink className="size-3" />
                      </a>
                    ) : '—',
                  },
                  { label: 'Location', value: [contact.city, contact.country].filter(Boolean).join(', ') || '—' },
                  { label: 'Owner', value: contact.owner_name ?? 'Unassigned' },
                  { label: 'Notes', value: contact.description ?? '—', span: true },
                ]}
              />
            </CardContent>
          </Card>

          <CustomFieldsPanel
            target={{ entityType: 'contact', entityId: id }}
            fields={sidecars.customFields}
            canWrite={canWrite}
          />

          <OutreachPanel
            target={{ entityType: 'contact', entityId: id }}
            entries={outreach}
            canWrite={canWrite}
          />

          <NotesPanel
            target={{ entityType: 'contact', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', contact.company_id)}
          />

          <CommentsPanel
            target={{ entityType: 'contact', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagsPanel
                target={{ entityType: 'contact', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relationships</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {clients.length === 0 && partnerships.length === 0 && (!canSeeInvestors || investors.length === 0) ? (
                <EmptyState
                  title="No linked records"
                  description="Link this person to a client, partnership or investor."
                  className="border-0 py-6"
                />
              ) : null}
              {clients.length ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-[var(--fg-subtle)] uppercase">Clients</p>
                  {clients.map((c) => (
                    <Link key={c.id} href={`/crm/clients/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
                      <span className="truncate">{c.name}</span>
                      {c.is_primary ? <Badge tone="accent">Primary</Badge> : <StatusBadge status={c.status} />}
                    </Link>
                  ))}
                </div>
              ) : null}
              {partnerships.length ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-[var(--fg-subtle)] uppercase">Partnerships</p>
                  {partnerships.map((p) => (
                    <Link key={p.id} href={`/partnerships/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
                      <span className="truncate">{p.name}</span>
                      <StatusBadge status={p.stage} />
                    </Link>
                  ))}
                </div>
              ) : null}
              {canSeeInvestors && investors.length ? (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-[var(--fg-subtle)] uppercase">Investors</p>
                  {investors.map((i) => (
                    <Link key={i.id} href={`/investors/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
                      <span className="truncate">{i.name}</span>
                      <StatusBadge status={i.pipeline_stage} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meetings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {meetings.length === 0 ? (
                <p className="text-sm text-[var(--fg-muted)]">No meetings recorded.</p>
              ) : (
                meetings.map((m) => (
                  <Link key={m.id} href={`/calendar/${m.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-[var(--surface-sunken)]">
                    <span className="block truncate text-sm">{m.title}</span>
                    <span className="block text-xs text-[var(--fg-subtle)]">{fmtDateTime(m.starts_at)}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=contact&id=${id}&company=${contact.company_slug}`}
            canWrite={actor.can('knowledge:write', contact.company_id)}
          />

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
              <p className="mt-3 text-xs text-[var(--fg-subtle)]">
                Added {fmtRelative(contact.created_at)}.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
