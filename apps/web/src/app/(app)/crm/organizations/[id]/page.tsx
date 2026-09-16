import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { sql, one } from '@/lib/db/client';
import { getRecordSidecars } from '@/lib/queries/records';
import { listActivity } from '@/lib/activity';
import { titleCase } from '@/lib/utils';
import { fmtRelative } from '@/lib/dates';
import { PageHeader, DefinitionList } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import { ActivityTimeline, AttachmentsPanel, CommentsPanel, NotesPanel, TagsPanel } from '@/components/record/panels';
import { TrackView } from '@/components/record/track-view';

export const dynamic = 'force-dynamic';

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const org = await one<{
    id: string; company_id: string; company_name: string; company_slug: string; name: string;
    legal_name: string | null; domain: string | null; website: string | null; industry: string | null;
    size_band: string | null; description: string | null; city: string | null; region: string | null;
    country: string | null; status: string; owner_name: string | null; is_demo: boolean;
    created_at: Date; roles: string[];
  }>(
    `select o.*, co.name as company_name, co.slug as company_slug, u.name as owner_name,
            coalesce((select array_agg(r.role order by r.role) from organization_roles r
                      where r.organization_id = o.id), '{}') as roles
     from organizations o
     join companies co on co.id = o.company_id
     left join users u on u.id = o.owner_user_id
     where o.id = $1 and o.deleted_at is null`,
    [id],
  );
  if (!org) notFound();
  if (!actor.canReadCompany(org.company_id) || !actor.can('crm:read', org.company_id)) {
    return <ForbiddenState permission="crm:read" backHref="/crm/organizations" />;
  }
  const canWrite = actor.can('crm:write', org.company_id);

  const [contacts, clients, partnerships, sidecars, activity] = await Promise.all([
    sql<{ id: string; full_name: string; title: string | null; email: string | null }>(
      `select id, trim(first_name || ' ' || coalesce(last_name,'')) as full_name, title, email
       from contacts where organization_id = $1 and deleted_at is null order by first_name`,
      [id],
    ),
    sql<{ id: string; name: string; status: string }>(
      `select id, name, status from clients where organization_id = $1 and deleted_at is null`,
      [id],
    ),
    sql<{ id: string; name: string; stage: string }>(
      `select id, name, stage from partnerships where organization_id = $1 and deleted_at is null`,
      [id],
    ),
    getRecordSidecars('organization', id, org.company_id),
    listActivity({ entityType: 'organization', entityId: id, limit: 25 }),
  ]);

  return (
    <>
      <TrackView entityType="organization" entityId={id} label={org.name} href={`/crm/organizations/${id}`} companyId={org.company_id} />
      <PageHeader
        breadcrumbs={[
          { label: 'CRM', href: '/crm' },
          { label: 'Organizations', href: '/crm/organizations' },
          { label: org.name },
        ]}
        title={org.name}
        description={org.description ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={org.status} />
            {org.roles.map((r) => (
              <Badge key={r} tone="accent">{titleCase(r)}</Badge>
            ))}
            <Badge tone="outline">{org.company_name}</Badge>
            {org.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <DefinitionList
                columns={2}
                items={[
                  { label: 'Legal name', value: org.legal_name ?? '—' },
                  { label: 'Industry', value: org.industry ?? '—' },
                  { label: 'Size', value: org.size_band ? `${org.size_band} people` : '—' },
                  {
                    label: 'Website',
                    value: org.website ? (
                      <a href={org.website} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[var(--accent)] hover:underline">
                        {org.website.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" />
                      </a>
                    ) : '—',
                  },
                  { label: 'Location', value: [org.city, org.region, org.country].filter(Boolean).join(', ') || '—' },
                  { label: 'Owner', value: org.owner_name ?? 'Unassigned' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contacts ({contacts.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {contacts.length === 0 ? (
                <EmptyState title="No contacts" description="People at this organization appear here." className="border-0 py-6" />
              ) : (
                contacts.map((c) => (
                  <Link key={c.id} href={`/crm/contacts/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2.5 hover:bg-[var(--surface-sunken)]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.full_name}</span>
                      <span className="block truncate text-xs text-[var(--fg-subtle)]">{c.title ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-[var(--fg-subtle)]">{c.email ?? ''}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <NotesPanel
            target={{ entityType: 'organization', entityId: id }}
            notes={sidecars.notes}
            canWrite={canWrite && actor.can('knowledge:write', org.company_id)}
          />
          <CommentsPanel
            target={{ entityType: 'organization', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
            <CardContent>
              <TagsPanel
                target={{ entityType: 'organization', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          {clients.length || partnerships.length ? (
            <Card>
              <CardHeader><CardTitle>Linked records</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {clients.map((c) => (
                  <Link key={c.id} href={`/crm/clients/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
                    <span className="truncate">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
                {partnerships.map((p) => (
                  <Link key={p.id} href={`/partnerships/${p.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
                    <span className="truncate">{p.name}</span>
                    <StatusBadge status={p.stage} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <AttachmentsPanel
            documents={sidecars.documents}
            uploadHref={`/knowledge/upload?entity=organization&id=${id}&company=${org.company_slug}`}
            canWrite={actor.can('knowledge:write', org.company_id)}
          />

          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
              <p className="mt-3 text-xs text-[var(--fg-subtle)]">Added {fmtRelative(org.created_at)}.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
