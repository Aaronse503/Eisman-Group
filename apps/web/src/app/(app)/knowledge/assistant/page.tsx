import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { SUGGESTED_QUESTIONS } from '@/lib/knowledge/assistant';
import { aiProviderStatus } from '@/lib/ai/provider';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { KnowledgeAssistant } from './assistant';

export const metadata: Metadata = { title: 'Knowledge assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('knowledge:read', scope.companyId)) {
    return <ForbiddenState permission="knowledge:read" backHref="/knowledge" />;
  }
  const ai = aiProviderStatus();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Knowledge Hub', href: '/knowledge' }, { label: 'Assistant' }]}
        title="Ask your records"
        description="Natural-language questions answered from your own documents, notes and records — with citations."
      />
      <KnowledgeAssistant
        suggestions={SUGGESTED_QUESTIONS}
        companySlug={scope.slug}
        scopeLabel={scope.label}
        providerNote={ai.note}
      />
    </>
  );
}
