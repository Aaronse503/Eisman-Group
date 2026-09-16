import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listAudit } from '@/lib/audit';
import { Card, CardContent } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { AuditTable } from './audit-table';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('audit:read', scope.companyId)) {
    return <ForbiddenState permission="audit:read" backHref="/settings/profile" />;
  }

  const entries = await listAudit({
    companyIds: actor.isHoldingsOwner ? null : scope.companyIds,
    limit: 500,
  });

  return (
    <div className="space-y-4">
      <Card className="border-[var(--accent)]/30">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
          <div className="text-sm text-[var(--fg-muted)]">
            <p className="font-medium text-[var(--fg)]">Append-only record</p>
            <p>
              The database blocks UPDATE and DELETE on this table with a trigger, so nobody —
              including an administrator or this application — can alter or remove an entry once it
              is written. Sensitive values are redacted before they are stored.
            </p>
          </div>
        </CardContent>
      </Card>

      <AuditTable
        entries={entries.map((e) => ({
          id: e.id,
          createdAt: e.created_at,
          actor: e.actor_name ?? e.actor_email ?? 'System',
          action: e.action,
          entityType: e.entity_type,
          entityLabel: e.entity_label,
          entityId: e.entity_id,
          company: e.company_name,
          reason: e.reason,
          severity: e.severity,
          before: e.before_value,
          after: e.after_value,
        }))}
      />
    </div>
  );
}
