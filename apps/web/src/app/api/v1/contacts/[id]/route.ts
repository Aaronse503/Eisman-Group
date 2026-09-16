import { authed, notFound, forbidden } from '@/lib/api/route';
import { getContact } from '@/lib/queries/crm';
import { sql } from '@/lib/db/client';

/** One contact. */
export const GET = authed(async ({ actor, route }) => {
  const contact = await getContact(route.id!);
  if (!contact) throw notFound('Contact');
  if (!actor.canReadCompany(contact.company_id)) throw forbidden();

  const clients = await sql<{ id: string; name: string }>(
    `select c.id, c.name from client_contacts cc
     join clients c on c.id = cc.client_id
     where cc.contact_id = $1 and c.deleted_at is null`,
    [contact.id],
  );

  return {
    contact: {
      id: contact.id,
      fullName: contact.full_name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      linkedinUrl: contact.linkedin_url,
      companyName: contact.company_name,
      organizationName: contact.organization_name,
      city: contact.city,
      country: contact.country,
      isDemo: contact.is_demo,
    },
    clients,
  };
});
