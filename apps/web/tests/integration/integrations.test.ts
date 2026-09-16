import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { seedAll } from '@/lib/seed';
import {
  PROVIDERS,
  ensureConnection,
  getConnection,
  hasUsableCredentials,
  listConnections,
  resolveCredentials,
  saveCredentials,
  setMode,
  setWriteEnabled,
  testConnection,
} from '@/lib/integrations/manager';
import type { Actor } from '@/lib/auth/actor';

/**
 * The rule these tests defend: an integration is only ever described as
 * connected after a real call to the provider has succeeded. Demo Mode is a
 * separate, clearly-labelled state, and write-back is off until someone turns
 * it on with a reason.
 */

let actor: Actor;
let companyId: string;

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: true });
  const owner = await one<{ id: string; email: string; name: string }>(
    `select id, email, name from users where email = 'aaron@eismandigital.com'`,
  );
  companyId = (await one<{ id: string }>(`select id from companies where slug = 'eisman-digital'`))!.id;
  actor = {
    sessionId: 'test-session',
    user: { ...owner!, title: null, avatar_url: null, timezone: 'UTC', status: 'active', is_demo: false, must_change_password: false },
    grants: [{ companyId: null, role: 'holdings_owner' }],
    companies: [],
    isHoldingsOwner: true,
    can: () => true,
    rolesFor: () => ['holdings_owner'],
    permissionsFor: () => new Set(),
    canReadCompany: () => true,
  } as unknown as Actor;
}, 300_000);

describe('a connection nobody has configured', () => {
  it('starts disconnected for every provider', async () => {
    const connections = await listConnections(null);
    expect(connections.length).toBeGreaterThan(0);
    for (const c of connections) {
      expect(c.status).toBe('disconnected');
      expect(c.mode).toBe('disconnected');
      expect(c.write_enabled).toBe(false);
      expect(c.last_success_at).toBe(null);
    }
  });

  it('reports that it has no usable credentials', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'clickup'`,
    );
    const full = await getConnection(connection!.id);
    expect(hasUsableCredentials(full!)).toBe(false);
  });
});

describe('testing a connection', () => {
  it('does not report success when the credentials are wrong', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'clickup'`,
    );
    await saveCredentials({
      connectionId: connection!.id,
      credentials: { apiToken: 'pk_invalid_token_for_testing', teamId: '0' },
      actor,
    });
    const result = await testConnection(connection!.id, actor);
    expect(result.ok).toBe(false);

    const after = await getConnection(connection!.id);
    expect(after!.status).toBe('error');
    expect(after!.mode).not.toBe('live');
    expect(after!.last_success_at).toBe(null);
    expect(after!.last_error).toBeTruthy();
  }, 60_000);

  it('writes an audit record for the failed attempt', async () => {
    const row = await one<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'integration.connect_failed'`,
    );
    expect(row!.c).toBeGreaterThan(0);
  });
});

describe('credentials at rest', () => {
  it('stores them encrypted, never in plain text', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'clickup'`,
    );
    const row = await one<{ credentials_encrypted: string; credentials_hint: string | null }>(
      `select credentials_encrypted, credentials_hint from integration_connections where id = $1`,
      [connection!.id],
    );
    expect(row!.credentials_encrypted).toMatch(/^v1\./);
    expect(row!.credentials_encrypted).not.toContain('pk_invalid_token_for_testing');

    // The hint is safe to display: it reveals only the ends.
    expect(row!.credentials_hint).not.toContain('invalid_token_for');

    // And it still decrypts back to the original for the adapter to use.
    const full = await getConnection(connection!.id);
    expect(resolveCredentials(full!).apiToken).toBe('pk_invalid_token_for_testing');
  });

  it('keeps a stored value when a field is submitted blank', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'clickup'`,
    );
    await saveCredentials({ connectionId: connection!.id, credentials: { apiToken: '' }, actor });
    const full = await getConnection(connection!.id);
    expect(resolveCredentials(full!).apiToken).toBe('pk_invalid_token_for_testing');
  });

  it('never exposes the encrypted blob through the list used by the interface', async () => {
    const connections = await listConnections(null);
    expect(JSON.stringify(connections)).not.toContain('pk_invalid_token_for_testing');
  });
});

describe('demo mode', () => {
  it('is labelled as demo and is never described as live', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'stripe'`,
    );
    await setMode(connection!.id, 'demo', actor);
    const full = await getConnection(connection!.id);
    expect(full!.mode).toBe('demo');
    expect(full!.account_name).toMatch(/demo/i);
    // No provider call was made, so there is no success timestamp to show.
    expect(full!.last_success_at).toBe(null);
  });

  it('goes back to disconnected, not connected, when demo mode is turned off', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'stripe'`,
    );
    await setMode(connection!.id, 'disconnected', actor);
    const full = await getConnection(connection!.id);
    expect(full!.status).toBe('disconnected');
    expect(full!.mode).toBe('disconnected');
  });
});

describe('write-back', () => {
  it('is off until somebody enables it, and needs a reason', async () => {
    const connection = await one<{ id: string }>(
      `select id from integration_connections where provider = 'parfax_crm'`,
    );
    expect((await getConnection(connection!.id))!.write_enabled).toBe(false);

    await expect(setWriteEnabled(connection!.id, true, '   ', actor)).rejects.toThrow(/reason/i);
    expect((await getConnection(connection!.id))!.write_enabled).toBe(false);

    await setWriteEnabled(connection!.id, true, 'Approved by Aaron for the pilot rollout', actor);
    expect((await getConnection(connection!.id))!.write_enabled).toBe(true);
  });

  it('records enabling write-back as a critical audit event with the reason', async () => {
    const row = await one<{ reason: string; severity: string }>(
      `select reason, severity from audit_log
       where action = 'integration.writeback_enabled' order by created_at desc limit 1`,
    );
    expect(row!.severity).toBe('critical');
    expect(row!.reason).toBe('Approved by Aaron for the pilot rollout');
  });
});

describe('provider catalogue', () => {
  it('never marks a planned provider as something you can connect', () => {
    for (const provider of PROVIDERS.filter((p) => p.status === 'planned')) {
      expect(provider.plannedNote).toBeTruthy();
      expect(provider.syncs).toEqual([]);
    }
  });

  it('describes every provider honestly', () => {
    for (const provider of PROVIDERS) {
      expect(provider.setupSteps.length).toBeGreaterThan(0);
      expect(['available', 'planned']).toContain(provider.status);
      // Anything not yet implemented has to say why.
      if (provider.status === 'planned') expect(provider.plannedNote).toBeTruthy();
      // Anything actually implemented has to say which credential it needs.
      // A planned provider has none, because there is nothing to connect yet.
      if (provider.status === 'available' && provider.authType !== 'oauth') {
        expect(provider.credentialFields.length).toBeGreaterThan(0);
      }
    }
  });

  it('creates one connection row per company-scoped provider on demand', async () => {
    const created = await ensureConnection('clickup', companyId);
    expect(created!.company_id).toBe(companyId);
    const again = await ensureConnection('clickup', companyId);
    expect(again!.id).toBe(created!.id);
  });
});
