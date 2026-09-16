'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireActor, requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { indexSource, removeFromIndex } from '@/lib/knowledge/index-content';
import type { ActionResult } from '@/lib/validation/schemas';
import type { Permission } from '@/lib/rbac/permissions';
import { rethrowControlFlow } from '@/lib/action-errors';

/**
 * Generic sidecar actions, addressed by (entityType, entityId).
 *
 * Authorization: the caller must be able to write to the company that owns the
 * parent record, which is resolved from the database rather than trusted from
 * the client.
 */

const ENTITY_TABLES: Record<string, { table: string; label: string; permission: Permission }> = {
  client: { table: 'clients', label: 'name', permission: 'crm:write' },
  contact: { table: 'contacts', label: 'first_name', permission: 'crm:write' },
  organization: { table: 'organizations', label: 'name', permission: 'crm:write' },
  deal: { table: 'deals', label: 'name', permission: 'crm:write' },
  task: { table: 'tasks', label: 'title', permission: 'task:write' },
  project: { table: 'projects', label: 'name', permission: 'task:write' },
  meeting: { table: 'meetings', label: 'title', permission: 'calendar:write' },
  partnership: { table: 'partnerships', label: 'name', permission: 'partnership:write' },
  investor: { table: 'investors', label: 'name', permission: 'investor:write' },
  member: { table: 'members', label: 'full_name', permission: 'team:write' },
  document: { table: 'documents', label: 'name', permission: 'knowledge:write' },
  parfax_user: { table: 'parfax_users', label: 'email', permission: 'parfax:user_admin' },
  invoice: { table: 'invoices', label: 'number', permission: 'finance:write' },
};

interface ResolvedParent {
  companyId: string | null;
  label: string;
  permission: Permission;
}

async function resolveParent(entityType: string, entityId: string): Promise<ResolvedParent> {
  const meta = ENTITY_TABLES[entityType];
  if (!meta) throw new Error(`Unsupported record type: ${entityType}`);

  // parfax_users has no company_id; it belongs to the ParFax company.
  if (entityType === 'parfax_user') {
    const row = await one<{ label: string }>(`select email as label from parfax_users where id = $1`, [entityId]);
    if (!row) throw new Error('Record not found.');
    const company = await one<{ id: string }>(`select id from companies where slug = 'parfax'`);
    return { companyId: company?.id ?? null, label: row.label, permission: meta.permission };
  }

  const row = await one<{ company_id: string | null; label: string }>(
    `select company_id, ${meta.label}::text as label from ${meta.table} where id = $1`,
    [entityId],
  );
  if (!row) throw new Error('Record not found.');
  return { companyId: row.company_id, label: row.label, permission: meta.permission };
}

async function authorize(entityType: string, entityId: string) {
  const parent = await resolveParent(entityType, entityId);
  const actor = parent.companyId ? await requireCompanyAccess(parent.companyId) : await requireActor();
  if (!actor.can(parent.permission, parent.companyId)) {
    throw new ForbiddenError(parent.permission, parent.companyId);
  }
  return { actor, parent };
}

function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return fn().catch((err) => {
    rethrowControlFlow(err);
    if (err instanceof ForbiddenError) {
      return { ok: false as const, error: 'You do not have permission to change this record.' };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : 'Something went wrong.' };
  });
}

// ------------------------------------------------------------------- notes

const noteSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  title: z.string().trim().min(1, 'Give the note a title').max(200),
  body: z.string().trim().max(50_000).default(''),
  pinned: z.boolean().default(false),
});

