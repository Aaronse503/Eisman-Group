import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { seedAll } from '@/lib/seed';
import { PROVIDERS, type ProviderId } from '@/lib/integrations/registry';
import { ensureConnection } from '@/lib/integrations/manager';
import { getAdapter } from '@/lib/integrations/adapters';

/**
 * A connection has to belong to whatever its provider syncs for.
 *
 * Stripe, ClickUp and Gusto attribute every record they read to a company. A
 * connection made without one authenticates perfectly well — the credentials
 * are valid, the provider answers, the card fills in the account name — and
 * then fails on every sync with a message about companies. That gap between
 * "looks connected" and "cannot work" is the thing these tests close.
 */

let companyId: string;

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: false });
  const company = await one<{ id: string }>(
    `select id from companies where slug = 'eisman-digital'`,
  );
  companyId = company!.id;
}, 300_000);

const companyScoped = PROVIDERS.filter((p) => p.scope === 'company' && p.status === 'available');

/**
 * The adapters that write records belonging to a company. Each one has to know
 * which company, so each refuses without it.
 *
 * ParFax is deliberately not here: `parfax_users` and `parfax_scans` have no
 * `company_id` — the platform's records are global, and the ParFax Admin
 * section is their home. Its connection still belongs to the ParFax company,
 * for permissions and for who may configure it, but its sync has nothing to
 * attribute.
 */
const ATTRIBUTES_TO_A_COMPANY: ProviderId[] = ['clickup', 'google_calendar', 'gusto', 'stripe'];

describe('every company-scoped provider', () => {
  it('is one this test knows about', () => {
    // If a provider is added, it should be considered here rather than
    // silently skipped.
    expect(companyScoped.map((p) => p.id).sort()).toEqual([
      'clickup',
      'google_calendar',
      'gusto',
      'parfax_crm',
      'stripe',
    ]);
    // And it should have been decided which kind it is.
    const unaccounted = companyScoped
      .map((p) => p.id)
      .filter((id) => id !== 'parfax_crm' && !ATTRIBUTES_TO_A_COMPANY.includes(id));
    expect(unaccounted).toEqual([]);
  });

  it.each(ATTRIBUTES_TO_A_COMPANY)(
    '%s says so plainly when asked to sync with no company',
    async (id) => {
      const adapter = getAdapter(id);
      expect(adapter, `${id} has no adapter`).toBeTruthy();

      const connection = await ensureConnection(id, companyId);
      // Deliberately hand it the state the interface used to be able to create:
      // a real connection with no company behind it.
      const result = await adapter!
        .sync({
          connection: { ...connection!, company_id: null },
          credentials: { apiToken: 'x', secretKey: 'x', accessToken: 'x', apiKey: 'x', clientId: 'x' },
          companyId: null,
          demo: true,
          log: () => {},
        } as never)
        .then(() => null)
        .catch((err: unknown) => err);

      expect(result, `${id} synced with no company instead of refusing`).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/company/i);
    },
  );

  it('parfax_crm needs no company to attribute to, and refuses to invent data', async () => {
    const adapter = getAdapter('parfax_crm');
    const connection = await ensureConnection('parfax_crm', companyId);
    const result = await adapter!.sync({
      connection: connection!,
      credentials: {},
      companyId: null,
      demo: true,
      log: () => {},
    } as never);

    expect(result.recordsRead).toBe(0);
    expect(result.recordsWritten).toBe(0);
    expect((result.warnings ?? []).join(' ')).toMatch(/no ParFax read/i);
  });
});

describe('a connection made for a company', () => {
  it('records that company, so its records can be attributed', async () => {
    const connection = await ensureConnection('stripe', companyId);
    expect(connection!.company_id).toBe(companyId);

    const stored = await one<{ company_id: string | null }>(
      `select company_id from integration_connections where id = $1`,
      [connection!.id],
    );
    expect(stored!.company_id).toBe(companyId);
  });

  it('is not created twice for the same company', async () => {
    const first = await ensureConnection('clickup', companyId);
    const second = await ensureConnection('clickup', companyId);
    expect(second!.id).toBe(first!.id);

    const rows = await sql<{ count: number }>(
      `select count(*)::int as count from integration_connections
       where provider = 'clickup' and company_id = $1`,
      [companyId],
    );
    expect(rows[0]!.count).toBe(1);
  });
});

describe('holdings-wide providers', () => {
  it('are the only ones that belong to no company', async () => {
    const holdingScoped = PROVIDERS.filter((p) => p.scope === 'holding' && p.status === 'available');
    expect(holdingScoped.map((p) => p.id)).toEqual(['anthropic']);

    const connection = await ensureConnection('anthropic', null);
    expect(connection!.company_id).toBeNull();
  });
});
