import type { ParfaxUserSummary } from '@eisman/shared';
import { authed, forbidden } from '@/lib/api/route';
import { listParfaxUsers } from '@/lib/queries/parfax';

/** ParFax user lookup, for answering a support question from a phone. */
export const GET = authed<{ items: ParfaxUserSummary[] }>(async ({ actor, params }) => {
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    throw forbidden('You do not have access to the ParFax platform.');
  }

  const rows = await listParfaxUsers({
    search: params.get('q') ?? undefined,
    plan: params.get('plan') ?? undefined,
    status: params.get('status') ?? undefined,
    limit: Math.min(Number(params.get('limit') ?? 50), 200),
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      plan: r.plan,
      status: r.status,
      signupAt: new Date(r.signup_at).toISOString(),
      lastActiveAt: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
      scanCount: r.scan_count ?? 0,
      isDemo: r.is_demo,
    })),
  };
});