export async function addNoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid note.' };
    }
    const { entityType, entityId, title, body, pinned } = parsed.data;
    const { actor, parent } = await authorize(entityType, entityId);
    if (!parent.companyId) return { ok: false, error: 'This record has no company to attach a note to.' };

    const note = await one<{ id: string }>(
      `insert into notes (company_id, title, body, entity_type, entity_id, author_user_id, pinned)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [parent.companyId, title, body, entityType, entityId, actor.user.id, pinned],
    );
    await indexSource({
      companyId: parent.companyId,
      sourceType: 'note',
      sourceId: note!.id,
      sourceTitle: title,
      sourceUrl: `/knowledge/notes/${note!.id}`,
      content: `${title}\n\n${body}`,
    });
    await recordActivity({
      actor,
      companyId: parent.companyId,
      entityType,
      entityId,
      action: 'note_added',
      summary: `Added a note to ${parent.label}: ${title}`,
    });
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: note!.id } };
  });
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult<null>> {
  return guard(async () => {
    const note = await one<{ company_id: string; title: string; entity_type: string | null; entity_id: string | null }>(
      `select company_id, title, entity_type, entity_id from notes where id = $1 and deleted_at is null`,
      [noteId],
    );
    if (!note) return { ok: false, error: 'Note not found.' };
    const actor = await requireCompanyAccess(note.company_id);
    if (!actor.can('knowledge:write', note.company_id)) {
      return { ok: false, error: 'You do not have permission to delete this note.' };
    }
    await sql(`update notes set deleted_at = now() where id = $1`, [noteId]);
    await removeFromIndex('note', noteId);
    await recordAudit({
      actor,
      companyId: note.company_id,
      action: 'note.deleted',
      entityType: 'note',
      entityId: noteId,
      entityLabel: note.title,
      severity: 'notice',
    });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  });
}

// ---------------------------------------------------------------- comments

const commentSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  body: z.string().trim().min(1, 'Write something first').max(10_000),
});

export async function addCommentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const parsed = commentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid comment.' };
    }
    const { entityType, entityId, body } = parsed.data;
    const { actor, parent } = await authorize(entityType, entityId);
    const comment = await one<{ id: string }>(
      `insert into comments (company_id, entity_type, entity_id, user_id, body)
       values ($1,$2,$3,$4,$5) returning id`,
      [parent.companyId, entityType, entityId, actor.user.id, body],
    );
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: comment!.id } };
  });
}

export async function deleteCommentAction(commentId: string): Promise<ActionResult<null>> {
  return guard(async () => {
    const actor = await requireActor();
    const comment = await one<{ user_id: string | null; company_id: string | null }>(
      `select user_id, company_id from comments where id = $1 and deleted_at is null`,
      [commentId],
    );
    if (!comment) return { ok: false, error: 'Comment not found.' };
    const isOwn = comment.user_id === actor.user.id;
    if (!isOwn && !actor.can('company:write', comment.company_id)) {
      return { ok: false, error: 'You can only delete your own comments.' };
    }
    await sql(`update comments set deleted_at = now() where id = $1`, [commentId]);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  });
}

// -------------------------------------------------------------------- tags

const tagsSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  tagNames: z.array(z.string().trim().min(1).max(40)).max(30),
});

export async function setTagsAction(input: unknown): Promise<ActionResult<null>> {
  return guard(async () => {
    const parsed = tagsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid tags.' };
    const { entityType, entityId, tagNames } = parsed.data;
    const { actor, parent } = await authorize(entityType, entityId);

    const ids: string[] = [];
    for (const name of [...new Set(tagNames)]) {
      const existing = await one<{ id: string }>(
        `select id from tags
         where lower(name) = lower($1)
           and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
        [name, parent.companyId],
      );
      if (existing) {
        ids.push(existing.id);
      } else {
        const created = await one<{ id: string }>(
          `insert into tags (company_id, name, kind) values ($1,$2,$3) returning id`,
          [parent.companyId, name, entityType],
        );
        ids.push(created!.id);
      }
    }

    await sql(`delete from taggings where entity_type = $1 and entity_id = $2`, [entityType, entityId]);
    for (const tagId of ids) {
      await sql(
        `insert into taggings (tag_id, entity_type, entity_id) values ($1,$2,$3)
         on conflict do nothing`,
        [tagId, entityType, entityId],
      );
    }
    await recordActivity({
      actor,
      companyId: parent.companyId,
      entityType,
      entityId,
      action: 'tags_updated',
      summary: `Updated tags on ${parent.label}`,
      meta: { tags: tagNames },
    });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  });
}

// ----------------------------------------------------------- custom fields

const customFieldsSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  values: z.record(z.string(), z.unknown()),
});

