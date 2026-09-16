import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { listParfaxLocations } from '@/lib/queries/parfax';
import { formatNumber, titleCase } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status';
import { EmptyState, ForbiddenState } from '@/components/ui/states';
import { ParfaxNav } from '../parfax-nav';

export const metadata: Metadata = { title: 'ParFax locations' };
export const dynamic = 'force-dynamic';

export default async function ParfaxLocationsPage() {
  const actor = await requireActor();
  const parfax = actor.companies.find((c) => c.slug === 'parfax');
  if (!parfax || !actor.can('parfax:read', parfax.id)) {
    return <ForbiddenState permission="parfax:read" />;
  }
  const locations = await listParfaxLocations();
  const live = locations.filter((l) => l.status === 'live');
  const pilot = locations.filter((l) => l.status === 'pilot');
  const scanners = locations.reduce((a, b) => a + b.scanners, 0);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'ParFax', href: '/parfax' }, { label: 'Locations' }]}
        title="Retail and course locations"
        description="Where ParFax scanners are live, in pilot, or under discussion."
      />
      <ParfaxNav />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Live locations" value={formatNumber(live.length)} tone="success" />
        <StatCard label="In pilot" value={formatNumber(pilot.length)} />
        <StatCard label="Scanner units" value={formatNumber(scanners)} />
        <StatCard
          label="Scans at locations"
          value={formatNumber(locations.reduce((a, b) => a + b.scan_count, 0))}
          hint="Scans attributed to a location"
        />
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No locations yet"
          description="Locations are created alongside course, pro shop and retailer partnerships."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((l) => (
            <Card key={l.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-[var(--fg-subtle)]">
                      <MapPin className="size-3" />
                      {[l.city, l.region].filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="outline">{titleCase(l.kind)}</Badge>
                  {l.scanners ? <Badge tone="accent">{l.scanners} scanner{l.scanners === 1 ? '' : 's'}</Badge> : null}
                  {l.scan_count ? <Badge tone="neutral">{formatNumber(l.scan_count)} scans</Badge> : null}
                </div>
                <p className="text-xs text-[var(--fg-subtle)]">
                  {l.launched_on ? `Launched ${fmtDate(l.launched_on)}` : 'Not launched'}
                  {l.partnership_id ? (
                    <>
                      {' · '}
                      <Link href={`/partnerships/${l.partnership_id}`} className="text-[var(--accent)] hover:underline">
                        Partnership
                      </Link>
                    </>
                  ) : null}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SourceNote className="mt-4" source="Location records in this system, linked to the partnership that owns each one." />
    </>
  );
}
