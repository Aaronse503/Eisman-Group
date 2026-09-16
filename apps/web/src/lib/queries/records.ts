import { sql } from '@/lib/db/client';

/**
 * Generic per-record sidecars: notes, comments, tags, custom fields,
 * attachments and the activity timeline. Every major record uses these, which
 * is why they are addressed by (entityType, entityId) rather than by table.
 */

export interface RecordNote {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  author_name: string | null;
  created_at: Date;
  updated_at: Date;
  is_demo: boolean;
}

export async function getNotes(entityType: string, entityId: string) {
  return sql<RecordNote>(
    `select n.id, n.title, n.body, n.pinned, u.name as author_name,
            n.created_at, n.updated_at, n.is_demo
     from notes n left join users u on u.id = n.author_user_id
     where n.entity_type = $1 and n.entity_id = $2 and n.deleted_at is null
     order by n.pinned desc, n.created_at desc`,
    [entityType, entityId],
  );
}

export interface RecordComment {
  id: string;
  body: string;
  user_id: string | null;
  user_name: string | null;
  avatar_url: string | null;
  created_at: Date;
}

export async function getComments(entityType: string, entityId: string) {
  return sql<RecordComment>(
    `select c.id, c.body, c.user_id, u.name as user_name, u.avatar_url, c.created_at
     from comments c left join users u on u.id = c.user_id
     where c.entity_type = $1 and c.entity_id = $2 and c.deleted_at is null
     order by c.created_at`,
    [entityType, entityId],
  );
}

export interface RecordTag {
  id: string;
  name: string;
  color: string;
}

export async function getTags(entityType: string, entityId: string) {
  return sql<RecordTag>(
    `select t.id, t.name, t.color from taggings tg
     join tags t on t.id = tg.tag_id
     where tg.entity_type = $1 and tg.entity_id = $2
     order by t.name`,
    [entityType, entityId],
  );
}

export async function getAvailableTags(companyId: string | null, kind?: string) {
  return sql<RecordTag>(
    `select id, name, color from tags
     where (company_id = $1 or company_id is null)
       and ($2::text is null or kind = $2 or kind = 'general')
     order by name`,
    [companyId, kind ?? null],
  );
}

export interface CustomField {
  def_id: string;
  key: string;
  label: string;
  field_type: string;
  options: string[];
  required: boolean;
  help_text: string | null;
  position: number;
  value: unknown;
}

export async function getCustomFields(
  entityType: string,
  entityId: string | null,
  companyId: string | null,
) {
  return sql<CustomField>(
    `select d.id as def_id, d.key, d.label, d.field_type, d.options, d.required,
            d.help_text, d.position, v.value
     from custom_field_defs d
     left join custom_field_values v on v.def_id = d.id and v.entity_id = $2
     where d.entity_type = $1 and d.archived_at is null
       and (d.company_id = $3 or d.company_id is null)
     order by d.position, d.label`,
    [entityType, entityId, companyId],
  );
}

export interface LinkedDocument {
  id: string;
  name: string;
  mime_type: string | null;
  byte_size: number;
  summary: string | null;
  created_at: Date;
  is_demo: boolean;
  uploaded_by: string | null;
}

export async function getLinkedDocuments(entityType: string, entityId: string) {
  return sql<LinkedDocument>(
    `select d.id, d.name, d.mime_type, d.byte_size, d.summary, d.created_at, d.is_demo,
            u.name as uploaded_by
     from document_links l
     join documents d on d.id = l.document_id
     left join users u on u.id = d.uploaded_by_id
     where l.entity_type = $1 and l.entity_id = $2 and d.deleted_at is null
     order by d.created_at desc`,
    [entityType, entityId],
  );
}

export interface RecordReminder {
  id: string;
  title: string;
  body: string | null;
  remind_at: Date;
  status: string;
  user_name: string | null;
}

export async function getReminders(entityType: string, entityId: string) {
  return sql<RecordReminder>(
    `select r.id, r.title, r.body, r.remind_at, r.status, u.name as user_name
     from reminders r left join users u on u.id = r.user_id
     where r.entity_type = $1 and r.entity_id = $2
     order by r.remind_at`,
    [entityType, entityId],
  );
}

export interface OutreachEntry {
  id: string;
  kind: string;
  direction: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  occurred_at: Date;
  user_name: string | null;
  contact_name: string | null;
}

export async function getOutreach(entityType: string, entityId: string, limit = 50) {
  return sql<OutreachEntry>(
    `select o.id, o.kind, o.direction, o.subject, o.body, o.outcome, o.occurred_at,
            u.name as user_name,
            trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as contact_name
     from outreach_activities o
     left join users u on u.id = o.user_id
     left join contacts c on c.id = o.contact_id
     where o.entity_type = $1 and o.entity_id = $2
     order by o.occurred_at desc limit $3`,
    [entityType, entityId, limit],
  );
}

/** All sidecars for a record in one round of queries. */
export async function getRecordSidecars(
  entityType: string,
  entityId: string,
  companyId: string | null,
) {
  const [notes, comments, tags, availableTags, customFields, documents, reminders] =
    await Promise.all([
      getNotes(entityType, entityId),
      getComments(entityType, entityId),
      getTags(entityType, entityId),
      getAvailableTags(companyId, entityType),
      getCustomFields(entityType, entityId, companyId),
      getLinkedDocuments(entityType, entityId),
      getReminders(entityType, entityId),
    ]);
  return { notes, comments, tags, availableTags, customFields, documents, reminders };
}
