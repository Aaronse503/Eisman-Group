import { sql, one } from '@/lib/db/client';
import type { ClientRow, ContactRow, DealRow, OrganizationRow } from '@/lib/domain/crm';

export type { ClientRow, ContactRow, DealRow, OrganizationRow };
export {
  BILLING_STATUSES, CLIENT_STAGES, CLIENT_STATUSES, CONTACT_ROLES,
  CURRENCIES, DEAL_STAGES, ORGANIZATION_ROLES,
} from '@/lib/domain/crm';

export async function listClients(opts: {
  companyIds: string[];
  status?: string[];
  search?: string;
  ownerId?: string;
  maxHealth?: number;
  includeArchived?: boolean;
}): Promise<ClientRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where: string[] = ['c.company_id = any($1)', 'c.deleted_at is null'];
  if (!opts.includeArchived) where.push('c.archived_at is null');
  if (opts.status?.length) {
    params.push(opts.status);
    where.push(`c.status = any($${params.length})`);
  }
  if (opts.ownerId) {
    params.push(opts.ownerId);
    where.push(`c.account_owner_id = $${params.length}`);
  }
  if (typeof opts.maxHealth === 'number') {
    params.push(opts.maxHealth);
    where.push(`c.health_score < $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(c.name ilike $${params.length} or c.goals ilike $${params.length})`);
  }

  return sql<ClientRow>(
    `select c.*, co.name as company_name, u.name as owner_name,
       (select count(*)::int from tasks t
         where t.client_id = c.id and t.deleted_at is null
           and t.status not in ('done','cancelled')) as open_tasks,
       (select count(*)::int from tasks t
         where t.client_id = c.id and t.deleted_at is null
           and t.status not in ('done','cancelled') and t.due_at < now()) as overdue_tasks,
       coalesce((select sum(i.amount_due) from invoices i
         where i.client_id = c.id and i.deleted_at is null
           and i.status in ('open','past_due')), 0) as outstanding,
       (select count(*)::int from client_contacts cc where cc.client_id = c.id) as contacts
     from clients c
     join companies co on co.id = c.company_id
     left join users u on u.id = c.account_owner_id
     where ${where.join(' and ')}
     order by c.position, c.name`,
    params,
  );
}

export async function getClient(id: string) {
  return one<
    ClientRow & {
      goals: string | null;
      deliverables: string | null;
      kpis: string | null;
      risks: string | null;
      socials: Record<string, string | null>;
      archived_at: Date | null;
      organization_name: string | null;
      company_slug: string;
    }
  >(
    `select c.*, co.name as company_name, co.slug as company_slug, u.name as owner_name,
            o.name as organization_name,
       (select count(*)::int from tasks t
         where t.client_id = c.id and t.deleted_at is null
           and t.status not in ('done','cancelled')) as open_tasks,
       (select count(*)::int from tasks t
         where t.client_id = c.id and t.deleted_at is null
           and t.status not in ('done','cancelled') and t.due_at < now()) as overdue_tasks,
       coalesce((select sum(i.amount_due) from invoices i
         where i.client_id = c.id and i.deleted_at is null
           and i.status in ('open','past_due')), 0) as outstanding,
       (select count(*)::int from client_contacts cc where cc.client_id = c.id) as contacts
     from clients c
     join companies co on co.id = c.company_id
     left join users u on u.id = c.account_owner_id
     left join organizations o on o.id = c.organization_id
     where c.id = $1 and c.deleted_at is null`,
    [id],
  );
}

export async function listContacts(opts: {
  companyIds: string[];
  search?: string;
  role?: string;
  organizationId?: string;
}): Promise<ContactRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where: string[] = ['c.company_id = any($1)', 'c.deleted_at is null'];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(
      `(c.first_name ilike $${params.length} or c.last_name ilike $${params.length} or c.email ilike $${params.length})`,
    );
  }
  if (opts.organizationId) {
    params.push(opts.organizationId);
    where.push(`c.organization_id = $${params.length}`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`exists (select 1 from contact_roles r where r.contact_id = c.id and r.role = $${params.length})`);
  }

  return sql<ContactRow>(
    `select c.*, trim(c.first_name || ' ' || coalesce(c.last_name, '')) as full_name,
            co.name as company_name, o.name as organization_name, u.name as owner_name,
            coalesce((select array_agg(r.role order by r.role) from contact_roles r
                      where r.contact_id = c.id), '{}') as roles
     from contacts c
     join companies co on co.id = c.company_id
     left join organizations o on o.id = c.organization_id
     left join users u on u.id = c.owner_user_id
     where ${where.join(' and ')}
     order by c.first_name, c.last_name`,
    params,
  );
}

