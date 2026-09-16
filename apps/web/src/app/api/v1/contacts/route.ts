import type { ContactSummary } from '@eisman/shared';
import { sql } from '@/lib/db/client';
import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { apiScope } from '@/lib/api/scope';
import { listContacts } from '@/lib/queries/crm';
import { createContactAction } from '@/server/actions/crm';

/** Contacts the caller can read. */
export const GET = authed<{ items: ContactSummary[] }>(async ({ actor, params }) => {
  const scope = await apiScope(actor, params);
  const rows = await listContacts({
    companyIds: scope.companyIds,
    search: params.get('q') ?? undefined,
  });

  // Which clients each contact belongs to, so the phone can show it without a
  // second request per row.
  const links = rows.length
    ? await sql<{ contact_id: string; name: string }>(
        `select cc.contact_id, c.name
         from client_contacts cc join clients c on c.id = cc.client_id
         where cc.contact_id = any($1) and c.deleted_at is null`,
        [rows.map((r) => r.id)],
      )
    : [];
  const byContact = new Map<string, string[]>();
  for (const link of links) {
    byContact.set(link.contact_id, [...(byContact.get(link.contact_id) ?? []), link.name]);
  }

  return {
    items: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      title: r.title,
      email: r.email,
      phone: r.phone,
      companyName: r.company_name,
      companyId: r.company_id,
      organizationName: r.organization_name,
      clientNames: byContact.get(r.id) ?? [],
      isDemo: r.is_demo,
    })),
  };
});

/**
 * Creates a contact.
 *
 * Delegates to the same action the web form uses, so validation, permissions
 * and the audit entry are identical whichever application it came from.
 */
export const POST = authed(async ({ request }) => {
  const result = await createContactAction(await jsonBody(request));
  if (!result.ok) throw badRequest(result.error, result.fields);
  return { id: result.data.id };
});
