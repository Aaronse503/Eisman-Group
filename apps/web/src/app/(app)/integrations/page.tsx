import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listConnections } from '@/lib/integrations/manager';
import { PROVIDERS } from '@/lib/integrations/registry';
import { getEnv } from '@/lib/env';
import { PageHeader } from '@/components/ui/page';
import { Card, CardContent } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { IntegrationCard } from './integration-card';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('integration:read', scope.companyId)) {
    return <ForbiddenState permission="integration:read" />;
  }

  const connections = await listConnections(scope.companyIds);
  const env = getEnv();
  const canWrite = actor.can('integration:write', scope.companyId);

  // One card per provider; company-scoped providers show a card per company the
  // actor can see, so nothing is silently merged across tenants — and so a card
  // that has not been connected yet still knows which company it is for. A
  // company-scoped connection made with no company can authenticate but can
  // never sync, which is a confusing place to leave someone.
  const companies = actor.companies.filter(
    (c) => !c.archived_at && scope.companyIds.includes(c.id),
  );

  type Card = {
    provider: (typeof PROVIDERS)[number];
    connection: (typeof connections)[number] | null;
    /** The company this card connects for; null for holdings-wide providers. */
    companyId: string | null;
    companyName: string | null;
  };

  const cards: Card[] = PROVIDERS.flatMap((provider): Card[] => {
    const matching = connections.filter((c) => c.provider === provider.id);

    if (provider.scope === 'holding') {
      return matching.length
        ? matching.map((connection) => ({ provider, connection, companyId: null, companyName: null }))
        : [{ provider, connection: null, companyId: null, companyName: null }];
    }

    // A card for every company, carrying any connection that company already has.
    const perCompany: Card[] = companies.map((company) => ({
      provider,
      connection: matching.find((c) => c.company_id === company.id) ?? null,
      companyId: company.id,
      companyName: company.name,
    }));

    // Connections made before this page knew to ask — holdings-level rows for a
    // company-scoped provider. They are shown so they can be disconnected
    // rather than sitting invisibly in the database failing every sync.
    const orphans: Card[] = matching
      .filter((c) => !c.company_id)
      .map((connection) => ({ provider, connection, companyId: null, companyName: null }));

    return [...perCompany, ...orphans];
  });

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connected systems, what they sync, and exactly when they last ran."
      />

      <Card className="mb-6 border-[var(--info)]/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-[var(--info)]" />
          <div className="space-y-1 text-sm text-[var(--fg-muted)]">
            <p>
              A card only says &ldquo;connected&rdquo; after a real call to that provider succeeded.
              Nothing here fabricates a connection.
            </p>
            <p>
              <strong>Demo Mode</strong> loads built-in sample records, clearly labelled as demo
              data, so you can exercise a workflow before you have credentials. It never contacts
              the provider.
            </p>
            {env.DEMO_MODE ? null : (
              <p className="text-[var(--warning)]">Demo Mode is disabled on this deployment.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map(({ provider, connection, companyId, companyName }) => (
          <IntegrationCard
            key={`${provider.id}-${connection?.id ?? companyId ?? 'none'}`}
            companyId={companyId}
            companyLabel={companyName}
            provider={{
              id: provider.id,
              name: provider.name,
              tagline: provider.tagline,
              category: provider.category,
              scope: provider.scope,
              credentialFields: provider.credentialFields,
              requestedScopes: provider.requestedScopes,
              syncs: provider.syncs,
              writeCapable: provider.writeCapable,
              supportsDemo: provider.supportsDemo,
              setupSteps: provider.setupSteps,
              docsUrl: provider.docsUrl,
              status: provider.status,
              plannedNote: provider.plannedNote,
            }}
            connection={
              connection
                ? {
                    id: connection.id,
                    status: connection.status,
                    mode: connection.mode,
                    accountName: connection.account_name,
                    scopes: connection.scopes,
                    credentialsHint: connection.credentials_hint,
                    lastSuccessAt: connection.last_success_at,
                    lastAttemptAt: connection.last_attempt_at,
                    lastError: connection.last_error,
                    writeEnabled: connection.write_enabled,
                    companyName: connection.company_name,
                    conflictCount: connection.conflict_count,
                    envSupplied: connection.env_supplied,
                    lastRun: connection.last_run,
                  }
                : null
            }
            canWrite={canWrite}
            demoAvailable={env.DEMO_MODE}
          />
        ))}
      </div>

      <p className="mt-6 text-xs text-[var(--fg-subtle)]">
        Credentials are encrypted with AES-256-GCM before they are stored, and are never returned to
        the browser. See{' '}
        <Link href="/settings/audit" className="text-[var(--accent)] hover:underline">
          the audit log
        </Link>{' '}
        for every connection, sync and disconnection.
      </p>
    </>
  );
}
