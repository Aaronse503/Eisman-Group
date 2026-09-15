import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { seedAll } from '@/lib/seed';
import { hasPermission, type RoleGrant } from '@/lib/rbac/permissions';

/**
 * Server actions are the write path, so every one of them has to check a
 * permission before it touches anything. These tests read the actual grants
 * out of the seeded database and assert on what each role may do.
 */

interface Person {
  id: string;
  email: string;
  grants: RoleGrant[];
}

const people: Record<string, Person> = {};
let digital: string;
let parfax: string;

async function load(key: string, emailLike: string) {
  const user = await one<{ id: string; email: string }>(
    `select id, email from users where email like $1`,
    [emailLike],
  );
  const grants = await sql<{ company_id: string | null; role: string }>(
    `select company_id, role from user_company_roles where user_id = $1`,
    [user!.id],
  );
  people[key] = {
    id: user!.id,
    email: user!.email,
    grants: grants.map((g) => ({ companyId: g.company_id, role: g.role as RoleGrant['role'] })),
  };
}

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: true });
  digital = (await one<{ id: string }>(`select id from companies where slug = 'eisman-digital'`))!.id;
  parfax = (await one<{ id: string }>(`select id from companies where slug = 'parfax'`))!.id;
  await load('owner', 'aaron@eismandigital.com');
  await load('ops', 'dana.ops@%');
  await load('finance', 'marcus.finance@%');
  await load('accountManager', 'priya.am@%');
  await load('parfaxLead', 'jordan.parfax@%');
  await load('designer', 'sam.design@%');
  await load('viewer', 'val.viewer@%');
}, 300_000);

const can = (who: string, permission: Parameters<typeof hasPermission>[1], companyId: string | null) =>
  hasPermission(people[who]!.grants, permission, companyId);

describe('finance', () => {
  it('is visible to finance, admins and the owner', () => {
    expect(can('finance', 'finance:read', digital)).toBe(true);
    expect(can('ops', 'finance:read', digital)).toBe(true);
    expect(can('owner', 'finance:read', digital)).toBe(true);
  });

  it('is hidden from a designer and a viewer', () => {
    expect(can('designer', 'finance:read', digital)).toBe(false);
    expect(can('viewer', 'finance:read', digital)).toBe(false);
  });

  it('reserves sensitive billing actions for finance and above', () => {
    expect(can('finance', 'finance:sensitive_action', digital)).toBe(true);
    expect(can('accountManager', 'finance:sensitive_action', digital)).toBe(false);
    expect(can('designer', 'finance:sensitive_action', digital)).toBe(false);
  });
});

describe('compensation', () => {
  it('is restricted to finance and company admins', () => {
    expect(can('finance', 'team:compensation_read', digital)).toBe(true);
    expect(can('ops', 'team:compensation_read', digital)).toBe(true);
    expect(can('accountManager', 'team:compensation_read', digital)).toBe(false);
    expect(can('designer', 'team:compensation_read', digital)).toBe(false);
    expect(can('viewer', 'team:compensation_read', digital)).toBe(false);
  });
});

describe('company boundaries', () => {
  it('does not let the ParFax lead act inside Eisman Digital', () => {
    expect(can('parfaxLead', 'crm:write', parfax)).toBe(true);
    expect(can('parfaxLead', 'crm:write', digital)).toBe(false);
  });

  it('does not let an Eisman Digital admin act inside ParFax', () => {
    expect(can('ops', 'crm:write', digital)).toBe(true);
    expect(can('ops', 'crm:write', parfax)).toBe(false);
  });

  it('lets the Holdings Owner act in both', () => {
    expect(can('owner', 'crm:write', digital)).toBe(true);
    expect(can('owner', 'crm:write', parfax)).toBe(true);
  });
});

