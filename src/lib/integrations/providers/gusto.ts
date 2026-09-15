import { upsertMapped } from '../mapping';
import {
  providerFetch,
  IntegrationError,
  type IntegrationAdapter,
  type SyncContext,
  type SyncResult,
} from '../types';

/**
 * Gusto adapter.
 *
 * Deliberately narrow: this reads only the fields needed to run the team and
 * contractor views. Social security numbers, full bank details and individual
 * tax records are never requested, stored or displayed — if an endpoint would
 * return them, only the safe subset is mapped.
 *
 * When an endpoint is unavailable on the connected Gusto plan the sync records
 * a warning and finishes as "partial" so the CSV import path can cover the gap.
 */

interface GustoEmployee {
  uuid: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  department?: string | null;
  jobs?: { title?: string | null; hire_date?: string | null; primary?: boolean; rate?: string | null; payment_unit?: string | null }[];
  terminated?: boolean;
  terminations?: { effective_date?: string | null }[];
}

interface GustoContractor {
  uuid: string;
  type: 'Individual' | 'Business';
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  email?: string | null;
  wage_type?: string | null;
  hourly_rate?: string | null;
  start_date?: string | null;
  is_active?: boolean;
}

interface GustoContractorPayment {
  uuid: string;
  contractor_uuid: string;
  date: string;
  wage?: string | null;
  bonus?: string | null;
  reimbursement?: string | null;
  hours?: string | null;
}

const num = (v: string | null | undefined) => (v ? Number.parseFloat(v) : null);

function demoFixtures() {
  const employees: GustoEmployee[] = [
    { uuid: 'gu-emp-1', first_name: 'Dana', last_name: 'Ortiz', email: 'dana@eismandigital.com', department: 'Operations', jobs: [{ title: 'Director of Operations', hire_date: '2023-02-13', primary: true, rate: '148000', payment_unit: 'Year' }] },
    { uuid: 'gu-emp-2', first_name: 'Priya', last_name: 'Raman', email: 'priya@eismandigital.com', department: 'Client Services', jobs: [{ title: 'Senior Account Manager', hire_date: '2023-08-01', primary: true, rate: '96000', payment_unit: 'Year' }] },
  ];
  const contractors: GustoContractor[] = [
    { uuid: 'gu-con-1', type: 'Individual', first_name: 'Sam', last_name: 'Okafor', email: 'sam@contractor.test', wage_type: 'Hourly', hourly_rate: '85.00', start_date: '2024-04-02', is_active: true },
    { uuid: 'gu-con-2', type: 'Business', business_name: 'Pixelforge Studios', email: 'ap@pixelforge.studio', wage_type: 'Fixed', start_date: '2024-09-16', is_active: true },
  ];
  const payments: GustoContractorPayment[] = contractors.flatMap((c, ci) =>
    [0, 1].map((m) => ({
      uuid: `gu-pay-${ci}-${m}`,
      contractor_uuid: c.uuid,
      date: new Date(Date.now() - (m + 1) * 30 * 86_400_000).toISOString().slice(0, 10),
      wage: String(3200 + ci * 1800),
      bonus: '0',
      reimbursement: '0',
      hours: c.wage_type === 'Hourly' ? '38' : null,
    })),
  );
  return { employees, contractors, payments };
}

