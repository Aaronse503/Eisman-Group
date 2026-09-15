import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Download, FileText, TriangleAlert, Users } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import {
  allowedAccessLevels, getDocument, getDocumentLinks, getDocumentVersions, getRelatedDocuments,
} from '@/lib/queries/knowledge';
import { listActivity } from '@/lib/activity';
import { fmtDateTime, fmtRelative } from '@/lib/dates';
import { formatNumber, titleCase, truncate } from '@/lib/utils';
import { PageHeader, DefinitionList, SourceNote } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ForbiddenState, EmptyState } from '@/components/ui/states';
import { ActivityTimeline, CommentsPanel, TagsPanel } from '@/components/record/panels';
import { getRecordSidecars } from '@/lib/queries/records';
import { TrackView } from '@/components/record/track-view';
import { DocumentActions } from './document-actions';

export const dynamic = 'force-dynamic';

const ENTITY_HREF: Record<string, (id: string) => string> = {
  client: (id) => `/crm/clients/${id}`,
  contact: (id) => `/crm/contacts/${id}`,
  organization: (id) => `/crm/organizations/${id}`,
  partnership: (id) => `/partnerships/${id}`,
  investor: (id) => `/investors/${id}`,
  task: (id) => `/tasks/${id}`,
  meeting: (id) => `/calendar/${id}`,
  member: (id) => `/team/${id}`,
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(id);
  return { title: doc?.name ?? 'Document' };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const doc = await getDocument(id);
  if (!doc) notFound();
  if (!actor.canReadCompany(doc.company_id) || !actor.can('knowledge:read', doc.company_id)) {
    return <ForbiddenState permission="knowledge:read" backHref="/knowledge" />;
  }

  const levels = allowedAccessLevels({
    restricted: actor.can('knowledge:restricted_read', doc.company_id),
    finance: actor.can('finance:read', doc.company_id),
    investor: actor.can('investor:read', doc.company_id),
    hr: actor.can('team:compensation_read', doc.company_id),
  });
  if (!levels.includes(doc.access_level)) {
    return <ForbiddenState permission="knowledge:restricted_read" backHref="/knowledge" />;
  }

  const canWrite = actor.can('knowledge:write', doc.company_id);
  const [versions, links, related, sidecars, activity] = await Promise.all([
    getDocumentVersions(doc.version_group),
    getDocumentLinks(id),
    getRelatedDocuments(id, doc.company_id),
    getRecordSidecars('document', id, doc.company_id),
    listActivity({ entityType: 'document', entityId: id, limit: 20 }),
  ]);

  return (
    <>
      <TrackView entityType="document" entityId={id} label={doc.name} href={`/knowledge/documents/${id}`} companyId={doc.company_id} />
      <PageHeader
        breadcrumbs={[
          { label: 'Knowledge Hub', href: '/knowledge' },
          ...(doc.folder_name ? [{ label: doc.folder_name, href: `/knowledge?folder=${doc.folder_id}` }] : []),
          { label: doc.name },
        ]}
        title={doc.name}
        description={doc.description ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">{doc.company_name}</Badge>
            <Badge tone={doc.access_level === 'restricted' ? 'danger' : doc.access_level === 'company' ? 'neutral' : 'warning'}>
              {titleCase(doc.access_level)} access
            </Badge>
            <Badge tone="outline">v{doc.version}</Badge>
            {doc.page_count ? <Badge tone="neutral">{doc.page_count} pages</Badge> : null}
            {doc.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={`/api/documents/${id}/download`}>
                <Download /> Download
              </a>
            </Button>
            {canWrite ? <DocumentActions documentId={id} name={doc.name} canReindex={doc.text_status === 'extracted'} /> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {doc.text_status !== 'extracted' ? (
            <Card className="border-[var(--warning)]/40">
              <CardContent className="flex items-start gap-3 py-4">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--warning)]" />
                <div>
                  <p className="text-sm font-medium">This document is not searchable</p>
                  <p className="text-sm text-[var(--fg-muted)]">
                    {doc.text_error ??
                      'No text could be read from this file, so it cannot be summarised or cited by the assistant. It is still stored and downloadable.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {doc.summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <SourceNote
                  source={
                    doc.ai_provider === 'anthropic'
                      ? `Generated by Anthropic (${doc.ai_model}) from this document only`
                      : 'Extracted verbatim from this document — sentences are quoted, not generated'
                  }
                  updatedAt={doc.ai_generated_at ? fmtRelative(doc.ai_generated_at) : null}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">{doc.summary}</p>

                {doc.key_points?.length ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                      Key points
                    </p>
                    <ul className="space-y-1.5">
                      {doc.key_points.map((point, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {doc.extracted_action_items?.length ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                      Action items found
                    </p>
                    <ul className="space-y-1.5">
                      {doc.extracted_action_items.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm text-[var(--fg-muted)]">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--gold)]" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'People', values: doc.extracted_people, icon: Users },
                    { label: 'Organizations', values: doc.extracted_orgs, icon: FileText },
                    { label: 'Dates', values: doc.extracted_dates, icon: CalendarDays },
                  ].map(({ label, values, icon: Icon }) =>
                    values?.length ? (
                      <div key={label}>
                        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                          <Icon className="size-3" /> {label}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {values.slice(0, 8).map((v) => (
                            <Badge key={v} tone="neutral">{v}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {doc.extracted_text ? (
            <Card>
              <CardHeader>
                <CardTitle>Extracted text</CardTitle>
                <SourceNote source={`Read from the file itself${doc.page_count ? ` (${doc.page_count} pages)` : ''}`} />
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 font-sans text-xs whitespace-pre-wrap">
                  {doc.extracted_text}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          <CommentsPanel
            target={{ entityType: 'document', entityId: id }}
            comments={sidecars.comments}
            currentUserId={actor.user.id}
            canWrite={canWrite}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>File</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                columns={1}
                items={[
                  { label: 'Type', value: doc.mime_type ?? '—' },
                  { label: 'Size', value: `${formatNumber(Math.max(1, Math.round(doc.byte_size / 1024)))} KB` },
                  { label: 'Uploaded by', value: doc.uploaded_by ?? '—' },
                  { label: 'Uploaded', value: fmtDateTime(doc.created_at) },
                  { label: 'Storage', value: titleCase(doc.storage_driver) },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <TagsPanel
                target={{ entityType: 'document', entityId: id }}
                tags={sidecars.tags}
                available={sidecars.availableTags}
                canWrite={canWrite}
              />
            </CardContent>
          </Card>

          {links.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Attached to</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {links.map((link) => {
                  const href = ENTITY_HREF[link.entity_type]?.(link.entity_id);
                  return (
                    <div key={`${link.entity_type}-${link.entity_id}`} className="flex items-center justify-between gap-2 text-sm">
                      {href ? (
                        <Link href={href} className="min-w-0 truncate hover:text-[var(--accent)] hover:underline">
                          {link.label ?? link.entity_id}
                        </Link>
                      ) : (
                        <span className="min-w-0 truncate">{link.label ?? link.entity_id}</span>
                      )}
                      <Badge tone="outline">{titleCase(link.entity_type)}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {versions.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/knowledge/documents/${v.id}`} className="hover:underline">
                      Version {v.version}
                      {v.is_current ? ' (current)' : ''}
                    </Link>
                    <span className="text-xs text-[var(--fg-subtle)]">{fmtRelative(v.created_at)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Related documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {related.length === 0 ? (
                <EmptyState
                  title="Nothing related found"
                  description="Related documents are suggested from shared language within this company."
                  className="border-0 py-6"
                />
              ) : (
                related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/knowledge/documents/${r.id}`}
                    className="block rounded-lg px-2 py-1.5 hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    {r.summary ? (
                      <span className="block truncate text-xs text-[var(--fg-subtle)]">
                        {truncate(r.summary, 90)}
                      </span>
                    ) : null}
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

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
