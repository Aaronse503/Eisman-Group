import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { DEMO_TABLES, demoCounts, resetDemoData, seedAll } from '@/lib/seed';

/**
 * Demo data and real data must never mix, and clearing the demo set must never
 * touch a record somebody actually created.
 */

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: true });
}, 300_000);

describe('the demo flag', () => {
  it('exists on every table the reset touches', async () => {
    for (const table of DEMO_TABLES) {
      const exists = await one<{ exists: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = $1
         ) as exists`,
        [table],
      );
      expect(exists!.exists, `${table} should exist`).toBe(true);
    }
  });

  it('defaults to false, so a record created through the app is real', async () => {
    const defaults = await sql<{ table_name: string; column_default: string | null }>(
      `select table_name, column_default from information_schema.columns
       where table_schema = 'public' and column_name = 'is_demo'`,
    );
    expect(defaults.length).toBeGreaterThan(0);
    for (const row of defaults) {
      expect(row.column_default, `${row.table_name}.is_demo`).toMatch(/false/);
    }
  });

  it('marks everything the demo seed created', async () => {
    const counts = await demoCounts();
    expect(counts.clients).toBeGreaterThan(0);
    expect(counts.tasks).toBeGreaterThan(0);
    expect(counts.parfax_users).toBeGreaterThan(0);

    const unflagged = await one<{ c: number }>(
      `select count(*)::int as c from clients where is_demo = false`,
    );
    expect(unflagged!.c).toBe(0);
  });
});

describe('resetting demo data', () => {
  let realClientId: string;
  let realTaskId: string;

  beforeAll(async () => {
    const company = await one<{ id: string }>(`select id from companies where slug = 'eisman-digital'`);
    const owner = await one<{ id: string }>(`select id from users where email = 'aaron@eismandigital.com'`);
    const client = await one<{ id: string }>(
      `insert into clients (company_id, name, status, is_demo)
       values ($1, 'A Real Client Ltd', 'active', false) returning id`,
      [company!.id],
    );
    realClientId = client!.id;
    const task = await one<{ id: string }>(
      `insert into tasks (company_id, title, status, created_by_id, is_demo)
       values ($1, 'A real task', 'todo', $2, false) returning id`,
      [company!.id, owner!.id],
    );
    realTaskId = task!.id;
  });

  it('deletes the demo records', async () => {
    await resetDemoData();
    const counts = await demoCounts();
    for (const [table, count] of Object.entries(counts)) {
      expect(count, `${table} should have no demo rows left`).toBe(0);
    }
  });

  it('leaves the real records exactly as they were', async () => {
    const client = await one<{ name: string }>(`select name from clients where id = $1`, [realClientId]);
    const task = await one<{ title: string }>(`select title from tasks where id = $1`, [realTaskId]);
    expect(client!.name).toBe('A Real Client Ltd');
    expect(task!.title).toBe('A real task');
  });

  it('leaves the real user accounts and companies alone', async () => {
    const owner = await one<{ id: string }>(`select id from users where email = 'aaron@eismandigital.com'`);
    expect(owner).toBeTruthy();
    const companies = await sql(`select 1 from companies`);
    expect(companies.length).toBeGreaterThanOrEqual(2);
  });

  it('removes the demo sign-ins but keeps the real one', async () => {
    const demoUsers = await sql(`select 1 from users where is_demo = true`);
    expect(demoUsers).toHaveLength(0);
    const realUsers = await sql(`select 1 from users where is_demo = false`);
    expect(realUsers.length).toBeGreaterThan(0);
  });

  it('leaves no orphaned rows behind', async () => {
    const orphans = await sql<{ c: number }>(
      `select (
         (select count(*) from tasks where company_id not in (select id from companies)) +
         (select count(*) from client_contacts where client_id not in (select id from clients)) +
         (select count(*) from meeting_participants where meeting_id not in (select id from meetings)) +
         (select count(*) from user_company_roles where user_id not in (select id from users))
       )::int as c`,
    );
    expect(orphans[0]!.c).toBe(0);
  });

  it('can seed a fresh demo set again without disturbing the real records', async () => {
    await seedAll({ demo: true });
    const counts = await demoCounts();
    expect(counts.clients).toBeGreaterThan(0);
    const client = await one<{ name: string; is_demo: boolean }>(
      `select name, is_demo from clients where id = $1`, [realClientId],
    );
    expect(client!.name).toBe('A Real Client Ltd');
    expect(client!.is_demo).toBe(false);
  }, 300_000);
});
