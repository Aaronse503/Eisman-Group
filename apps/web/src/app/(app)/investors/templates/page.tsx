import type { Metadata } from 'next';
import { Info } from 'lucide-react';
import { requireActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { listMessageTemplates } from '@/lib/queries/growth';
import { PageHeader } from '@/components/ui/page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ForbiddenState, EmptyState } from '@/components/ui/states';
import { titleCase } from '@/lib/utils';
import { CopyTemplate } from './copy-template';

export const metadata: Metadata = { title: 'Message templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireActor();
  const scope = await getScope(actor, params);
  if (!actor.can('investor:read', scope.companyId)) {
    return <ForbiddenState permission="investor:read" backHref="/investors" />;
  }
  const templates = await listMessageTemplates(scope.companyIds);
  const byCategory = new Map<string, typeof templates>();
  for (const t of templates) {
    byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Investors', href: '/investors' }, { label: 'Templates' }]}
        title="Message templates"
        description="Saved drafts for investor and partnership outreach."
      />

      <Card className="mb-5 border-[var(--info)]/40">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-[var(--info)]" />
          <p className="text-sm text-[var(--fg-muted)]">
            Nothing is sent from this system. Copy a template, fill in the variables, and send it
            from your own email client. When an email provider is connected in future, sending will
            still require your explicit approval for each message.
          </p>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <EmptyState title="No templates yet" description="Templates are seeded with the demo data, or you can add your own." />
      ) : (
        <div className="space-y-6">
          {[...byCategory.entries()].map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
                {titleCase(category)}
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {items.map((t) => (
                  <Card key={t.id}>
                    <CardHeader className="flex-row items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate">{t.name}</CardTitle>
                        <p className="text-xs text-[var(--fg-subtle)]">
                          {titleCase(t.channel)}
                          {t.subject ? ` · ${t.subject}` : ''}
                        </p>
                      </div>
                      <CopyTemplate subject={t.subject} body={t.body} />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--surface-sunken)] p-3 font-sans text-xs whitespace-pre-wrap">
                        {t.body}
                      </pre>
                      {t.variables.length ? (
                        <div className="flex flex-wrap gap-1">
                          {t.variables.map((v) => (
                            <Badge key={v} tone="outline">{`{{${v}}}`}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
