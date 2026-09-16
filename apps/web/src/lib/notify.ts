import 'server-only';
import { one } from '@/lib/db/client';
import { sendPushToUser } from '@/lib/api/push';

export type NotificationKind =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'mention'
  | 'assignment'
  | 'reminder';

export interface NotifyInput {
  userId: string;
  companyId?: string | null;
  kind?: NotificationKind;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** In-app path the notification opens. Also used as the deep link.  */
  href?: string | null;
  isDemo?: boolean;
}

export interface NotifyResult {
  notificationId: string;
  /** How push delivery went. Recorded, never assumed. */
  push: { attempted: number; sent: number; failed: number; skipped: string | null };
}

/**
 * Tells someone something happened.
 *
 * The notification row is the record — it is written first and is what both
 * applications read. Pushing it to a phone is a second, best-effort step: if
 * the person has no device registered, or the push service is unreachable,
 * the notification still exists and the attempt (or the absence of one) is
 * recorded rather than glossed over.
 */
export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const row = await one<{ id: string }>(
    `insert into notifications
       (user_id, company_id, kind, title, body, entity_type, entity_id, href, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      input.userId,
      input.companyId ?? null,
      input.kind ?? 'info',
      input.title,
      input.body ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.href ?? null,
      input.isDemo ?? false,
    ],
  );
  const notificationId = row!.id;

  const push = await sendPushToUser(
    input.userId,
    {
      title: input.title,
      body: input.body,
      href: input.href,
      data: {
        entityType: input.entityType ?? undefined,
        entityId: input.entityId ?? undefined,
        kind: input.kind ?? 'info',
      },
    },
    notificationId,
  ).catch((err) => {
    // sendPushToUser is written not to throw; this is the last line of defence
    // so a push fault can never undo the work that caused the notification.
    console.error('Push delivery failed unexpectedly', err);
    return { attempted: 0, sent: 0, failed: 0, skipped: 'Push delivery failed unexpectedly.' };
  });

  return { notificationId, push };
}
