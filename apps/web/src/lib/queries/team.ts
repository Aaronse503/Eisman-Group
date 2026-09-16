import { sql, one } from '@/lib/db/client';

export interface MemberRow {
  id: string;
  company_id: string;
  company_name: string;
  user_id: string | null;
  contact_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  kind: string;
  title: string;
  role_description: string | null;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  employment_type: string;
  pay_rate: number | null;
  pay_rate_unit: string | null;
  pay_schedule: string | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  skills: string[];
  capacity_hours: number;
  location: string | null;
  is_vacant: boolean;
  external_source: string | null;
  is_demo: boolean;
  assigned_clients: number;
  allocated_pct: number;
  unpaid_amount: number;
}

/**
 * `includeCompensation` gates pay rate and unpaid totals. Callers must pass
 * the result of a `team:compensation_read` check — the columns are simply not
 * selected when it is false, so they cannot leak through the page props.
 */
export async function listMembers(opts: {
  companyIds: string[];
  kind?: string;
  includeCompensation: boolean;
  search?: string;
}): Promise<MemberRow[]> {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['m.company_id = any($1)', 'm.deleted_at is null'];
  if (opts.kind) {
    params.push(opts.kind);
    where.push(`m.kind = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`(m.full_name ilike $${params.length} or m.title ilike $${params.length})`);
  }

  const payColumns = opts.includeCompensation
    ? `m.pay_rate, m.pay_rate_unit, m.pay_schedule,
       coalesce((select sum(ci.amount) from contractor_invoices ci
         where ci.member_id = m.id and ci.deleted_at is null
           and ci.status in ('submitted','approved')), 0) as unpaid_amount`
    : `null::numeric as pay_rate, null::text as pay_rate_unit, null::text as pay_schedule,
       0::numeric as unpaid_amount`;

  return sql<MemberRow>(
    `select m.id, m.company_id, m.user_id, m.contact_id, m.full_name, m.email, m.phone, m.kind,
            m.title, m.role_description, m.department_id, m.manager_id, m.employment_type,
            m.currency, m.start_date, m.end_date, m.status, m.skills, m.capacity_hours,
            m.location, m.is_vacant, m.external_source, m.is_demo,
            ${payColumns},
            co.name as company_name, d.name as department_name, mgr.full_name as manager_name,
            (select count(*)::int from member_assignments a
              where a.member_id = m.id and a.client_id is not null) as assigned_clients,
            coalesce((select sum(a.allocation_pct)::int from member_assignments a
              where a.member_id = m.id), 0) as allocated_pct
     from members m
     join companies co on co.id = m.company_id
     left join departments d on d.id = m.department_id
     left join members mgr on mgr.id = m.manager_id
     where ${where.join(' and ')}
     order by m.is_vacant, m.full_name`,
    params,
  );
}

export async function getMember(id: string, includeCompensation: boolean) {
  const rows = await listMembers({ companyIds: [], includeCompensation });
  void rows;
  const member = await one<{ company_id: string }>(
    `select company_id from members where id = $1 and deleted_at is null`,
    [id],
  );
  if (!member) return null;
  const list = await listMembers({ companyIds: [member.company_id], includeCompensation });
  return list.find((m) => m.id === id) ?? null;
}

export async function getMemberAssignments(memberId: string) {
  return sql<{
    id: string; client_id: string | null; client_name: string | null; project_name: string | null;
    role: string; allocation_pct: number; start_date: string | null;
  }>(
    `select a.id, a.client_id, c.name as client_name, p.name as project_name,
            a.role, a.allocation_pct, a.start_date
     from member_assignments a
     left join clients c on c.id = a.client_id
     left join projects p on p.id = a.project_id
     where a.member_id = $1
     order by a.allocation_pct desc`,
    [memberId],
  );
}

export async function getContractorInvoices(opts: { companyIds: string[]; memberId?: string }) {
  if (!opts.companyIds.length) return [];
  const params: unknown[] = [opts.companyIds];
  const where = ['ci.company_id = any($1)', 'ci.deleted_at is null'];
  if (opts.memberId) {
    params.push(opts.memberId);
    where.push(`ci.member_id = $${params.length}`);
  }
  return sql<{
    id: string; company_name: string; member_id: string; member_name: string;
    number: string | null; period_start: string | null; period_end: string | null;
    amount: number; currency: string; status: string; due_date: string | null;
    paid_at: Date | null; source: string; is_demo: boolean;
  }>(
    `select ci.id, co.name as company_name, ci.member_id, m.full_name as member_name,
            ci.number, ci.period_start, ci.period_end, ci.amount, ci.currency, ci.status,
            ci.due_date, ci.paid_at, ci.source, ci.is_demo
     from contractor_invoices ci
     join members m on m.id = ci.member_id
     join companies co on co.id = ci.company_id
     where ${where.join(' and ')}
     order by ci.period_end desc nulls last limit 300`,
    params,
  );
}

export interface OrgNode {
  id: string;
  full_name: string;
  title: string;
  kind: string;
  status: string;
  is_vacant: boolean;
  department_name: string | null;
  capacity_hours: number;
  allocated_pct: number;
  assigned_clients: number;
  company_id: string;
  company_name: string;
  manager_id: string | null;
  children: OrgNode[];
}

/** Builds the reporting tree for one company. Cycles are broken defensively. */
export async function getOrgChart(companyId: string): Promise<OrgNode[]> {
  const rows = await sql<Omit<OrgNode, 'children'>>(
    `select m.id, m.full_name, m.title, m.kind, m.status, m.is_vacant, m.capacity_hours,
            m.manager_id, m.company_id, co.name as company_name, d.name as department_name,
            coalesce((select sum(a.allocation_pct)::int from member_assignments a
              where a.member_id = m.id), 0) as allocated_pct,
            (select count(*)::int from member_assignments a
              where a.member_id = m.id and a.client_id is not null) as assigned_clients
     from members m
     join companies co on co.id = m.company_id
     left join departments d on d.id = m.department_id
     where m.company_id = $1 and m.deleted_at is null and m.status <> 'inactive'
     order by m.full_name`,
    [companyId],
  );

  const byId = new Map<string, OrgNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: OrgNode[] = [];
  const seen = new Set<string>();

  for (const node of byId.values()) {
    // Walk up to detect a cycle before attaching.
    let cursor = node.manager_id;
    const path = new Set([node.id]);
    let cyclic = false;
    while (cursor) {
      if (path.has(cursor)) {
        cyclic = true;
        break;
      }
      path.add(cursor);
      cursor = byId.get(cursor)?.manager_id ?? null;
    }
    const parent = !cyclic && node.manager_id ? byId.get(node.manager_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
    seen.add(node.id);
  }
  return roots;
}

export async function getOrgChangeLog(companyId: string, limit = 30) {
  return sql<{
    id: string; member_name: string; from_manager: string | null; to_manager: string | null;
    reason: string; actor_name: string | null; created_at: Date;
  }>(
    `select c.id, m.full_name as member_name, fm.full_name as from_manager,
            tm.full_name as to_manager, c.reason, u.name as actor_name, c.created_at
     from org_chart_changes c
     join members m on m.id = c.member_id
     left join members fm on fm.id = c.from_manager_id
     left join members tm on tm.id = c.to_manager_id
     left join users u on u.id = c.actor_user_id
     where c.company_id = $1
     order by c.created_at desc limit $2`,
    [companyId, limit],
  );
}

export async function getCapacitySummary(companyIds: string[]) {
  if (!companyIds.length) return [];
  return sql<{
    id: string; full_name: string; kind: string; capacity_hours: number;
    allocated_pct: number; company_name: string;
  }>(
    `select m.id, m.full_name, m.kind, m.capacity_hours, co.name as company_name,
            coalesce((select sum(a.allocation_pct)::int from member_assignments a
              where a.member_id = m.id), 0) as allocated_pct
     from members m
     join companies co on co.id = m.company_id
     where m.company_id = any($1) and m.deleted_at is null
       and m.status = 'active' and not m.is_vacant
     order by allocated_pct desc`,
    [companyIds],
  );
}
