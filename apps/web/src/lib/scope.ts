import 'server-only';
import { cookies } from 'next/headers';
import type { Actor, CompanySummary } from '@/lib/auth/actor';

export const SCOPE_COOKIE = 'ehcc_scope';
export const HOLDINGS_SCOPE = 'holdings';

export interface Scope {
  /** null = the consolidated Eisman Holdings view across every company. */
  companyId: string | null;
  company: CompanySummary | null;
  /** Company ids to filter by. For holdings scope this is every readable company. */
  companyIds: string[];
  label: string;
  slug: string;
  isHoldings: boolean;
}

/**
 * Resolves the active workspace. Precedence: explicit `?company=` on the URL,
 * then the sticky cookie, then the consolidated holdings view. A scope the
 * actor cannot read always falls back to holdings rather than erroring, so a
 * revoked grant never leaves someone stuck on a dead page.
 */
export async function getScope(
  actor: Actor,
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<Scope> {
  const readable = actor.companies.filter((c) => !c.archived_at);
  const allIds = actor.companies.map((c) => c.id);

  const fromQuery = searchParams?.company;
  const requested =
    (Array.isArray(fromQuery) ? fromQuery[0] : fromQuery) ??
    (await cookies()).get(SCOPE_COOKIE)?.value ??
    HOLDINGS_SCOPE;

  if (requested && requested !== HOLDINGS_SCOPE) {
    const company =
      readable.find((c) => c.slug === requested) ?? readable.find((c) => c.id === requested);
    if (company) {
      return {
        companyId: company.id,
        company,
        companyIds: [company.id],
        label: company.name,
        slug: company.slug,
        isHoldings: false,
      };
    }
  }

  return {
    companyId: null,
    company: null,
    companyIds: allIds,
    label: 'Eisman Holdings',
    slug: HOLDINGS_SCOPE,
    isHoldings: true,
  };
}

/** Appends the current scope to a link so navigation keeps the workspace. */
export function withScope(href: string, scope: Scope) {
  if (scope.isHoldings) return href;
  const [path, existing] = href.split('?');
  const params = new URLSearchParams(existing);
  params.set('company', scope.slug);
  return `${path}?${params.toString()}`;
}
