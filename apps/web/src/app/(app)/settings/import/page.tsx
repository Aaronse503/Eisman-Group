import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { IMPORT_ENTITIES } from '@/lib/csv/import';
import { listImportsAction } from '@/server/actions/import';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { ImportWizard } from './import-wizard';
import { ImportHistory } from './import-history';

export const metadata: Metadata = { title: 'Import data' };
export const dynamic = 'force-dynamic';

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('import:run', scope.companyId)) {
    return <ForbiddenState permission="import:run" backHref="/settings/profile" />;
  }

  const entityParam = Array.isArray(params.entity) ? params.entity[0] : params.entity;
  const available = IMPORT_ENTITIES.filter((e) => actor.can(e.permission, scope.companyId));
  const history = await listImportsAction(scope.companyIds);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import from CSV</CardTitle>
          <CardDescription>
            Upload a file, map its columns, review exactly what will happen, then import. Nothing is
            written until you confirm, and an import that only created records can be rolled back.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportWizard
            entities={available.map((e) => ({
              id: e.id,
              label: e.label,
              description: e.description,
              companyScoped: e.companyScoped,
              duplicateKeys: e.duplicateKeys,
              fields: e.fields,
            }))}
            companies={actor.companies
              .filter((c) => !c.archived_at)
              .map((c) => ({ id: c.id, name: c.name }))}
            defaultEntityId={entityParam ?? available[0]?.id ?? ''}
            defaultCompanyId={scope.companyId ?? actor.companies[0]?.id ?? ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Every import, what it changed, and whether it can be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportHistory
            imports={history.map((h) => ({
              id: h.id,
              entityType: h.entity_type,
              filename: h.filename,
              status: h.status,
              total: h.total_rows,
              created: h.created_count,
              updated: h.updated_count,
              skipped: h.skipped_count,
              failed: h.failed_count,
              rolledBackAt: h.rolled_back_at,
              createdAt: h.created_at,
              createdBy: h.created_by,
              company: h.company_name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
