import { authed, badRequest } from '@/lib/api/route';
import { setTaskStatusAction } from '@/server/actions/tasks';

/**
 * Marks a task done.
 *
 * The action refuses when a blocker is still open, and creates the next
 * occurrence of a recurring task, exactly as it does on the web.
 */
export const POST = authed(async ({ route }) => {
  const result = await setTaskStatusAction(route.id!, 'done');
  if (!result.ok) throw badRequest(result.error);
  return { ok: true };
});
