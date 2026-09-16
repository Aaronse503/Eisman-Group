import 'server-only';
import { getEnv } from '@/lib/env';
import { sql } from '@/lib/db/client';
import { pushTargetsForUser, type PushTarget } from '@/lib/api/devices';

/**
 * Push delivery.
 *
 * Notifications are written to the `notifications` table first — that row is
 * what the web and mobile applications read, and it exists whether or not a
 * phone is reachable. Delivery to a device is a second, best-effort step, and
 * every attempt is recorded in `push_deliveries` so a notification that never
 * arrived can be told apart from one that was never sent.
 *
 * Nothing here pretends to work without the pieces it needs: with no device
 * registered, or with delivery turned off, no attempt is recorded and
 * `pushStatus()` says plainly why.
 */

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
const TIMEOUT_MS = 10_000;

/** Expo issues tokens in exactly these two shapes. */
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export interface PushStatus {
  provider: 'expo' | 'none';
  /** True when the server is able to hand a message to the push service. */
  configured: boolean;
  /** Why it is not configured, in words worth showing someone. */
  reason: string | null;
}

export function pushStatus(): PushStatus {
  const env = getEnv();
  if (env.PUSH_PROVIDER === 'none') {
    return {
      provider: 'none',
      configured: false,
      reason:
        'Push delivery is turned off (PUSH_PROVIDER=none). Notifications are still recorded and ' +
        'visible in the app; they are simply not pushed to a device.',
    };
  }
  return { provider: 'expo', configured: true, reason: null };
}

export interface PushMessage {
  title: string;
  body?: string | null;
  /** Deep link the notification opens, e.g. `/tasks/<id>`. */
  href?: string | null;
  /** Extra values handed to the app when the notification is opened. */
  data?: Record<string, unknown>;
  badge?: number;
}

export interface PushOutcome {
  /** How many devices were handed to the push service. */
  attempted: number;
  sent: number;
  failed: number;
  /** Set when nothing was attempted, explaining why. */
  skipped: string | null;
}

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends a notification to every device a person has notifications turned on
 * for. Never throws: a push that cannot be delivered must not roll back the
 * work that caused it.
 */
export async function sendPushToUser(
  userId: string,
  message: PushMessage,
  notificationId?: string | null,
): Promise<PushOutcome> {
  const status = pushStatus();
  if (!status.configured) {
    return { attempted: 0, sent: 0, failed: 0, skipped: status.reason };
  }

  let targets: PushTarget[];
  try {
    targets = await pushTargetsForUser(userId);
  } catch (err) {
    console.error('Could not read push targets', err);
    return { attempted: 0, sent: 0, failed: 0, skipped: 'Could not read the registered devices.' };
  }

  const deliverable = targets.filter((t) => TOKEN_PATTERN.test(t.pushToken));
  const malformed = targets.length - deliverable.length;
  if (malformed > 0) {
    // A token the push service will reject outright is a broken registration,
    // not a delivery failure. Clear it so the device registers again.
    await clearTokens(targets.filter((t) => !TOKEN_PATTERN.test(t.pushToken)).map((t) => t.deviceId));
  }
  if (deliverable.length === 0) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      skipped: 'No device has notifications turned on for this person.',
    };
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < deliverable.length; i += CHUNK_SIZE) {
    const chunk = deliverable.slice(i, i + CHUNK_SIZE);
    const result = await deliverChunk(chunk, message, notificationId ?? null);
    sent += result.sent;
    failed += result.failed;
  }
  return { attempted: deliverable.length, sent, failed, skipped: null };
}

async function deliverChunk(
  targets: PushTarget[],
  message: PushMessage,
  notificationId: string | null,
): Promise<{ sent: number; failed: number }> {
  const env = getEnv();
  const payload = targets.map((target) => ({
    to: target.pushToken,
    title: message.title,
    body: message.body ?? undefined,
    sound: 'default' as const,
    badge: message.badge,
    channelId: 'default',
    data: {
      ...(message.data ?? {}),
      ...(message.href ? { href: message.href } : {}),
      ...(notificationId ? { notificationId } : {}),
    },
  }));

  let tickets: ExpoTicket[] | null = null;
  let transportError: string | null = null;
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;

    const response = await fetch(EXPO_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => null)) as
      | { data?: ExpoTicket[]; errors?: { message?: string }[] }
      | null;
    if (!response.ok) {
      transportError =
        json?.errors?.[0]?.message ?? `The push service answered ${response.status}.`;
    } else if (Array.isArray(json?.data)) {
      tickets = json.data;
    } else {
      transportError = 'The push service returned an answer this app does not understand.';
    }
  } catch (err) {
    transportError =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'The push service did not answer in time.'
        : err instanceof Error
          ? err.message
          : 'Could not reach the push service.';
  }

  if (transportError) {
    await recordDeliveries(
      targets.map((t) => ({
        deviceId: t.deviceId,
        status: 'failed' as const,
        ticketId: null,
        error: transportError,
      })),
      notificationId,
    );
    return { sent: 0, failed: targets.length };
  }

  const rows: DeliveryRow[] = [];
  const unregistered: string[] = [];
  let sent = 0;
  let failed = 0;
  targets.forEach((target, index) => {
    const ticket = tickets![index];
    if (ticket?.status === 'ok') {
      sent += 1;
      rows.push({ deviceId: target.deviceId, status: 'sent', ticketId: ticket.id ?? null, error: null });
      return;
    }
    failed += 1;
    const detail = ticket?.details?.error ?? null;
    if (detail === 'DeviceNotRegistered') unregistered.push(target.deviceId);
    rows.push({
      deviceId: target.deviceId,
      status: 'rejected',
      ticketId: ticket?.id ?? null,
      error: ticket?.message ?? detail ?? 'The push service rejected the message.',
    });
  });

  await recordDeliveries(rows, notificationId);
  // The app was uninstalled or the token was replaced. Stop sending to it.
  if (unregistered.length > 0) await clearTokens(unregistered);
  return { sent, failed };
}

interface DeliveryRow {
  deviceId: string;
  status: 'queued' | 'sent' | 'failed' | 'rejected';
  ticketId: string | null;
  error: string | null;
}

async function recordDeliveries(rows: DeliveryRow[], notificationId: string | null) {
  if (rows.length === 0) return;
  try {
    await sql(
      `insert into push_deliveries (notification_id, device_id, status, ticket_id, error)
       select $1::uuid, d.device_id::uuid, d.status, d.ticket_id, d.error
       from jsonb_to_recordset($2::jsonb)
         as d(device_id text, status text, ticket_id text, error text)`,
      [
        notificationId,
        JSON.stringify(
          rows.map((r) => ({
            device_id: r.deviceId,
            status: r.status,
            ticket_id: r.ticketId,
            error: r.error,
          })),
        ),
      ],
    );
  } catch (err) {
    console.error('Could not record push delivery attempts', err);
  }
}

async function clearTokens(deviceIds: string[]) {
  if (deviceIds.length === 0) return;
  try {
    await sql(
      `update devices set push_token = null, push_enabled = false where id = any($1::uuid[])`,
      [deviceIds],
    );
  } catch (err) {
    console.error('Could not clear stale push tokens', err);
  }
}
