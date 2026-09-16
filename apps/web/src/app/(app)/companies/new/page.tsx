import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { CompanyForm } from './company-form';

export const metadata: Metadata = { title: 'New company' };

export default async function NewCompanyPage() {
  const actor = await requireActor();
  if (!actor.can('company:create')) {
    return <ForbiddenState permission="company:create" backHref="/companies" />;
  }
  return (
    <>
      <PageHeader
        title="New company"
        description="Add another company to Eisman Holdings. No code changes are needed — the workspace, permissions, dashboards and integration cards are created with it."
        breadcrumbs={[{ label: 'Companies', href: '/companies' }, { label: 'New' }]}
      />
      <CompanyForm />
    </>
  );
}
