import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { asUser, one, sql } from '@/lib/db/client';
import { seedAll } from '@/lib/seed';

/**
 * Row-level security is defence in depth behind the application's own
 * permission checks. These tests connect as the unprivileged `app_user` role
 * with a given user id and assert on what the database itself will hand back.
 */

let owner: string;
let viewer: string;
let parfaxLead: string;
let accountManager: string;

const countAs = (userId: string | null, table: string) =>
  asUser(userId, async (db) => (await db.query<{ c: number }>(`select count(*)::int as c from ${table}`))[0]!.c);

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: true });
  owner = (await one<{ id: string }>(`select id from users where email = 'aaron@eismandigital.com'`))!.id;
  viewer = (await one<{ id: string }>(`select id from users where email like 'val.viewer@%'`))!.id;
  parfaxLead = (await one<{ id: string }>(`select id from users where email like 'jordan.parfax@%'`))!.id;
  accountManager = (await one<{ id: string }>(`select id from users where email like 'priya.am@%'`))!.id;
}, 300_000);

describe('company isolation', () => {
  it('shows an Eisman Digital user the Eisman Digital clients', async () => {
    expect(await countAs(viewer, 'clients')).toBeGreaterThan(0);
  });

  it('shows a ParFax-only user none of the Eisman Digital clients', async () => {
    expect(await countAs(parfaxLead, 'clients')).toBe(0);
  });

  it('shows an Eisman Digital user none of the ParFax partnerships', async () => {
    expect(await countAs(viewer, 'partnerships')).toBe(0);
    expect(await countAs(parfaxLead, 'partnerships')).toBeGreaterThan(0);
  });

  it('keeps ParFax platform users away from other companies', async () => {
    expect(await countAs(viewer, 'parfax_users')).toBe(0);
    expect(await countAs(parfaxLead, 'parfax_users')).toBeGreaterThan(0);
  });

  it('shows the Holdings Owner everything', async () => {
    const total = (await sql<{ c: number }>(`select count(*)::int as c from clients`))[0]!.c;
    expect(await countAs(owner, 'clients')).toBe(total);
    expect(await countAs(owner, 'partnerships')).toBeGreaterThan(0);
  });
});

describe('anonymous access', () => {
  it('returns nothing at all without a user', async () => {
    for (const table of ['clients', 'partnerships', 'invoices', 'tasks', 'documents', 'parfax_users']) {
      expect(await countAs(null, table)).toBe(0);
    }
  });
});

describe('write protection', () => {
  it('stops a viewer rewriting records', async () => {
    const before = await sql<{ id: string; name: string }>(`select id, name from clients order by name limit 1`);
    await asUser(viewer, (db) => db.query(`update clients set name = 'RLS-BREACH'`)).catch(() => undefined);
    const breached = (await sql<{ c: number }>(`select count(*)::int as c from clients where name = 'RLS-BREACH'`))[0]!.c;
    expect(breached).toBe(0);
    const after = await one<{ name: string }>(`select name from clients where id = $1`, [before[0]!.id]);
    expect(after!.name).toBe(before[0]!.name);
  });

  it('lets an account manager update a client in their own company', async () => {
    const target = (await sql<{ id: string }>(
      `select c.id from clients c join companies co on co.id = c.company_id
       where co.slug = 'eisman-digital' order by c.name limit 1`,
    ))[0]!;
    await asUser(accountManager, (db) =>
      db.query(`update clients set next_action = 'rls-write-ok' where id = $1`, [target.id]),
    );
    const row = await one<{ next_action: string | null }>(`select next_action from clients where id = $1`, [target.id]);
    expect(row!.next_action).toBe('rls-write-ok');
  });

  it('stops a ParFax-only user writing to an Eisman Digital client', async () => {
    const target = (await sql<{ id: string; next_action: string | null }>(
      `select c.id, c.next_action from clients c join companies co on co.id = c.company_id
       where co.slug = 'eisman-digital' order by c.name limit 1`,
    ))[0]!;
    await asUser(parfaxLead, (db) =>
      db.query(`update clients set next_action = 'cross-company-write' where id = $1`, [target.id]),
    ).catch(() => undefined);
    const row = await one<{ next_action: string | null }>(`select next_action from clients where id = $1`, [target.id]);
    expect(row!.next_action).not.toBe('cross-company-write');
  });
});

describe('service role', () => {
  it('bypasses row-level security for background work, as the seed and sync jobs need', async () => {
    const total = (await sql<{ c: number }>(`select count(*)::int as c from clients`))[0]!.c;
    expect(total).toBeGreaterThan(0);
  });
});