export async function setCustomFieldsAction(input: unknown): Promise<ActionResult<null>> {
  return guard(async () => {
    const parsed = customFieldsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid field values.' };
    const { entityType, entityId, values } = parsed.data;
    const { actor, parent } = await authorize(entityType, entityId);

    for (const [defId, value] of Object.entries(values)) {
      const def = await one<{ id: string; required: boolean; label: string }>(
        `select id, required, label from custom_field_defs
         where id = $1 and entity_type = $2 and archived_at is null`,
        [defId, entityType],
      );
      if (!def) continue;
      const empty = value === null || value === undefined || value === '';
      if (def.required && empty) {
        return { ok: false, error: `${def.label} is required.` };
      }
      if (empty) {
        await sql(`delete from custom_field_values where def_id = $1 and entity_id = $2`, [defId, entityId]);
        continue;
      }
      await sql(
        `insert into custom_field_values (def_id, entity_type, entity_id, value)
         values ($1,$2,$3,$4)
         on conflict (def_id, entity_id) do update set value = excluded.value, updated_at = now()`,
        [defId, entityType, entityId, JSON.stringify(value)],
      );
    }
    await recordActivity({
      actor,
      companyId: parent.companyId,
      entityType,
      entityId,
      action: 'fields_updated',
      summary: `Updated custom fields on ${parent.label}`,
    });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  });
}

// --------------------------------------------------------------- reminders

const reminderSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  title: z.string().trim().min(1, 'Give the reminder a title').max(200),
  body: z.string().trim().max(2000).optional(),
  remindAt: z.string().min(1, 'Choose when to be reminded'),
});

export async function addReminderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const parsed = reminderSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid reminder.' };
    }
    const { entityType, entityId, title, body, remindAt } = parsed.data;
    const when = new Date(remindAt);
    if (Number.isNaN(when.getTime())) return { ok: false, error: 'Enter a valid date and time.' };
    const { actor, parent } = await authorize(entityType, entityId);
    const reminder = await one<{ id: string }>(
      `insert into reminders (company_id, user_id, entity_type, entity_id, title, body, remind_at)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [parent.companyId, actor.user.id, entityType, entityId, title, body ?? null, when],
    );
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: reminder!.id } };
  });
}

export async function dismissReminderAction(reminderId: string): Promise<ActionResult<null>> {
  return guard(async () => {
    const actor = await requireActor();
    await sql(`update reminders set status = 'dismissed' where id = $1 and user_id = $2`, [
      reminderId,
      actor.user.id,
    ]);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  });
}

// ------------------------------------------------------- outreach activity

const outreachSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  kind: z.enum(['email', 'call', 'meeting', 'linkedin', 'text', 'note', 'intro', 'material_sent']),
  direction: z.enum(['outbound', 'inbound', 'internal']).default('outbound'),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20_000).optional(),
  outcome: z.string().trim().max(300).optional(),
  occurredAt: z.string().optional(),
});

export async function logOutreachAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const parsed = outreachSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid entry.' };
    }
    const data = parsed.data;
    const { actor, parent } = await authorize(data.entityType, data.entityId);
    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    const entry = await one<{ id: string }>(
      `insert into outreach_activities
         (company_id, entity_type, entity_id, kind, direction, subject, body, outcome, occurred_at, user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        parent.companyId, data.entityType, data.entityId, data.kind, data.direction,
        data.subject ?? null, data.body ?? null, data.outcome ?? null, occurredAt, actor.user.id,
      ],
    );

    // Keep the "last contacted" field on the parent in step.
    if (data.entityType === 'investor') {
      await sql(`update investors set last_contact_at = greatest(coalesce(last_contact_at, $2), $2) where id = $1`, [
        data.entityId, occurredAt,
      ]);
    } else if (data.entityType === 'partnership') {
      await sql(`update partnerships set last_interaction_at = greatest(coalesce(last_interaction_at, $2), $2) where id = $1`, [
        data.entityId, occurredAt,
      ]);
    } else if (data.entityType === 'client') {
      await sql(`update clients set last_activity_at = greatest(coalesce(last_activity_at, $2), $2) where id = $1`, [
        data.entityId, occurredAt,
      ]);
    }

    await recordActivity({
      actor,
      companyId: parent.companyId,
      entityType: data.entityType,
      entityId: data.entityId,
      action: 'outreach_logged',
      summary: `Logged a ${data.kind.replace('_', ' ')} with ${parent.label}`,
    });
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: entry!.id } };
  });
}
