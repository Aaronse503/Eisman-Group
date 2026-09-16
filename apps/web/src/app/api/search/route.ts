import { NextResponse, type NextRequest } from 'next/server';
import { getActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { globalSearch } from '@/lib/queries/search';

/**
 * Global search for the web application's command palette.
 *
 * Shares one implementation with /api/v1/search, so the phone and the laptop
 * find the same records.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ results: [] }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const term = params.get('q') ?? '';
  const company = params.get('company') ?? undefined;
  const scope = await getScope(actor, company ? { company } : undefined);

  const parfaxCompany = actor.companies.find((c) => c.slug === 'parfax');
  const results = await globalSearch({
    term,
    companyIds: scope.companyIds,
    canReadInvestors: actor.can('investor:read', scope.companyId),
    canReadParfax: Boolean(parfaxCompany) && actor.can('parfax:read', parfaxCompany!.id),
  });

  return NextResponse.json({ results });
}
