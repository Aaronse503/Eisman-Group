import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listFolders } from '@/lib/queries/knowledge';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Upload' };
export const dynamic = 'force-dynamic';

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('knowledge:write', scope.companyId)) {
    return <ForbiddenState permission="knowledge:write" backHref="/knowledge" />;
  }

  const writable = actor.companies.filter((c) => !c.archived_at && actor.can('knowledge:write', c.id));
  const folders = await listFolders(writable.map((c) => c.id));
  const entityType = Array.isArray(params.entity) ? params.entity[0] : params.entity;
  const entityId = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Knowledge Hub', href: '/knowledge' }, { label: 'Upload' }]}
        title="Upload documents"
        description="Readable files are text-extracted, summarised and indexed so the assistant can cite them. Scans and images are stored but need OCR to be searchable."
      />
      <UploadForm
        companies={writable.map((c) => ({ id: c.id, name: c.name }))}
        folders={folders.map((f) => ({ id: f.id, name: f.name, company_id: f.company_id }))}
        defaultCompanyId={scope.companyId ?? writable[0]?.id ?? ''}
        entityType={entityType ?? null}
        entityId={entityId ?? null}
        canSetRestricted={actor.can('knowledge:restricted_read', scope.companyId)}
      />
    </>
  );
}
