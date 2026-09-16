import type { Metadata } from 'next';
import Link from 'next/link';
import { MessagesSquare, Upload } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import {
  allowedAccessLevels, getKnowledgeStats, listDocuments, listFolders, listNotes,
} from '@/lib/queries/knowledge';
import { aiProviderStatus } from '@/lib/ai/provider';
import { formatNumber } from '@/lib/utils';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { ForbiddenState } from '@/components/ui/states';
import { KnowledgeTabs } from './knowledge-tabs';

export const metadata: Metadata = { title: 'Knowledge Hub' };
export const dynamic = 'force-dynamic';

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('knowledge:read', scope.companyId)) {
    return <ForbiddenState permission="knowledge:read" />;
  }

  const accessLevels = allowedAccessLevels({
    restricted: actor.can('knowledge:restricted_read', scope.companyId),
    finance: actor.can('finance:read', scope.companyId),
    investor: actor.can('investor:read', scope.companyId),
    hr: actor.can('team:compensation_read', scope.companyId),
  });

  const [documents, notes, folders, stats] = await Promise.all([
    listDocuments({ companyIds: scope.companyIds, accessLevels }),
    listNotes({ companyIds: scope.companyIds }),
    listFolders(scope.companyIds),
    getKnowledgeStats(scope.companyIds),
  ]);

  const ai = aiProviderStatus();
  const canWrite = actor.can('knowledge:write', scope.companyId);
  const tab = (Array.isArray(params.tab) ? params.tab[0] : params.tab) ?? 'documents';

  return (
    <>
      <PageHeader
        title="Knowledge Hub"
        description="Documents, notes and meeting records — searchable, summarised, and answerable with citations."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/knowledge/assistant${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                <MessagesSquare /> Ask a question
              </Link>
            </Button>
            {canWrite ? (
              <Button asChild variant="primary">
                <Link href={`/knowledge/upload${scope.isHoldings ? '' : `?company=${scope.slug}`}`}>
                  <Upload /> Upload
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Documents" value={formatNumber(stats.documents)} />
        <StatCard label="Notes" value={formatNumber(stats.notes)} />
        <StatCard
          label="Indexed for search"
          value={formatNumber(stats.indexed)}
          hint={`${formatNumber(stats.chunks)} passages`}
        />
        <StatCard
          label="Need OCR"
          value={formatNumber(stats.needsOcr)}
          tone={stats.needsOcr > 0 ? 'warning' : 'default'}
          hint={stats.needsOcr ? 'Scans and images with no text layer' : 'Everything readable is indexed'}
        />
      </div>

      <KnowledgeTabs
        defaultTab={tab}
        documents={documents}
        notes={notes}
        folders={folders}
        canWrite={canWrite}
        showCompany={scope.isHoldings}
        scopeSlug={scope.slug}
      />

      <SourceNote
        className="mt-6"
        source={`Answers come from the records above only. AI provider: ${ai.active} (${ai.model}). ${ai.note}`}
      />
    </>
  );
}
