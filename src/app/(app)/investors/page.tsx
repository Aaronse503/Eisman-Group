import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Plus, Upload } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import {
  findInvestorDuplicates, getInvestorPipelineSummary, listInvestors,
} from '@/lib/queries/growth';
import { formatCurrency, formatNumber, sum } from '@/lib/utils';
import { PageHeader, SourceNote } from '@/components/ui/page';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { Progress } from '@/components/ui/misc';
import { titleCase } from '@/lib/utils';
import { InvestorsView } from './investors-view';

export const metadata: Metadata = { title: 'Investors' };
export const dynamic = 'force-dynamic';

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('investor:read', scope.companyId)) {
    return <ForbiddenState permission="investor:read" />;
  }

  const stageParam = Array.isArray(params.stage) ? params.stage[0] : params.stage;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;

  const [investors, summary, duplicates] = await Promise.all([
    listInvestors({ companyIds: scope.companyIds, stage: stageParam ? [stageParam] : undefined }),
    getInvestorPipelineSummary(scope.companyIds),
    findInvestorDuplicates(scope.companyIds),
  ]);

  const canWrite = actor.can('investor:write', scope.companyId);
  const active = investors.filter((i) => !['passed', 'not_a_fit'].includes(i.pipeline_stage));
  const committed = investors.filter((i) => i.pipeline_stage === 'committed');
  const weighted = sum(active, (i) => (Number(i.potential_amount) * i.probability) / 100);
  const needFollowUp = investors.filter(
    (i) => i.next_follow_up_at && new Date(i.next_follow_up_at) <= new Date(Date.now() + 7 * 86_400_000),
  );

  const ordered = summary
    .filter((s) => !['passed', 'not_a_fit'].includes(s.stage))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...ordered.map((s) => s.count), 1);

  return (
    <>
      <PageHeader
        title="Investors"
        description="Fundraising pipeline across Eisman Holdings. Nothing here sends outreach — drafts and templates are prepared for you to send yourself."
        actions={
          canWrite ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/investors/templates">
                  <FileText /> Templates
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/settings/import?entity=investor">
                  <Upload /> Import
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/investors/new">
                  <Plus /> New investor
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active pipeline" value={formatNumber(active.length)} hint={`${investors.length} tracked in total`} />
        <StatCard
          label="Potential raise"
          value={formatCurrency(sum(active, (i) => Number(i.potential_amount)), 'USD', { compact: true })}
        />
        <StatCard
          label="Weighted pipeline"
          value={formatCurrency(weighted, 'USD', { compact: true })}
          hint="Potential × stage probability"
        />
        <StatCard
          label="Committed"
          value={formatCurrency(sum(committed, (i) => Number(i.potential_amount)), 'USD', { compact: true })}
          tone={committed.length ? 'success' : 'default'}
          hint={`${committed.length} investor${committed.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by stage</CardTitle>
            <SourceNote source="Investor records in this system. Probability comes from the stage unless it was overridden." />
          </CardHeader>
          <CardContent className="space-y-2">
            {ordered.map((s) => (
              <div key={s.stage} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{titleCase(s.stage)}</span>
                  <span className="tnum text-[var(--fg-muted)]">
                    {s.count} · {formatCurrency(s.value, 'USD', { compact: true })}
                  </span>
                </div>
                <Progress value={(s.count / maxCount) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs follow-up this week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {needFollowUp.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">Nothing due in the next seven days.</p>
            ) : (
              needFollowUp.slice(0, 8).map((i) => (
                <Link
                  key={i.id}
                  href={`/investors/${i.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]"
                >
                  <span className="min-w-0 truncate">{i.name}</span>
                  <span className="shrink-0 text-xs text-[var(--fg-subtle)]">
                    {new Date(i.next_follow_up_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <InvestorsView
        investors={investors}
        canWrite={canWrite}
        duplicates={duplicates}
        defaultView={view === 'follow_up' ? 'follow_up' : undefined}
      />
    </>
  );
}
