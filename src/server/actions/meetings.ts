'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, one } from '@/lib/db/client';
import { requireCompanyAccess, ForbiddenError } from '@/lib/auth/actor';
import { recordActivity } from '@/lib/activity';
import { indexSource, removeFromIndex } from '@/lib/knowledge/index-content';
import { fieldErrors, type ActionResult } from '@/lib/validation/schemas';
import { actionItemSchema, meetingSchema } from '@/lib/validation/meetings';
import { rethrowControlFlow } from '@/lib/action-errors';

function fail(err: unknown): ActionResult<never> {
  rethrowControlFlow(err);
  if (err instanceof ForbiddenError) {
    return { ok: false, error: 'You do not have permission to change meetings in this company.' };
  }
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' };
}

async function requireCalendarWrite(companyId: string) {
  const actor = await requireCompanyAccess(companyId);
  if (!actor.can('calendar:write', companyId)) throw new ForbiddenError('calendar:write', companyId);
  return actor;
}

async function indexMeeting(id: string, companyId: string, m: { title: string; agenda: string | null; notes: string | null; decisions: string | null; startsAt: Date }) {
  const body = [
    `Meeting: ${m.title} on ${m.startsAt.toISOString().slice(0, 10)}`,
    m.agenda ? `Agenda: ${m.agenda}` : '',
    m.notes ? `Notes: ${m.notes}` : '',
    m.decisions ? `Decisions: ${m.decisions}` : '',
  ].filter(Boolean).join('\n\n');
  if (!body.trim()) {
    await removeFromIndex('meeting', id);
    return;
  }
  await indexSource({
    companyId,
    sourceType: 'meeting',
    sourceId: id,
    sourceTitle: m.title,
    sourceUrl: `/calendar/${id}`,
    content: body,
  });
}

async function saveParticipants(meetingId: string, userIds: string[], contactIds: string[], organizerId: string | null) {
  await sql(`delete from meeting_participants where meeting_id = $1`, [meetingId]);
  const seenUsers = new Set<string>();
  if (organizerId) {
    seenUsers.add(organizerId);
    await sql(
      `insert into meeting_participants (meeting_id, user_id, response, is_organizer)
       values ($1,$2,'accepted',true)`,
      [meetingId, organizerId],
    );
  }
  for (const userId of userIds) {
    if (seenUsers.has(userId)) continue;
    seenUsers.add(userId);
    await sql(
      `insert into meeting_participants (meeting_id, user_id, response) values ($1,$2,'needs_action')`,
      [meetingId, userId],
    );
  }
  for (const contactId of [...new Set(contactIds)]) {
    await sql(
      `insert into meeting_participants (meeting_id, contact_id, response) values ($1,$2,'needs_action')`,
      [meetingId, contactId],
    );
  }
}

export async function createMeetingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = meetingSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const actor = await requireCalendarWrite(data.companyId);
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    const calendar = await one<{ id: string }>(
      `select id from calendars where company_id = $1 and provider = 'internal' order by created_at limit 1`,
      [data.companyId],
    );

    const row = await one<{ id: string }>(
      `insert into meetings
         (company_id, calendar_id, client_id, project_id, organization_id, title, template,
          location, meeting_url, starts_at, ends_at, timezone, agenda, notes, decisions,
          follow_up_date, status, owner_user_id, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'internal')
       returning id`,
      [
        data.companyId, calendar?.id ?? null, data.clientId, data.projectId, data.organizationId,
        data.title, data.template, data.location, data.meetingUrl, startsAt, endsAt, data.timezone,
        data.agenda, data.notes, data.decisions, data.followUpDate, data.status,
        data.ownerUserId ?? actor.user.id,
      ],
    );

    await saveParticipants(
      row!.id,
      data.participantUserIds,
      data.participantContactIds,
      data.ownerUserId ?? actor.user.id,
    );
    await indexMeeting(row!.id, data.companyId, { ...data, startsAt });

    await recordActivity({
      actor, companyId: data.companyId, entityType: 'meeting', entityId: row!.id,
      action: 'created', summary: `Scheduled “${data.title}”`,
    });
    revalidatePath('/calendar');
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMeetingAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = meetingSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fields: fieldErrors(parsed.error) };
    }
    const data = parsed.data;
    const before = await one<{ company_id: string; source: string; owner_user_id: string | null }>(
      `select company_id, source, owner_user_id from meetings where id = $1 and deleted_at is null`,
      [id],
    );
    if (!before) return { ok: false, error: 'Meeting not found.' };
    const actor = await requireCalendarWrite(before.company_id);
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    // Times and titles on a synced event are owned by the source calendar; the
    // notes, decisions and associations are ours. Editing a synced event here
    // only changes the fields this system owns.
    const synced = before.source !== 'internal';
    if (synced) {
      await sql(
        `update meetings set agenda = $2, notes = $3, decisions = $4, follow_up_date = $5,
           template = $6, client_id = $7, project_id = $8, organization_id = $9
         where id = $1`,
        [id, data.agenda, data.notes, data.decisions, data.followUpDate, data.template,
         data.clientId, data.projectId, data.organizationId],
      );
    } else {
      await sql(
        `update meetings set
           title = $2, template = $3, location = $4, meeting_url = $5, starts_at = $6, ends_at = $7,
           timezone = $8, agenda = $9, notes = $10, decisions = $11, follow_up_date = $12,
           status = $13, client_id = $14, project_id = $15, organization_id = $16, owner_user_id = $17
         where id = $1`,
        [
          id, data.title, data.template, data.location, data.meetingUrl, startsAt, endsAt,
          data.timezone, data.agenda, data.notes, data.decisions, data.followUpDate, data.status,
          data.clientId, data.projectId, data.organizationId, data.ownerUserId,
        ],
      );
      await saveParticipants(
        id,
        data.participantUserIds,
        data.participantContactIds,
        data.ownerUserId ?? before.owner_user_id,
      );
    }

    await indexMeeting(id, before.company_id, { ...data, startsAt });
    await recordActivity({
      actor, companyId: before.company_id, entityType: 'meeting', entityId: id,
      action: 'updated', summary: `Updated “${data.title}”${synced ? ' (notes only — event is synced)' : ''}`,
    });
    revalidatePath('/calendar');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

