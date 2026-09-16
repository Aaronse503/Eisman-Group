import 'server-only';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/notify';

/**
 * Turns reminders that have come due into notifications.
 *
 * A reminder is a promise to tell someone something at a time. Until this
 * runs, a reminder is only a row — so it runs on a schedule (see DEPLOYMENT.md)
 * and marks each reminder `sent` only after the notification exists. A crash
 * part-way leaves the remaining reminders pending, and the next run picks them
 * up; it never marks one sent that was not.
 */

interface DueReminder {
  id: string;
  user_id: string;
  company_id: string | null;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_demo: boolean;
}

const HREF_BY_ENTITY: Record<string, (id: string) => string> = {
  task: (id) => `/tasks/${id}`,
  client: (id) => `/crm/clients/${id}`,
  contact: (id) => `/crm/contacts/${id}`,
  investor: (id) => `/investors/${id}`,
  partnership: (id) => `/partnerships/${id}`,
  meeting: (id) => `/calendar/meetings/${id}`,
};

export interface ReminderRunResult {
  due: number;
  notified: number;
  pushed: number;
  failed: number;
  /** Reminders that could not be turned into a notification, with the reason. */
  errors: { reminderId: string; error: string }[];
}

export async function runDueReminders(limit = 200): Promise<ReminderRunResult> {
  const due = await sql<DueReminder>(
    `select id, user_id, company_id, title, body, entity_type, entity_id, is_demo
     from reminders
     where status = 'pending' and remind_at <= now()
     order by remind_at
     limit $1`,
    [limit],
  );

  const result: ReminderRunResult = {
    due: due.length,
    notified: 0,
    pushed: 0,
    failed: 0,
    errors: [],
  };

  for (const reminder of due) {
    try {
      const href =
        reminder.entity_type && reminder.entity_id
          ? (HREF_BY_ENTITY[reminder.entity_type]?.(reminder.entity_id) ?? null)
          : null;
      const outcome = await notifyUser({
        userId: reminder.user_id,
        companyId: reminder.company_id,
        kind: 'reminder',
        title: reminder.title,
        body: reminder.body,
        entityType: reminder.entity_type,
        entityId: reminder.entity_id,
        href,
        isDemo: reminder.is_demo,
      });
      await sql(`update reminders set status = 'sent', sent_at = now() where id = $1`, [
        reminder.id,
      ]);
      result.notified += 1;
      result.pushed += outcome.push.sent;
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        reminderId: reminder.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
