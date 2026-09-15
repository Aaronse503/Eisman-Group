import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireActor } from '@/lib/auth/actor';
import { getNote } from '@/lib/queries/knowledge';
import { fmtDateTime } from '@/lib/dates';
import { titleCase } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ForbiddenState } from '@/components/ui/states';
import { TrackView } from '@/components/record/track-view';

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
  parfax_user: (id) => `/parfax/users/${id}`,
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNote(id);
  return { title: note?.title ?? 'Note' };
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const note = await getNote(id);
  if (!note) notFound();
  if (!actor.canReadCompany(note.company_id) || !actor.can('knowledge:read', note.company_id)) {
    return <ForbiddenState permission="knowledge:read" backHref="/knowledge" />;
  }
  const href =
    note.entity_type && note.entity_id ? ENTITY_HREF[note.entity_type]?.(note.entity_id) : null;

  return (
    <>
      <TrackView entityType="note" entityId={id} label={note.title} href={`/knowledge/notes/${id}`} companyId={note.company_id} />
      <PageHeader
        breadcrumbs={[
          { label: 'Knowledge Hub', href: '/knowledge?tab=notes' },
          { label: note.title },
        ]}
        title={note.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">{note.company_name}</Badge>
            {note.pinned ? <Badge tone="gold">Pinned</Badge> : null}
            {note.entity_type ? (
              href ? (
                <Link href={href}>
                  <Badge tone="accent">On a {titleCase(note.entity_type)}</Badge>
                </Link>
              ) : (
                <Badge tone="accent">On a {titleCase(note.entity_type)}</Badge>
              )
            ) : null}
            {note.is_demo ? <Badge tone="gold">Demo data</Badge> : null}
          </div>
        }
      />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
          <p className="mt-6 border-t border-[var(--border)] pt-3 text-xs text-[var(--fg-subtle)]">
            {note.author_name ?? 'Unknown'} · created {fmtDateTime(note.created_at)}
            {note.updated_at > note.created_at ? ` · updated ${fmtDateTime(note.updated_at)}` : ''}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
