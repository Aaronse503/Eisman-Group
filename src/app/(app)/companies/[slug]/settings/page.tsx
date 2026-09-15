import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { one } from '@/lib/db/client';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyForm } from '../../new/company-form';
import { ArchiveCompany } from './archive-company';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActor();
  const company = actor.companies.find((c) => c.slug === slug);
  if (!company) notFound();
  if (!actor.can('company:write', company.id)) {
    return <ForbiddenState permission="company:write" backHref="/companies" />;
  }

  const detail = await one<{
    name: string; slug: string; legal_name: string | null; kind: string;
    description: string | null; website: string | null; brand_color: string;
    accent_color: string; timezone: string; currency: string; archived_at: Date | null;
  }>(`select * from companies where id = $1`, [company.id]);
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Companies', href: '/companies' },
          { label: company.name, href: `/companies/${company.slug}` },
          { label: 'Settings' },
        ]}
        title={`${company.name} settings`}
        description="Identity, branding and locale for this company workspace."
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="pt-5">
            <CompanyForm
              companyId={company.id}
              defaults={{
                name: detail.name,
                slug: detail.slug,
                legalName: detail.legal_name ?? '',
                kind: detail.kind as 'operating',
                description: detail.description ?? '',
                website: detail.website ?? '',
                brandColor: detail.brand_color,
                accentColor: detail.accent_color,
                timezone: detail.timezone,
                currency: detail.currency,
              }}
            />
          </CardContent>
        </Card>

        {actor.can('company:archive', company.id) ? (
          <Card className="border-[var(--danger)]/30">
            <CardHeader>
              <CardTitle>{detail.archived_at ? 'Restore company' : 'Archive company'}</CardTitle>
              <CardDescription>
                Archiving hides the company from the switcher and from consolidated views. Nothing is
                deleted — every record is preserved and the company can be restored at any time. The
                change is recorded in the audit log with your reason.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ArchiveCompany
                companyId={company.id}
                companyName={company.name}
                archived={Boolean(detail.archived_at)}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
