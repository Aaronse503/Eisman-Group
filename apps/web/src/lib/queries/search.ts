import 'server-only';
import { sql } from '@/lib/db/client';

export interface GlobalSearchHit {
  id: string;
  type:
    | 'client'
    | 'contact'
    | 'organization'
    | 'task'
    | 'meeting'
    | 'document'
    | 'note'
    | 'partnership'
    | 'investor'
    | 'parfax_user';
  typeLabel: string;
  label: string;
  sublabel: string | null;
  href: string;
  company: string | null;
  isDemo: boolean;
}

/**
 * Global search across the records a person can reach.
 *
 * The company filter is part of every query rather than applied to the
 * results, so a record from a company the caller cannot read is never
 * retrieved in the first place. Investors are holdings-level and are included
 * only when the caller may read them.
 */
export async function globalSearch(opts: {
  term: string;
  companyIds: string[];
  canReadInvestors: boolean;
  canReadParfax: boolean;
  limitPerType?: number;
}): Promise<GlobalSearchHit[]> {
  const term = opts.term.trim();
  if (term.length < 2 || !opts.companyIds.length) return [];

  const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const limit = opts.limitPerType ?? 5;
  const ids = opts.companyIds;

  const [clients, contacts, organizations, tasks, meetings, documents, notes, partnerships] =
    await Promise.all([
      sql<{ id: string; name: string; status: string; company: string; is_demo: boolean }>(
        `select c.id, c.name, c.status, co.name as company, c.is_demo
         from clients c join companies co on co.id = c.company_id
         where c.company_id = any($1) and c.deleted_at is null and c.name ilike $2
         order by c.name limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; full_name: string; title: string | null; company: string; is_demo: boolean }>(
        // full_name is composed rather than stored, so match on the parts.
        `select ct.id,
                trim(ct.first_name || ' ' || coalesce(ct.last_name, '')) as full_name,
                ct.title, co.name as company, ct.is_demo
         from contacts ct join companies co on co.id = ct.company_id
         where ct.company_id = any($1) and ct.deleted_at is null
           and (ct.first_name ilike $2 or ct.last_name ilike $2 or ct.email ilike $2
                or trim(ct.first_name || ' ' || coalesce(ct.last_name, '')) ilike $2)
         order by ct.first_name, ct.last_name limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; name: string; industry: string | null; company: string; is_demo: boolean }>(
        `select o.id, o.name, o.industry, co.name as company, o.is_demo
         from organizations o join companies co on co.id = o.company_id
         where o.company_id = any($1) and o.deleted_at is null and o.name ilike $2
         order by o.name limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; title: string; status: string; company: string; is_demo: boolean }>(
        `select t.id, t.title, t.status, co.name as company, t.is_demo
         from tasks t join companies co on co.id = t.company_id
         where t.company_id = any($1) and t.deleted_at is null and t.title ilike $2
         order by t.due_at nulls last limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; title: string; starts_at: Date; company: string; is_demo: boolean }>(
        `select m.id, m.title, m.starts_at, co.name as company, m.is_demo
         from meetings m join companies co on co.id = m.company_id
         where m.company_id = any($1) and m.deleted_at is null and m.title ilike $2
         order by m.starts_at desc limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; name: string; summary: string | null; company: string; is_demo: boolean }>(
        `select d.id, d.name, d.summary, co.name as company, d.is_demo
         from documents d join companies co on co.id = d.company_id
         where d.company_id = any($1) and d.deleted_at is null and d.is_current
           and (d.name ilike $2 or d.summary ilike $2)
         order by d.updated_at desc limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; title: string; company: string; is_demo: boolean }>(
        `select n.id, n.title, co.name as company, n.is_demo
         from notes n join companies co on co.id = n.company_id
         where n.company_id = any($1) and n.deleted_at is null
           and (n.title ilike $2 or n.body ilike $2)
         order by n.created_at desc limit $3`,
        [ids, like, limit],
      ),
      sql<{ id: string; name: string; stage: string; company: string; is_demo: boolean }>(
        `select p.id, p.name, p.stage, co.name as company, p.is_demo
         from partnerships p join companies co on co.id = p.company_id
         where p.company_id = any($1) and p.deleted_at is null and p.name ilike $2
         order by p.name limit $3`,
        [ids, like, limit],
      ),
    ]);

  const investors = opts.canReadInvestors
    ? await sql<{ id: string; name: string; stage: string; is_demo: boolean }>(
        `select id, name, pipeline_stage as stage, is_demo from investors
         where deleted_at is null and name ilike $1
         order by name limit $2`,
        [like, limit],
      )
    : [];

  const parfaxUsers = opts.canReadParfax
    ? await sql<{ id: string; email: string; name: string | null; plan: string; is_demo: boolean }>(
        `select id, email, name, plan, is_demo from parfax_users
         where deleted_at is null and (email ilike $1 or name ilike $1)
         order by signup_at desc limit $2`,
        [like, limit],
      )
    : [];

  const hits: GlobalSearchHit[] = [
    ...clients.map((r) => ({
      id: r.id, type: 'client' as const, typeLabel: 'Client', label: r.name,
      sublabel: r.status, href: `/crm/clients/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...contacts.map((r) => ({
      id: r.id, type: 'contact' as const, typeLabel: 'Contact', label: r.full_name,
      sublabel: r.title, href: `/crm/contacts/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...organizations.map((r) => ({
      id: r.id, type: 'organization' as const, typeLabel: 'Organization', label: r.name,
      sublabel: r.industry, href: `/crm/organizations/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...tasks.map((r) => ({
      id: r.id, type: 'task' as const, typeLabel: 'Task', label: r.title,
      sublabel: r.status, href: `/tasks/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...meetings.map((r) => ({
      id: r.id, type: 'meeting' as const, typeLabel: 'Meeting', label: r.title,
      sublabel: new Date(r.starts_at).toISOString().slice(0, 10),
      href: `/calendar/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...documents.map((r) => ({
      id: r.id, type: 'document' as const, typeLabel: 'Document', label: r.name,
      sublabel: r.summary, href: `/knowledge/documents/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...notes.map((r) => ({
      id: r.id, type: 'note' as const, typeLabel: 'Note', label: r.title,
      sublabel: null, href: `/knowledge/notes/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...partnerships.map((r) => ({
      id: r.id, type: 'partnership' as const, typeLabel: 'Partnership', label: r.name,
      sublabel: r.stage, href: `/partnerships/${r.id}`, company: r.company, isDemo: r.is_demo,
    })),
    ...investors.map((r) => ({
      id: r.id, type: 'investor' as const, typeLabel: 'Investor', label: r.name,
      sublabel: r.stage, href: `/investors/${r.id}`, company: null, isDemo: r.is_demo,
    })),
    ...parfaxUsers.map((r) => ({
      id: r.id, type: 'parfax_user' as const, typeLabel: 'ParFax user',
      label: r.name ?? r.email, sublabel: r.plan,
      href: `/parfax/users/${r.id}`, company: 'ParFax', isDemo: r.is_demo,
    })),
  ];

  // An exact prefix match is almost always what was meant, so lift those.
  const lower = term.toLowerCase();
  return hits.sort((a, b) => {
    const aStarts = a.label.toLowerCase().startsWith(lower) ? 0 : 1;
    const bStarts = b.label.toLowerCase().startsWith(lower) ? 0 : 1;
    return aStarts - bStarts || a.label.localeCompare(b.label);
  });
}