export async function addActionItemAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = actionItemSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid action item.' };
    }
    const data = parsed.data;
    const meeting = await one<{ company_id: string; title: string }>(
      `select company_id, title from meetings where id = $1 and deleted_at is null`,
      [data.meetingId],
    );
    if (!meeting) return { ok: false, error: 'Meeting not found.' };
    await requireCalendarWrite(meeting.company_id);

    const row = await one<{ id: string }>(
      `insert into action_items (meeting_id, company_id, text, owner_user_id, due_date, position)
       values ($1,$2,$3,$4,$5, coalesce((select max(position) + 1 from action_items where meeting_id = $1), 0))
       returning id`,
      [data.meetingId, meeting.company_id, data.text, data.ownerUserId, data.dueDate],
    );
    revalidatePath(`/calendar/${data.meetingId}`);
    return { ok: true, data: { id: row!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function toggleActionItemAction(id: string): Promise<ActionResult<null>> {
  try {
    const item = await one<{ company_id: string; done: boolean; meeting_id: string | null }>(
      `select company_id, done, meeting_id from action_items where id = $1`,
      [id],
    );
    if (!item) return { ok: false, error: 'Action item not found.' };
    await requireCalendarWrite(item.company_id);
    await sql(`update action_items set done = not done where id = $1`, [id]);
    if (item.meeting_id) revalidatePath(`/calendar/${item.meeting_id}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Turns a meeting action item into a real task, linked both ways. */
export async function convertActionItemToTaskAction(id: string): Promise<ActionResult<{ taskId: string }>> {
  try {
    const item = await one<{
      company_id: string; text: string; owner_user_id: string | null; due_date: string | null;
      meeting_id: string | null; task_id: string | null;
    }>(`select company_id, text, owner_user_id, due_date, meeting_id, task_id from action_items where id = $1`, [id]);
    if (!item) return { ok: false, error: 'Action item not found.' };
    if (item.task_id) return { ok: false, error: 'This action item is already a task.' };

    const actor = await requireCompanyAccess(item.company_id);
    if (!actor.can('task:write', item.company_id)) {
      return { ok: false, error: 'You cannot create tasks in this company.' };
    }

    const meeting = item.meeting_id
      ? await one<{ title: string; client_id: string | null }>(
          `select title, client_id from meetings where id = $1`, [item.meeting_id],
        )
      : null;

    const task = await one<{ id: string }>(
      `insert into tasks (company_id, client_id, title, description, status, priority,
                          assignee_user_id, created_by_id, due_at)
       values ($1,$2,$3,$4,'todo','normal',$5,$6,$7) returning id`,
      [
        item.company_id,
        meeting?.client_id ?? null,
        item.text,
        meeting ? `Action item from the meeting “${meeting.title}”.` : 'Action item from a meeting.',
        item.owner_user_id,
        actor.user.id,
        item.due_date ? new Date(`${item.due_date}T17:00:00Z`) : null,
      ],
    );
    await sql(`update action_items set task_id = $2 where id = $1`, [id, task!.id]);

    await recordActivity({
      actor, companyId: item.company_id, entityType: 'task', entityId: task!.id,
      action: 'created', summary: `Created a task from a meeting action item: “${item.text}”`,
    });
    if (item.meeting_id) revalidatePath(`/calendar/${item.meeting_id}`);
    revalidatePath('/tasks');
    return { ok: true, data: { taskId: task!.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function setParticipantResponseAction(
  participantId: string,
  response: 'accepted' | 'declined' | 'tentative' | 'needs_action',
): Promise<ActionResult<null>> {
  try {
    const row = await one<{ meeting_id: string; company_id: string }>(
      `select p.meeting_id, m.company_id from meeting_participants p
       join meetings m on m.id = p.meeting_id where p.id = $1`,
      [participantId],
    );
    if (!row) return { ok: false, error: 'Participant not found.' };
    await requireCalendarWrite(row.company_id);
    await sql(`update meeting_participants set response = $2 where id = $1`, [participantId, response]);
    revalidatePath(`/calendar/${row.meeting_id}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveMeetingAction(input: unknown): Promise<ActionResult<null>> {
  try {
    const parsed = z
      .object({ id: z.string().uuid(), archived: z.boolean(), reason: z.string().trim().min(1) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: 'A reason is required.' };
    const meeting = await one<{ company_id: string; title: string }>(
      `select company_id, title from meetings where id = $1 and deleted_at is null`,
      [parsed.data.id],
    );
    if (!meeting) return { ok: false, error: 'Meeting not found.' };
    const actor = await requireCalendarWrite(meeting.company_id);
    await sql(`update meetings set archived_at = $2 where id = $1`, [
      parsed.data.id,
      parsed.data.archived ? new Date() : null,
    ]);
    if (parsed.data.archived) await removeFromIndex('meeting', parsed.data.id);
    await recordActivity({
      actor, companyId: meeting.company_id, entityType: 'meeting', entityId: parsed.data.id,
      action: parsed.data.archived ? 'archived' : 'restored',
      summary: `${parsed.data.archived ? 'Archived' : 'Restored'} “${meeting.title}”`,
      meta: { reason: parsed.data.reason },
    });
    revalidatePath('/calendar');
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
