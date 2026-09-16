import type { SearchHit } from '@eisman/shared';
import { authed } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { globalSearch } from '@/lib/queries/search';

/** Global search, scoped to what the caller may read. */
export const GET = authed<{ items: SearchHit[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const parfaxCompany = actor.companies.find((c) => c.slug === 'parfax');

  const hits = await globalSearch({
    term: params.get('q') ?? '',
    companyIds: scope.companyIds,
    canReadInvestors: actor.can('investor:read', scope.companyId),
    canReadParfax: Boolean(parfaxCompany) && actor.can('parfax:read', parfaxCompany!.id),
    limitPerType: Number(params.get('limit') ?? 5),
  });

  return {
    items: hits.map((h) => ({
      id: h.id,
      type: h.type,
      title: h.label,
      subtitle: h.sublabel,
      companyName: h.company,
      href: h.href,
      isDemo: h.isDemo,
    })),
  };
});
