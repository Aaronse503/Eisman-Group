import { sql, one } from '@/lib/db/client';
import type { InvestorRow, PartnershipRow } from '@/lib/domain/growth';

export type { InvestorRow, PartnershipRow };

const PARTNERSHIP_SELECT = `
  select p.*, co.name as company_name, o.name as organization_name, u.name as owner_name,
         (select count(*)::int from partnership_contacts pc where pc.partnership_id = p.id) as contacts,
         (select count(*)::int from tasks t
           where t.deleted_at is null and t.status not in ('done','cancelled')
             and exists (select 1 from relationships r
                         where r.from_type = 'partnership' and r.from_id = p.id
                           and r.to_type = 'task' and r.to_id = t.id)) as open_tasks
  from partnerships p
  join companies co on co.id = p.company_id
  left join organizations o on o.id = p.organization_id
  left join users u on u.id = p.owner_user_id`;

export async function listPartnerships(opts: {
  companyIds: string[];
  stage?: string[];
  category?: string;
}): Promise<PartnershipRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['p.company_id = any($1)', 'p.deleted_at is null', 'p.archived_at is null'];
  if (opts.stage?.length) {
    params.push(opts.stage);
    where.push(`p.stage = any($${params.length})`);
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`p.category = $${params.length}`);
  }
  return sql<PartnershipRow>(
    `${PARTNERSHIP_SELECT} where ${where.join(' and ')} order by p.position, p.name`,
    params,
  );
}

export async function getPartnership(id: string) {
  const row = await one<PartnershipRow & { company_slug: string }>(
    `${PARTNERSHIP_SELECT} where p.id = $1 and p.deleted_at is null`,
    [id],
  );
  if (!row) return null;
  const slug = await one<{ slug: string }>(`select slug from companies where id = $1`, [row.company_id]);
  return { ...row, company_slug: slug?.slug ?? '' };
}

export async function getPartnershipContacts(partnershipId: string) {
  return sql<{
    id: string; full_name: string; email: string | null; phone: string | null;
    title: string | null; role: string; is_primary: boolean;
  }>(
    `select c.id, trim(c.first_name || ' ' || coalesce(c.last_name,'')) as full_name,
            c.email, c.phone, c.title, pc.role, pc.is_primary
     from partnership_contacts pc
     join contacts c on c.id = pc.contact_id
     where pc.partnership_id = $1 and c.deleted_at is null
     order by pc.is_primary desc, c.first_name`,
    [partnershipId],
  );
}

// -------------------------------------------------------------- investors

const INVESTOR_SELECT = `
  select i.*, u.name as owner_name, pc.name as pitching_company_name,
         (select count(*)::int from investor_contacts ic where ic.investor_id = i.id) as contact_count,
         (select count(*)::int from outreach_activities a
           where a.entity_type = 'investor' and a.entity_id = i.id) as interaction_count,
         (select trim(c.first_name || ' ' || coalesce(c.last_name,''))
            from investor_contacts ic join contacts c on c.id = ic.contact_id
            where ic.investor_id = i.id order by ic.is_primary desc limit 1) as primary_contact
  from investors i
  left join users u on u.id = i.owner_user_id
  left join companies pc on pc.id = i.pitching_company_id`;

/**
 * Investors are holdings-level. `companyIds` scopes them to what the caller can
 * read: an investor is visible when it is pitched by, or scoped to, one of
 * those companies.
 */
export async function listInvestors(opts: {
  companyIds: string[];
  stage?: string[];
  ownerId?: string;
  followUpWithinDays?: number;
  search?: string;
}): Promise<InvestorRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = [
    'i.deleted_at is null',
    'i.archived_at is null',
    '(i.pitching_company_id = any($1) or i.company_id = any($1))',
  ];
  if (opts.stage?.length) {
    params.push(opts.stage);
    where.push(`i.pipeline_stage = any($${params.length})`);
  }
  if (opts.ownerId) {
    params.push(opts.ownerId);
    where.push(`i.owner_user_id = $${params.length}`);
  }
  if (typeof opts.followUpWithinDays === 'number') {
    params.push(opts.followUpWithinDays);
    where.push(
      `i.next_follow_up_at is not null and i.next_follow_up_at <= now() + make_interval(days => $${params.length}::int)`,
    );
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(i.name ilike $${params.length} or i.notes ilike $${params.length})`);
  }
  return sql<InvestorRow>(
    `${INVESTOR_SELECT} where ${where.join(' and ')} order by i.probability desc, i.name`,
    params,
  );
}

export async function getInvestor(id: string) {
  return one<InvestorRow>(`${INVESTOR_SELECT} where i.id = $1 and i.deleted_at is null`, [id]);
}

export async function getInvestorContacts(investorId: string) {
  return sql<{
    id: string; full_name: string; email: string | null; title: string | null;
    role: string; is_primary: boolean; linkedin_url: string | null;
  }>(
    `select c.id, trim(c.first_name || ' ' || coalesce(c.last_name,'')) as full_name,
            c.email, c.title, ic.role, ic.is_primary, c.linkedin_url
     from investor_contacts ic
     join contacts c on c.id = ic.contact_id
     where ic.investor_id = $1 and c.deleted_at is null
     order by ic.is_primary desc, c.first_name`,
    [investorId],
  );
}

export async function getInvestorPipelineSummary(companyIds: string[]) {
  if (!companyIds.length) return [];
  return sql<{ stage: string; count: number; value: number; weighted: number }>(
    `select i.pipeline_stage as stage, count(*)::int as count,
            coalesce(sum(i.potential_amount), 0) as value,
            coalesce(sum(i.potential_amount * i.probability / 100.0), 0) as weighted
     from investors i
     where i.deleted_at is null and i.archived_at is null
       and (i.pitching_company_id = any($1) or i.company_id = any($1))
     group by i.pipeline_stage`,
    [companyIds],
  );
}

/** Flags likely duplicates by normalised name, so they can be merged by hand. */
export async function findInvestorDuplicates(companyIds: string[]) {
  if (!companyIds.length) return [];
  return sql<{ normalized: string; ids: string[]; names: string[] }>(
    `select lower(regexp_replace(i.name, '[^a-zA-Z0-9]', '', 'g')) as normalized,
            array_agg(i.id) as ids, array_agg(i.name) as names
     from investors i
     where i.deleted_at is null
       and (i.pitching_company_id = any($1) or i.company_id = any($1))
     group by 1 having count(*) > 1`,
    [companyIds],
  );
}

export async function listMessageTemplates(companyIds: string[], category?: string) {
  return sql<{
    id: string; name: string; category: string; channel: string;
    subject: string | null; body: string; variables: string[]; company_name: string | null;
  }>(
    `select t.id, t.name, t.category, t.channel, t.subject, t.body, t.variables,
            co.name as company_name
     from message_templates t
     left join companies co on co.id = t.company_id
     where (t.company_id is null or t.company_id = any($1))
       and t.archived_at is null
       and ($2::text is null or t.category = $2)
     order by t.category, t.name`,
    [companyIds, category ?? null],
  );
}
