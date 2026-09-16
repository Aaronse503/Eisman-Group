import { sql, one } from '@/lib/db/client';

export interface DocumentRow {
  id: string;
  company_id: string;
  company_name: string;
  folder_id: string | null;
  folder_name: string | null;
  name: string;
  description: string | null;
  kind: string;
  link_url: string | null;
  mime_type: string | null;
  byte_size: number;
  storage_driver: string;
  version: number;
  version_group: string;
  is_current: boolean;
  access_level: string;
  text_status: string;
  text_error: string | null;
  page_count: number | null;
  ai_status: string;
  ai_provider: string | null;
  ai_model: string | null;
  ai_generated_at: Date | null;
  summary: string | null;
  key_points: string[];
  extracted_action_items: string[];
  extracted_people: string[];
  extracted_orgs: string[];
  extracted_dates: string[];
  uploaded_by: string | null;
  is_demo: boolean;
  created_at: Date;
  updated_at: Date;
  link_count: number;
}

const SELECT = `
  select d.id, d.company_id, d.folder_id, d.name, d.description, d.kind, d.link_url,
         d.mime_type, d.byte_size, d.storage_driver, d.version, d.version_group, d.is_current,
         d.access_level, d.text_status, d.text_error, d.page_count, d.ai_status, d.ai_provider,
         d.ai_model, d.ai_generated_at, d.summary, d.key_points, d.extracted_action_items,
         d.extracted_people, d.extracted_orgs, d.extracted_dates, d.is_demo, d.created_at,
         d.updated_at,
         co.name as company_name, f.name as folder_name, u.name as uploaded_by,
         (select count(*)::int from document_links l where l.document_id = d.id) as link_count
  from documents d
  join companies co on co.id = d.company_id
  left join folders f on f.id = d.folder_id
  left join users u on u.id = d.uploaded_by_id`;

/**
 * `accessLevels` must be the set the caller is allowed to see. Restricted
 * documents are filtered in SQL, so they never reach the page.
 */
export async function listDocuments(opts: {
  companyIds: string[];
  accessLevels: string[];
  folderId?: string;
  search?: string;
}): Promise<DocumentRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds, opts.accessLevels];
  const where = [
    'd.company_id = any($1)',
    'd.deleted_at is null',
    'd.is_current = true',
    'd.access_level = any($2)',
  ];
  if (opts.folderId) {
    params.push(opts.folderId);
    where.push(`d.folder_id = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(
      `(d.name ilike $${params.length} or d.summary ilike $${params.length} or d.extracted_text ilike $${params.length})`,
    );
  }
  return sql<DocumentRow>(
    `${SELECT} where ${where.join(' and ')} order by d.updated_at desc limit 500`,
    params,
  );
}

export async function getDocument(id: string) {
  const doc = await one<DocumentRow & { extracted_text: string | null; company_slug: string; storage_key: string | null }>(
    `${SELECT.replace('d.updated_at,', 'd.updated_at, d.extracted_text, d.storage_key,')}
     where d.id = $1 and d.deleted_at is null`,
    [id],
  );
  if (!doc) return null;
  const slug = await one<{ slug: string }>(`select slug from companies where id = $1`, [doc.company_id]);
  return { ...doc, company_slug: slug?.slug ?? '' };
}

export async function getDocumentVersions(versionGroup: string) {
  return sql<{
    id: string; version: number; is_current: boolean; byte_size: number;
    created_at: Date; uploaded_by: string | null;
  }>(
    `select d.id, d.version, d.is_current, d.byte_size, d.created_at, u.name as uploaded_by
     from documents d left join users u on u.id = d.uploaded_by_id
     where d.version_group = $1 and d.deleted_at is null
     order by d.version desc`,
    [versionGroup],
  );
}

export async function getDocumentLinks(documentId: string) {
  return sql<{ entity_type: string; entity_id: string; label: string | null }>(
    `select l.entity_type, l.entity_id,
       case l.entity_type
         when 'client' then (select name from clients where id = l.entity_id)
         when 'contact' then (select trim(first_name || ' ' || coalesce(last_name,'')) from contacts where id = l.entity_id)
         when 'organization' then (select name from organizations where id = l.entity_id)
         when 'partnership' then (select name from partnerships where id = l.entity_id)
         when 'investor' then (select name from investors where id = l.entity_id)
         when 'task' then (select title from tasks where id = l.entity_id)
         when 'meeting' then (select title from meetings where id = l.entity_id)
         when 'member' then (select full_name from members where id = l.entity_id)
         else null end as label
     from document_links l where l.document_id = $1`,
    [documentId],
  );
}

export async function listFolders(companyIds: string[]) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; company_id: string; company_name: string; name: string;
    description: string | null; document_count: number;
  }>(
    `select f.id, f.company_id, co.name as company_name, f.name, f.description,
            (select count(*)::int from documents d
              where d.folder_id = f.id and d.deleted_at is null and d.is_current) as document_count
     from folders f join companies co on co.id = f.company_id
     where f.company_id = any($1) and f.archived_at is null
     order by co.name, f.name`,
    [companyIds],
  );
}

export async function listNotes(opts: { companyIds: string[]; search?: string }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['n.company_id = any($1)', 'n.deleted_at is null'];
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(n.title ilike $${params.length} or n.body ilike $${params.length})`);
  }
  return sql<{
    id: string; company_id: string; company_name: string; title: string; body: string;
    entity_type: string | null; entity_id: string | null; pinned: boolean;
    author_name: string | null; created_at: Date; updated_at: Date; is_demo: boolean;
  }>(
    `select n.id, n.company_id, co.name as company_name, n.title, n.body, n.entity_type,
            n.entity_id, n.pinned, u.name as author_name, n.created_at, n.updated_at, n.is_demo
     from notes n
     join companies co on co.id = n.company_id
     left join users u on u.id = n.author_user_id
     where ${where.join(' and ')}
     order by n.pinned desc, n.updated_at desc limit 300`,
    params,
  );
}