export async function getContact(id: string) {
  return one<ContactRow & { description: string | null; secondary_email: string | null; timezone: string | null; twitter_url: string | null; company_slug: string }>(
    `select c.*, trim(c.first_name || ' ' || coalesce(c.last_name, '')) as full_name,
            co.name as company_name, co.slug as company_slug,
            o.name as organization_name, u.name as owner_name,
            coalesce((select array_agg(r.role order by r.role) from contact_roles r
                      where r.contact_id = c.id), '{}') as roles
     from contacts c
     join companies co on co.id = c.company_id
     left join organizations o on o.id = c.organization_id
     left join users u on u.id = c.owner_user_id
     where c.id = $1 and c.deleted_at is null`,
    [id],
  );
}

export async function listOrganizations(opts: { companyIds: string[]; search?: string; role?: string }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where: string[] = ['o.company_id = any($1)', 'o.deleted_at is null'];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(o.name ilike $${params.length} or o.domain ilike $${params.length})`);
  }
  if (opts.role) {
    params.push(opts.role);
    where.push(`exists (select 1 from organization_roles r where r.organization_id = o.id and r.role = $${params.length})`);
  }
  return sql<OrganizationRow>(
    `select o.*, co.name as company_name, u.name as owner_name,
            coalesce((select array_agg(r.role order by r.role) from organization_roles r
                      where r.organization_id = o.id), '{}') as roles,
            (select count(*)::int from contacts c
              where c.organization_id = o.id and c.deleted_at is null) as contacts
     from organizations o
     join companies co on co.id = o.company_id
     left join users u on u.id = o.owner_user_id
     where ${where.join(' and ')}
     order by o.name`,
    params,
  );
}

export async function listDeals(opts: { companyIds: string[]; stage?: string[] }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['d.company_id = any($1)', 'd.deleted_at is null'];
  if (opts.stage?.length) {
    params.push(opts.stage);
    where.push(`d.stage = any($${params.length})`);
  }
  return sql<DealRow>(
    `select d.*, co.name as company_name, u.name as owner_name,
            cl.name as client_name, o.name as organization_name
     from deals d
     join companies co on co.id = d.company_id
     left join users u on u.id = d.owner_user_id
     left join clients cl on cl.id = d.client_id
     left join organizations o on o.id = d.organization_id
     where ${where.join(' and ')}
     order by d.expected_close nulls last, d.value desc`,
    params,
  );
}

/** Contacts attached to a client, for the detail page. */
export async function getClientContacts(clientId: string) {
  return sql<{
    id: string; full_name: string; email: string | null; phone: string | null;
    title: string | null; role: string; is_primary: boolean;
  }>(
    `select c.id, trim(c.first_name || ' ' || coalesce(c.last_name,'')) as full_name,
            c.email, c.phone, c.title, cc.role, cc.is_primary
     from client_contacts cc
     join contacts c on c.id = cc.contact_id
     where cc.client_id = $1 and c.deleted_at is null
     order by cc.is_primary desc, c.first_name`,
    [clientId],
  );
}

export async function getClientTeam(clientId: string) {
  return sql<{ id: string; name: string; email: string; role: string; allocation_pct: number }>(
    `select u.id, u.name, u.email, ct.role, ct.allocation_pct
     from client_team ct join users u on u.id = ct.user_id
     where ct.client_id = $1
     order by ct.allocation_pct desc, u.name`,
    [clientId],
  );
}

export async function getClientFinance(clientId: string) {
  const [invoices, payments] = await Promise.all([
    sql<{
      id: string; number: string; status: string; issue_date: string; due_date: string | null;
      total: number; amount_due: number; currency: string; source: string; is_demo: boolean;
    }>(
      `select id, number, status, issue_date, due_date, total, amount_due, currency, source, is_demo
       from invoices where client_id = $1 and deleted_at is null
       order by issue_date desc limit 50`,
      [clientId],
    ),
    sql<{
      id: string; amount: number; currency: string; status: string; method: string | null;
      occurred_at: Date; description: string | null; source: string; is_demo: boolean;
    }>(
      `select id, amount, currency, status, method, occurred_at, description, source, is_demo
       from payments where client_id = $1 and deleted_at is null
       order by occurred_at desc limit 50`,
      [clientId],
    ),
  ]);
  return { invoices, payments };
}
