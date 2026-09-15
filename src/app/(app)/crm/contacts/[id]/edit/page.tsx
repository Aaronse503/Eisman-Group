import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/auth/actor';
import { getContact } from '@/lib/queries/crm';
import { getFormOptions } from '@/lib/queries/options';
import { PageHeader } from '@/components/ui/page';
import { ForbiddenState } from '@/components/ui/states';
import { ContactForm } from '../../new/contact-form';

export const dynamic = 'force-dynamic';

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const contact = await getContact(id);
  if (!contact) notFound();
  if (!actor.can('crm:write', contact.company_id)) {
    return <ForbiddenState permission="crm:write" backHref={`/crm/contacts/${id}`} />;
  }
  const options = await getFormOptions([contact.company_id]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Contacts', href: '/crm/contacts' },
          { label: contact.full_name, href: `/crm/contacts/${id}` },
          { label: 'Edit' },
        ]}
        title={`Edit ${contact.full_name}`}
      />
      <ContactForm
        contactId={id}
        initialRoles={contact.roles}
        options={{
          companies: [{ id: contact.company_id, name: contact.company_name }],
          organizations: options.organizations,
          users: options.users,
          clients: options.clients,
        }}
        defaults={{
          companyId: contact.company_id,
          firstName: contact.first_name,
          lastName: contact.last_name ?? '',
          email: contact.email ?? '',
          secondaryEmail: contact.secondary_email ?? '',
          phone: contact.phone ?? '',
          title: contact.title ?? '',
          linkedinUrl: contact.linkedin_url ?? '',
          twitterUrl: contact.twitter_url ?? '',
          city: contact.city ?? '',
          country: contact.country ?? '',
          description: contact.description ?? '',
          organizationId: contact.organization_id ?? 'none',
        }}
      />
    </>
  );
}
