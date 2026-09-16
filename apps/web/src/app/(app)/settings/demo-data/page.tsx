import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { getEnv } from '@/lib/env';
import { demoCounts } from '@/lib/seed';
import { sql } from '@/lib/db/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ForbiddenState } from '@/components/ui/states';
import { DemoDataAdmin } from './demo-data-admin';

export const metadata: Metadata = { title: 'Demo data' };
export const dynamic = 'force-dynamic';

/** A few friendly headline numbers instead of a table-by-table dump. */
const HEADLINES: { label: string; keys: string[] }[] = [
  { label: 'Clients & contacts', keys: ['clients', 'contacts', 'organizations'] },
  { label: 'Tasks & meetings', keys: ['tasks', 'meetings', 'notes'] },
  { label: 'Documents', keys: ['documents'] },
  { label: 'Invoices & payments', keys: ['invoices', 'payments', 'subscriptions'] },
  { label: 'Team members', keys: ['members'] },
  { label: 'ParFax activity', keys: ['parfax_users', 'parfax_scans'] },
];

export default async function DemoDataPage() {
  const actor = await requireActor();
  if (!actor.can('demo:manage')) return <ForbiddenState permission="demo:manage" />;

  const env = getEnv();
  const counts = await demoCounts();
  const sum = (keys: string[]) => keys.reduce((total, k) => total + (counts[k] ?? 0), 0);

  // Anything without the demo flag is a real record, and nothing on this page
  // can touch it. Showing the number makes that concrete.
  const [live] = await sql<{ count: number }>(
    `select (
       (select count(*) from clients   where is_demo = false and deleted_at is null) +
       (select count(*) from tasks     where is_demo = false and deleted_at is null) +
       (select count(*) from invoices  where is_demo = false and deleted_at is null) +
       (select count(*) from documents where is_demo = false and deleted_at is null)
     )::int as count`,
  );

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Demo data
            {env.DISABLE_DEMO_DATA ? (
              <Badge tone="neutral">Turned off here</Badge>
            ) : env.DEMO_MODE ? (
              <Badge tone="gold">On</Badge>
            ) : (
              <Badge tone="neutral">Off</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Demo records are sample data so you can explore the system with something in it. They are
            marked with a gold <em>Demo</em> badge wherever they appear, and you can clear them at any
            time. Your own records are kept entirely separate and are never affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {HEADLINES.map((item) => (
              <div key={item.label} className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
                <p className="text-xl font-semibold tabular-nums">{sum(item.keys).toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{item.label}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-[var(--fg-muted)]">
            {(live?.count ?? 0) === 0
              ? 'You have no real records yet — everything in the system right now is demo data.'
              : `You also have ${(live.count).toLocaleString()} real records. A reset leaves every one of them untouched.`}
          </p>

          <DemoDataAdmin disabled={env.DISABLE_DEMO_DATA} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Going live with real data</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--fg-muted)]">
            <li>Reset demo data with <strong>Reseed afterwards</strong> switched off to clear it all.</li>
            <li>
              Set <code>DEMO_MODE=false</code> and <code>DISABLE_DEMO_DATA=true</code> in your
              environment so demo data can never come back.
            </li>
            <li>Restart the app. Everything you see from then on is yours.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
