import type { PipelineEntry } from '@eisman/shared';
import { authed, forbidden } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { listInvestors, listPartnerships } from '@/lib/queries/growth';

/**
 * The investor or partnership pipeline.
 *
 * Values are the recorded amounts; the weighted figure the dashboard shows is
 * computed there and labelled as weighted, so nothing here is presented as
 * more certain than it is.
 */
export const GET = authed<{ kind: string; items: PipelineEntry[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const kind = params.get('kind') === 'investor' ? 'investor' : 'partnership';

  if (kind === 'investor') {
    if (!actor.can('investor:read', scope.companyId)) {
      throw forbidden('You do not have access to the investor pipeline.');
    }
    const rows = await listInvestors({ companyIds: scope.companyIds });
    return {
      kind,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        stage: r.pipeline_stage,
        value: Number(r.potential_amount ?? 0),
        probability: r.probability ?? null,
        ownerName: r.owner_name,
        nextFollowUpAt: r.next_follow_up_at ? new Date(r.next_follow_up_at).toISOString() : null,
        isDemo: r.is_demo,
      })),
    };
  }

  if (!actor.can('partnership:read', scope.companyId)) {
    throw forbidden('You do not have access to the partnership pipeline.');
  }
  const rows = await listPartnerships({ companyIds: scope.companyIds });
  return {
    kind,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      stage: r.stage,
      value: Number(r.estimated_value ?? 0),
      probability: r.probability ?? null,
      ownerName: r.owner_name,
      nextFollowUpAt: r.next_action_date ? new Date(r.next_action_date).toISOString() : null,
      isDemo: r.is_demo,
    })),
  };
});