export const gustoAdapter: IntegrationAdapter = {
  id: 'gusto',

  async test(credentials) {
    const token = credentials.accessToken;
    const companyId = credentials.companyId;
    const base = credentials.apiBase || 'https://api.gusto.com';
    if (!token || !companyId) {
      throw new IntegrationError('A Gusto access token and company id are required.');
    }
    const company = (await providerFetch(`${base}/v1/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })) as { uuid: string; name?: string; trade_name?: string };
    return {
      ok: true,
      accountId: company.uuid,
      accountName: company.trade_name ?? company.name ?? company.uuid,
      scopes: ['employees:read', 'contractors:read', 'contractor_payments:read'],
      message: 'Connected to Gusto. Only non-sensitive employment fields are read.',
    };
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const log: SyncResult['log'] = [];
    const warnings: string[] = [];
    const push = (level: 'info' | 'warn' | 'error', message: string) => {
      log.push({ level, message, at: new Date().toISOString() });
      ctx.log(level, message);
    };
    if (!ctx.companyId) throw new IntegrationError('Gusto must be connected to a specific company.');

    let employees: GustoEmployee[] = [];
    let contractors: GustoContractor[] = [];
    let payments: GustoContractorPayment[] = [];

    if (ctx.demo) {
      ({ employees, contractors, payments } = demoFixtures());
      push('info', 'Demo mode: using built-in Gusto fixtures. No Gusto request was made.');
    } else {
      const token = ctx.credentials.accessToken;
      const gustoCompany = ctx.credentials.companyId;
      const base = ctx.credentials.apiBase || 'https://api.gusto.com';
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Each endpoint is attempted independently: an unavailable one degrades
      // to a warning and the CSV import path, rather than failing the run.
      for (const [label, load] of [
        ['employees', async () => {
          employees = (await providerFetch(
            `${base}/v1/companies/${gustoCompany}/employees?include=all_compensations`,
            { headers },
          )) as GustoEmployee[];
        }],
        ['contractors', async () => {
          contractors = (await providerFetch(`${base}/v1/companies/${gustoCompany}/contractors`, {
            headers,
          })) as GustoContractor[];
        }],
        ['contractor payments', async () => {
          const start = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
          const end = new Date().toISOString().slice(0, 10);
          payments = (await providerFetch(
            `${base}/v1/companies/${gustoCompany}/contractor_payments?start_date=${start}&end_date=${end}`,
            { headers },
          )) as GustoContractorPayment[];
        }],
      ] as [string, () => Promise<void>][]) {
        try {
          await load();
          push('info', `Read ${label}.`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(`Gusto ${label} unavailable: ${message}`);
          push('warn', `Could not read ${label} (${message}). Use Team → Import to load this data from CSV instead.`);
        }
      }
    }

    let written = 0;
    let conflicts = 0;
    const memberByContractor = new Map<string, string>();

    for (const emp of employees) {
      const job = emp.jobs?.find((j) => j.primary) ?? emp.jobs?.[0];
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'gusto',
        entityType: 'member',
        externalId: emp.uuid,
        table: 'members',
        values: {
          company_id: ctx.companyId,
          full_name: `${emp.first_name} ${emp.last_name}`.trim(),
          email: emp.email ?? null,
          kind: 'employee',
          title: job?.title ?? '',
          employment_type: 'full_time',
          pay_rate: num(job?.rate ?? null),
          pay_rate_unit: (job?.payment_unit ?? 'Year').toLowerCase() === 'hour' ? 'hour' : 'year',
          currency: 'USD',
          start_date: job?.hire_date ?? null,
          end_date: emp.terminations?.[0]?.effective_date ?? null,
          status: emp.terminated ? 'inactive' : 'active',
          external_source: 'gusto',
          external_id: emp.uuid,
          external_synced_at: new Date(),
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'external_source', value: 'gusto' },
          { column: 'external_id', value: emp.uuid },
        ],
        // Org structure and client assignments are owned in this system.
        localOwnedColumns: ['department_id', 'team_id', 'manager_id', 'skills', 'capacity_hours'],
      });
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    for (const con of contractors) {
      const name =
        con.type === 'Business'
          ? (con.business_name ?? 'Contractor')
          : `${con.first_name ?? ''} ${con.last_name ?? ''}`.trim() || 'Contractor';
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'gusto',
        entityType: 'member',
        externalId: con.uuid,
        table: 'members',
        values: {
          company_id: ctx.companyId,
          full_name: name,
          email: con.email ?? null,
          kind: con.type === 'Business' ? 'agency' : 'contractor',
          title: 'Contractor',
          employment_type: con.wage_type === 'Hourly' ? 'hourly' : 'contract',
          pay_rate: num(con.hourly_rate ?? null),
          pay_rate_unit: con.wage_type === 'Hourly' ? 'hour' : 'project',
          pay_schedule: 'on_invoice',
          currency: 'USD',
          start_date: con.start_date ?? null,
          status: con.is_active === false ? 'inactive' : 'active',
          external_source: 'gusto',
          external_id: con.uuid,
          external_synced_at: new Date(),
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'external_source', value: 'gusto' },
          { column: 'external_id', value: con.uuid },
        ],
        localOwnedColumns: ['department_id', 'team_id', 'manager_id', 'skills', 'capacity_hours'],
      });
      memberByContractor.set(con.uuid, r.id);
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    for (const pay of payments) {
      const memberId = memberByContractor.get(pay.contractor_uuid);
      if (!memberId) continue;
      const amount =
        (num(pay.wage) ?? 0) + (num(pay.bonus) ?? 0) + (num(pay.reimbursement) ?? 0);
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'gusto',
        entityType: 'contractor_invoice',
        externalId: pay.uuid,
        table: 'contractor_invoices',
        values: {
          company_id: ctx.companyId,
          member_id: memberId,
          number: `GUSTO-${pay.uuid.slice(0, 8)}`,
          period_end: pay.date,
          amount,
          currency: 'USD',
          status: 'paid',
          paid_at: new Date(`${pay.date}T12:00:00Z`),
          source: 'gusto',
          external_id: pay.uuid,
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'source', value: 'gusto' },
          { column: 'external_id', value: pay.uuid },
        ],
      });
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    push('info', `Wrote ${written} people record(s).`);
    return {
      recordsRead: employees.length + contractors.length + payments.length,
      recordsWritten: written,
      conflicts,
      log,
      warnings: warnings.length ? warnings : undefined,
    };
  },
};
