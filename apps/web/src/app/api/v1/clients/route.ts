import type { ClientSummary } from '@eisman/shared';
import { authed } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { listClients } from '@/lib/queries/crm';

/** Clients the caller can read, newest activity first. */
export const GET = authed<{ items: ClientSummary[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  actor.can('crm:read', scope.companyId);

  const status = params.getAll('status');
  const rows = await listClients({
    companyIds: scope.companyIds,
    status: status.length ? status : undefined,
    search: params.get('q') ?? undefined,
    maxHealth: params.get('health') === 'at_risk' ? 60 : undefined,
  });

  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      stage: r.stage,
      healthScore: r.health_score,
      monthlyRetainer: Number(r.monthly_retainer ?? 0),
      companyName: r.company_name,
      companyId: r.company_id,
      ownerName: r.owner_name,
      openTasks: r.open_tasks,
      renewalDate: r.renewal_date,
      isDemo: r.is_demo,
    })),
  };
});
