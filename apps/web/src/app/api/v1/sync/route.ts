import { z } from 'zod';
import type { SyncResponse, SyncResultEntry } from '@eisman/shared';
import { authed, jsonBody, badRequest } from '@/lib/api/route';
import { one } from '@/lib/db/client';
import { createTaskAction, setTaskStatusAction } from '@/server/actions/tasks';
import { addNoteAction } from '@/server/actions/records';
import { createContactAction } from '@/server/actions/crm';

/**
 * Applies changes made on a device that had no connection.
 *
 * Each change carries an id the device generated. That id is recorded here the
 * first time it is applied, so a retry after a timeout — where the change may
 * well have succeeded before the response was lost — returns the original
 * result rather than creating a second record.
 *
 * Nothing here bypasses anything: each change runs through the same action the
 * web application calls, with the same validation, the same permission check
 * and the same audit entry.
 */

const mutationSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(['task.create', 'task.complete', 'note.create', 'contact.create']),
  createdAt: z.string(),
  payload: z.unknown(),
});

const schema = z.object({
  mutations: z.array(mutationSchema).max(200),
});

async function applyOne(
  kind: string,
  payload: unknown,
): Promise<{ entityType: string; id: string | null }> {
  switch (kind) {
    case 'task.create': {
      const result = await createTaskAction(payload);
      if (!result.ok) throw new Error(result.error);
      return { entityType: 'task', id: result.data.id };
    }
    case 'task.complete': {
      const id = (payload as { id?: string })?.id;
      if (!id) throw new Error('Which task?');
      const result = await setTaskStatusAction(id, 'done');
      if (!result.ok) throw new Error(result.error);
      return { entityType: 'task', id };
    }
    case 'note.create': {
      const result = await addNoteAction(payload);
      if (!result.ok) throw new Error(result.error);
      return { entityType: 'note', id: result.data.id };
    }
    case 'contact.create': {
      const result = await createContactAction(payload);
      if (!result.ok) throw new Error(result.error);
      return { entityType: 'contact', id: result.data.id };
    }
    default:
      throw new Error(`Unknown change: ${kind}`);
  }
}

export const POST = authed<SyncResponse>(async ({ request, actor }) => {
  const parsed = schema.safeParse(await jsonBody(request));
  if (!parsed.success) throw badRequest('Send a list of queued changes.');

  const results: SyncResultEntry[] = [];

  // Applied one at a time and in the order the device recorded them: a note
  // written against a contact created moments earlier has to go second.
  for (const mutation of parsed.data.mutations) {
    const seen = await one<{ status: string; entity_id: string | null; error: string | null }>(
      `select status, entity_id, error from client_mutations
       where client_id = $1 and user_id = $2`,
      [mutation.clientId, actor.user.id],
    );
    if (seen) {
      results.push({
        clientId: mutation.clientId,
        status: seen.status === 'applied' ? 'duplicate' : 'failed',
        ...(seen.entity_id ? { id: seen.entity_id } : {}),
        ...(seen.error ? { error: seen.error } : {}),
      });
      continue;
    }

    try {
      const applied = await applyOne(mutation.kind, mutation.payload);
      await one(
        `insert into client_mutations (client_id, user_id, kind, entity_type, entity_id, status)
         values ($1,$2,$3,$4,$5,'applied')
         on conflict (client_id) do nothing
         returning client_id`,
        [mutation.clientId, actor.user.id, mutation.kind, applied.entityType, applied.id],
      );
      results.push({
        clientId: mutation.clientId,
        status: 'applied',
        ...(applied.id ? { id: applied.id } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not apply this change.';
      // Recorded as failed so the device stops retrying something that will
      // never succeed, and the person is told which change needs attention.
      await one(
        `insert into client_mutations (client_id, user_id, kind, status, error)
         values ($1,$2,$3,'failed',$4)
         on conflict (client_id) do nothing
         returning client_id`,
        [mutation.clientId, actor.user.id, mutation.kind, message],
      );
      results.push({ clientId: mutation.clientId, status: 'failed', error: message });
    }
  }

  return { results, serverTime: new Date().toISOString() };
});