export async function getNote(id: string) {
  return one<{
    id: string; company_id: string; company_name: string; title: string; body: string;
    entity_type: string | null; entity_id: string | null; pinned: boolean;
    author_name: string | null; created_at: Date; updated_at: Date; is_demo: boolean;
  }>(
    `select n.id, n.company_id, co.name as company_name, n.title, n.body, n.entity_type,
            n.entity_id, n.pinned, u.name as author_name, n.created_at, n.updated_at, n.is_demo
     from notes n
     join companies co on co.id = n.company_id
     left join users u on u.id = n.author_user_id
     where n.id = $1 and n.deleted_at is null`,
    [id],
  );
}

export async function getKnowledgeStats(companyIds: string[]) {
  if (!companyIds.length) return { documents: 0, notes: 0, chunks: 0, indexed: 0, needsOcr: 0 };
  const [row] = await sql<{
    documents: number; notes: number; chunks: number; indexed: number; needs_ocr: number;
  }>(
    `select
       (select count(*)::int from documents where company_id = any($1) and deleted_at is null and is_current) as documents,
       (select count(*)::int from notes where company_id = any($1) and deleted_at is null) as notes,
       (select count(*)::int from knowledge_chunks where company_id = any($1)) as chunks,
       (select count(distinct source_id)::int from knowledge_chunks where company_id = any($1)) as indexed,
       (select count(*)::int from documents
         where company_id = any($1) and deleted_at is null and text_status = 'unsupported') as needs_ocr`,
    [companyIds],
  );
  return {
    documents: row!.documents,
    notes: row!.notes,
    chunks: row!.chunks,
    indexed: row!.indexed,
    needsOcr: row!.needs_ocr,
  };
}

/**
 * Suggests documents related to this one by shared full-text terms. Scoped to
 * the same company, so a suggestion can never cross a tenant boundary.
 */
export async function getRelatedDocuments(documentId: string, companyId: string, limit = 5) {
  return sql<{ id: string; name: string; summary: string | null; score: number }>(
    `with source as (
       select string_agg(content, ' ') as body from knowledge_chunks
       where source_type = 'document' and source_id = $1
     )
     select d.id, d.name, d.summary,
            ts_rank(k.tsv, plainto_tsquery('english', left((select body from source), 800))) as score
     from knowledge_chunks k
     join documents d on d.id = k.source_id
     where k.company_id = $2 and k.source_type = 'document' and k.source_id <> $1
       and d.deleted_at is null and d.is_current
       and k.tsv @@ plainto_tsquery('english', left((select body from source), 800))
     group by d.id, d.name, d.summary, score
     order by score desc limit $3`,
    [documentId, companyId, limit],
  );
}

/** Access levels a set of permissions may read. */
export function allowedAccessLevels(opts: {
  restricted: boolean;
  finance: boolean;
  investor: boolean;
  hr: boolean;
}): string[] {
  const levels = ['company'];
  if (opts.finance) levels.push('finance');
  if (opts.investor) levels.push('investor');
  if (opts.hr) levels.push('hr');
  if (opts.restricted) levels.push('restricted', 'finance', 'investor', 'hr');
  return [...new Set(levels)];
}
