import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { seedAll } from '@/lib/seed';
import { resetEnvForTests } from '@/lib/env';
import { registerDevice, setPushToken } from '@/lib/api/devices';
import { pushStatus, sendPushToUser } from '@/lib/api/push';
import { notifyUser } from '@/lib/notify';
import { runDueReminders } from '@/lib/api/reminders';

/**
 * Push delivery is the one part of the system that depends on a service this
 * application does not control. What matters is that it never lies: a
 * notification always exists, an attempt is recorded only when one was made,
 * and a failure is visible rather than swallowed.
 */

let userId: string;
const TOKEN = 'ExponentPushToken[test-device-aaaaaaaaaaaa]';

function expoResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: false });
  const owner = await one<{ id: string }>(
    `select id from users where email = 'aaron@eismandigital.com'`,
  );
  userId = owner!.id;
}, 300_000);

beforeEach(async () => {
  process.env.PUSH_PROVIDER = 'expo';
  delete process.env.EXPO_ACCESS_TOKEN;
  // The environment is read through a cache, so a test that changes it clears
  // the cache rather than re-importing the module: a second import would open
  // a second embedded database on the same directory.
  resetEnvForTests();
  await sql(`delete from push_deliveries`);
  await sql(`delete from devices`);
  await sql(`delete from notifications`);
  await sql(`delete from reminders`);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

async function addDevice(token: string | null, installation = 'install-1') {
  await registerDevice(userId, { installationId: installation, platform: 'ios' });
  if (token) await setPushToken(userId, installation, token);
}

describe('when there is nothing to send to', () => {
  it('records no attempt and says why', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPushToUser(userId, { title: 'Nobody is listening' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 0, sent: 0, failed: 0 });
    expect(result.skipped).toMatch(/no device/i);
    expect(await sql(`select 1 from push_deliveries`)).toHaveLength(0);
  });

  it('refuses to send when delivery is turned off, and says so', async () => {
    process.env.PUSH_PROVIDER = 'none';
    resetEnvForTests();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await addDevice(TOKEN);

    expect(pushStatus()).toMatchObject({ configured: false, provider: 'none' });
    const result = await sendPushToUser(userId, { title: 'Turned off' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.skipped).toMatch(/turned off/i);
    expect(await sql(`select 1 from push_deliveries`)).toHaveLength(0);
  });
});

describe('a successful send', () => {
  it('records one sent delivery carrying the push service ticket', async () => {
    await addDevice(TOKEN);
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(expoResponse({ data: [{ status: 'ok', id: 'ticket-1' }] }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPushToUser(userId, {
      title: 'Task assigned to you',
      body: 'Draft the board pack',
      href: '/tasks/abc',
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0, skipped: null });
    const [request] = fetchSpy.mock.calls[0]!;
    expect(request).toBe('https://exp.host/--/api/v2/push/send');
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body[0]).toMatchObject({
      to: TOKEN,
      title: 'Task assigned to you',
      body: 'Draft the board pack',
    });
    expect(body[0].data.href).toBe('/tasks/abc');

    const rows = await sql<{ status: string; ticket_id: string }>(
      `select status, ticket_id from push_deliveries`,
    );
    expect(rows).toEqual([{ status: 'sent', ticket_id: 'ticket-1' }]);
  });

  it('sends the access token only when one is configured', async () => {
    process.env.EXPO_ACCESS_TOKEN = 'expo-access-token-for-tests';
    resetEnvForTests();
    await addDevice(TOKEN);
    const fetchSpy = vi.fn().mockResolvedValue(expoResponse({ data: [{ status: 'ok', id: 't' }] }));
    vi.stubGlobal('fetch', fetchSpy);

    await sendPushToUser(userId, { title: 'With a token' });
    expect(fetchSpy.mock.calls[0]![1].headers.authorization).toBe(
      'Bearer expo-access-token-for-tests',
    );
  });
});

describe('when delivery does not work', () => {
  it('records a failure rather than reporting success', async () => {
    await addDevice(TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND exp.host')));

    const result = await sendPushToUser(userId, { title: 'Nowhere to go' });
    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    const rows = await sql<{ status: string; error: string }>(
      `select status, error from push_deliveries`,
    );
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.error).toMatch(/ENOTFOUND/);
  });

  it('records a rejection and stops sending to a device that no longer exists', async () => {
    await addDevice(TOKEN);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        expoResponse({
          data: [
            {
              status: 'error',
              message: '"ExponentPushToken[…]" is not a registered push notification recipient',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
      ),
    );

    const result = await sendPushToUser(userId, { title: 'Uninstalled' });
    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    const rows = await sql<{ status: string }>(`select status from push_deliveries`);
    expect(rows[0]!.status).toBe('rejected');

    const device = await one<{ push_token: string | null; push_enabled: boolean }>(
      `select push_token, push_enabled from devices where user_id = $1`,
      [userId],
    );
    expect(device!.push_token).toBeNull();
    expect(device!.push_enabled).toBe(false);
  });

  it('clears a token the push service could never accept, without calling it', async () => {
    await addDevice('not-an-expo-token');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await sendPushToUser(userId, { title: 'Malformed' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.skipped).toMatch(/no device/i);
    const device = await one<{ push_token: string | null }>(
      `select push_token from devices where user_id = $1`,
      [userId],
    );
    expect(device!.push_token).toBeNull();
  });
});

describe('notifying someone', () => {
  it('records the notification even when the push cannot be delivered', async () => {
    await addDevice(TOKEN);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await notifyUser({
      userId,
      kind: 'assignment',
      title: 'Task assigned to you',
      body: 'Review the ParFax numbers',
      entityType: 'task',
      entityId: null,
      href: '/tasks/xyz',
    });

    expect(result.push.sent).toBe(0);
    expect(result.push.failed).toBe(1);
    const row = await one<{ title: string; kind: string; href: string }>(
      `select title, kind, href from notifications where id = $1`,
      [result.notificationId],
    );
    expect(row).toMatchObject({
      title: 'Task assigned to you',
      kind: 'assignment',
      href: '/tasks/xyz',
    });
  });
});

describe('reminders coming due', () => {
  it('notifies the owner once and does not fire the same reminder twice', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const investorId = '8f6d1c2e-4b7a-4d1e-9c3f-0a1b2c3d4e5f';
    const reminder = await one<{ id: string }>(
      `insert into reminders (user_id, entity_type, entity_id, title, body, remind_at)
       values ($1,'investor',$2,'Follow up with Harbour Capital','Agreed at the last call',
               now() - interval '5 minutes')
       returning id`,
      [userId, investorId],
    );

    const first = await runDueReminders();
    expect(first).toMatchObject({ due: 1, notified: 1, failed: 0 });

    const stored = await one<{ status: string; sent_at: string | null }>(
      `select status, sent_at from reminders where id = $1`,
      [reminder!.id],
    );
    expect(stored!.status).toBe('sent');
    expect(stored!.sent_at).not.toBeNull();

    const notifications = await sql<{ kind: string; title: string; href: string | null }>(
      `select kind, title, href from notifications where user_id = $1`,
      [userId],
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      kind: 'reminder',
      title: 'Follow up with Harbour Capital',
      href: `/investors/${investorId}`,
    });

    const second = await runDueReminders();
    expect(second).toMatchObject({ due: 0, notified: 0 });
  });

  it('leaves a reminder that is not due yet alone', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await sql(
      `insert into reminders (user_id, title, remind_at)
       values ($1,'Not yet', now() + interval '1 day')`,
      [userId],
    );
    expect(await runDueReminders()).toMatchObject({ due: 0, notified: 0 });
  });
});
