import 'server-only';
import type { DeviceInfo } from '@eisman/shared';
import { one, sql } from '@/lib/db/client';

/**
 * Records the device a person signed in from.
 *
 * Keyed on an installation id the device generates once and keeps in its
 * secure storage, so reinstalling produces a new row rather than silently
 * inheriting the old one's notification settings.
 */
export async function registerDevice(userId: string, device: DeviceInfo): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into devices (user_id, installation_id, platform, model, os_version, app_version)
     values ($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text)
     on conflict (user_id, installation_id) do update
       set platform = excluded.platform,
           model = excluded.model,
           os_version = excluded.os_version,
           app_version = excluded.app_version,
           last_seen_at = now()
     returning id`,
    [
      userId,
      device.installationId,
      device.platform,
      device.model ?? null,
      device.osVersion ?? null,
      device.appVersion ?? null,
    ],
  );
  return row!.id;
}

/**
 * Stores the push token for a device.
 *
 * A token arrives only after the person has allowed notifications, so storing
 * one is also what turns delivery on. Clearing it turns delivery off.
 */
export async function setPushToken(
  userId: string,
  installationId: string,
  pushToken: string | null,
): Promise<void> {
  await sql(
    `update devices
       set push_token = $3::text,
           push_enabled = $3::text is not null,
           last_seen_at = now()
     where user_id = $1::uuid and installation_id = $2::text`,
    [userId, installationId, pushToken],
  );
}

export async function forgetDevice(userId: string, installationId: string): Promise<void> {
  await sql(`delete from devices where user_id = $1 and installation_id = $2`, [
    userId,
    installationId,
  ]);
}

export interface PushTarget {
  deviceId: string;
  pushToken: string;
}

/** Devices belonging to a person that have notifications turned on. */
export async function pushTargetsForUser(userId: string): Promise<PushTarget[]> {
  const rows = await sql<{ id: string; push_token: string }>(
    `select id, push_token from devices
     where user_id = $1 and push_enabled and push_token is not null`,
    [userId],
  );
  return rows.map((r) => ({ deviceId: r.id, pushToken: r.push_token }));
}
