import 'server-only';
import type { Actor } from '@/lib/auth/actor';
import { getScope, type Scope } from '@/lib/scope';
import { forbidden } from '@/lib/api/route';

/**
 * The workspace a request applies to.
 *
 * The mobile application always states it explicitly — a phone has no sticky
 * cookie worth trusting — but the same resolver is used, so an unreadable
 * company falls back to the consolidated view rather than erroring.
 */
export async function apiScope(actor: Actor, params: URLSearchParams): Promise<Scope> {
  const requested = params.get('company') ?? undefined;
  return getScope(actor, requested ? { company: requested } : undefined);
}

/** Company ids for the request, refusing when the caller can read nothing. */
export function scopedCompanyIds(scope: Scope): string[] {
  if (!scope.companyIds.length) {
    throw forbidden('You do not have access to any company.');
  }
  return scope.companyIds;
}
