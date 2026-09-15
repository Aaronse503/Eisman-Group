import { sql } from '@/lib/db/client';

/** Shared select-option loaders used by the record forms. */
export async function getFormOptions(companyIds: string[]) {
  if (!companyIds.length) return { organizations: [], users: [], clients: [], contacts: [], projects: [], members: [] };
  const [organizations, users, clients, contacts, projects, members] = await Promise.all([
    sql<{ id: string; name: string; company_id: string }>(
      `select id, name, company_id from organizations
       where company_id = any($1) and deleted_at is null and archived_at is null
       order by name`,
      [companyIds],
    ),
    sql<{ id: string; name: string; email: string }>(
      `select distinct u.id, u.name, u.email
       from users u join user_company_roles r on r.user_id = u.id
       where u.status = 'active' and (r.company_id is null or r.company_id = any($1))
       order by u.name`,
      [companyIds],
    ),
    sql<{ id: string; name: string; company_id: string }>(
      `select id, name, company_id from clients
       where company_id = any($1) and deleted_at is null and archived_at is null
       order by name`,
      [companyIds],
    ),
    sql<{ id: string; name: string; company_id: string; email: string | null }>(
      `select id, trim(first_name || ' ' || coalesce(last_name,'')) as name, company_id, email
       from contacts where company_id = any($1) and deleted_at is null
       order by first_name`,
      [companyIds],
    ),
    sql<{ id: string; name: string; company_id: string }>(
      `select id, name, company_id from projects
       where company_id = any($1) and deleted_at is null and archived_at is null
       order by name`,
      [companyIds],
    ),
    sql<{ id: string; name: string; company_id: string; kind: string }>(
      `select id, full_name as name, company_id, kind from members
       where company_id = any($1) and deleted_at is null
       order by full_name`,
      [companyIds],
    ),
  ]);
  return { organizations, users, clients, contacts, projects, members };
}