describe('administration', () => {
  it('keeps user management away from everyone below Company Admin', () => {
    expect(can('owner', 'user:manage', digital)).toBe(true);
    expect(can('ops', 'user:manage', digital)).toBe(true);
    expect(can('finance', 'user:manage', digital)).toBe(false);
    expect(can('accountManager', 'user:manage', digital)).toBe(false);
  });

  it('reserves creating companies and managing demo data for the Holdings Owner', () => {
    expect(can('owner', 'company:create', null)).toBe(true);
    expect(can('owner', 'demo:manage', null)).toBe(true);
    for (const who of ['ops', 'finance', 'accountManager', 'parfaxLead', 'designer', 'viewer']) {
      expect(can(who, 'company:create', null)).toBe(false);
      expect(can(who, 'demo:manage', null)).toBe(false);
    }
  });

  it('reserves enabling integration write-back for the Holdings Owner', () => {
    expect(can('owner', 'integration:enable_writeback', digital)).toBe(true);
    expect(can('ops', 'integration:enable_writeback', digital)).toBe(false);
  });
});

describe('every server action checks who is calling it', () => {
  /**
   * Actions that legitimately run before, or independently of, a permission
   * check. Each is listed with the reason, so adding to this list is a
   * deliberate decision rather than an oversight.
   */
  const EXEMPT: Record<string, string> = {
    'auth.ts:signInAction': 'this is the sign-in itself; there is no actor yet',
    'auth.ts:signOutAction': 'ends the caller\'s own session',
    'shell.ts:signOutAction': 'ends the caller\'s own session',
    'shell.ts:recordRecentlyViewedAction': 'writes only against the caller\'s own session',
  };

  it('has no write action that reaches the database without one', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = 'src/server/actions';
    const offenders: string[] = [];

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(`${dir}/${file}`, 'utf8');
      const matches = [...source.matchAll(/export async function (\w+Action)/g)];
      matches.forEach((match, i) => {
        const name = `${file}:${match[1]}`;
        if (name in EXEMPT) return;
        const body = source.slice(match.index!, matches[i + 1]?.index);
        // Either a shared helper (requireActor, requireTaskWrite, assertCanEditTask,
        // authorize, guard) or a direct actor lookup.
        const checksDirectly = /\brequire[A-Z]\w*\(|\bassertCan\w*\(|\bauthorize\(|\bguard\(|getActor\(/.test(body);
        // Some actions are thin wrappers that delegate to another action,
        // which does the checking.
        const delegates = /return \w+Action\(/.test(body);
        if (!checksDirectly && !delegates) offenders.push(name);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the exemption list short and documented', () => {
    for (const reason of Object.values(EXEMPT)) expect(reason.length).toBeGreaterThan(10);
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(6);
  });
});

describe('metric provenance', () => {
  it('refuses to let an operator hand-write a raw or calculated figure', async () => {
    const { parfaxMetricSchema, OPERATOR_METRIC_KINDS } = await import('@/lib/validation/parfax');
    const base = {
      metricKey: 'paid_subscribers',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      value: 999,
      sourceLabel: 'Attempted override',
    };
    for (const kind of ['raw', 'calculated', 'demo']) {
      expect(parfaxMetricSchema.safeParse({ ...base, kind }).success).toBe(false);
    }
    for (const kind of OPERATOR_METRIC_KINDS) {
      expect(parfaxMetricSchema.safeParse({ ...base, kind }).success).toBe(true);
    }
  });

  it('insists on knowing where a hand-entered number came from', async () => {
    const { parfaxMetricSchema } = await import('@/lib/validation/parfax');
    const result = parfaxMetricSchema.safeParse({
      metricKey: 'paid_subscribers',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      value: 120,
      kind: 'forecast',
      sourceLabel: '',
    });
    expect(result.success).toBe(false);
  });

  it('labels every seeded metric with where it came from', async () => {
    const rows = await sql<{ kind: string; source_label: string | null }>(
      `select kind, source_label from parfax_metrics`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['raw', 'calculated', 'manual', 'forecast', 'target', 'demo']).toContain(row.kind);
      expect(row.source_label).toBeTruthy();
    }
  });
});

describe('sensitive payroll data', () => {
  it('has no column anywhere for a social security number or a full bank account', async () => {
    const columns = await sql<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and (column_name ~ '(ssn|social_security|bank_account|account_number|routing)'
              or column_name = 'iban')`,
    );
    expect(columns).toEqual([]);
  });

  it('stores only a masked reference for contractor payment details', async () => {
    const columns = await sql<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'members'`,
    );
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain('ssn');
    expect(names).not.toContain('bank_account');
  });
});
