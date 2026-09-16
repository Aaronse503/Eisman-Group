import { sql } from '@/lib/db/client';
import type { DateRange } from '@/lib/dates';

export interface ReportResult {
  columns: { key: string; label: string; numeric?: boolean; currency?: boolean; percent?: boolean }[];
  rows: Record<string, unknown>[];
  source: string;
  totals?: Record<string, number>;
}

/**
 * Runs a named report. Every report is company-scoped by the caller's access,
 * and declares the source of its figures so an exported sheet is never
 * ambiguous about where the numbers came from.
 */
export async function runReport(
  id: string,
  opts: { companyIds: string[]; range: DateRange },
): Promise<ReportResult> {
  const { companyIds, range } = opts;
  const empty: ReportResult = { columns: [], rows: [], source: 'No accessible companies.' };
  if (!companyIds.length) return empty;

  switch (id) {
    case 'holdings-overview':
    case 'company-performance': {
      const rows = await sql<Record<string, unknown>>(
        `select c.name as company,
           coalesce((select sum(p.amount) from payments p
             where p.company_id = c.id and p.deleted_at is null and p.direction = 'inbound'
               and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0) as revenue,
           coalesce((select sum(e.amount) from expenses e
             where e.company_id = c.id and e.deleted_at is null
               and e.incurred_on between $2::date and $3::date), 0) as expenses,
           coalesce((select sum(p.amount) from payments p
             where p.company_id = c.id and p.deleted_at is null and p.direction = 'inbound'
               and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0)
           - coalesce((select sum(e.amount) from expenses e
             where e.company_id = c.id and e.deleted_at is null
               and e.incurred_on between $2::date and $3::date), 0) as net,
           (select count(*)::int from clients cl
             where cl.company_id = c.id and cl.deleted_at is null and cl.status = 'active') as active_clients,
           (select count(*)::int from members m
             where m.company_id = c.id and m.deleted_at is null and not m.is_vacant) as people,
           (select count(*)::int from tasks t
             where t.company_id = c.id and t.deleted_at is null
               and t.status not in ('done','cancelled')) as open_tasks,
           (select count(*)::int from tasks t
             where t.company_id = c.id and t.deleted_at is null
               and t.status not in ('done','cancelled') and t.due_at < now()) as overdue_tasks,
           coalesce((select sum(pa.estimated_value) from partnerships pa
             where pa.company_id = c.id and pa.deleted_at is null
               and pa.stage not in ('declined','launched')), 0) as partnership_pipeline
         from companies c
         where c.id = any($1) and c.archived_at is null
         order by revenue desc`,
        [companyIds, range.from, range.to],
      );
      return {
        columns: [
          { key: 'company', label: 'Company' },
          { key: 'revenue', label: 'Revenue', numeric: true, currency: true },
          { key: 'expenses', label: 'Expenses', numeric: true, currency: true },
          { key: 'net', label: 'Net', numeric: true, currency: true },
          { key: 'active_clients', label: 'Active clients', numeric: true },
          { key: 'people', label: 'People', numeric: true },
          { key: 'open_tasks', label: 'Open tasks', numeric: true },
          { key: 'overdue_tasks', label: 'Overdue', numeric: true },
          { key: 'partnership_pipeline', label: 'Partnership pipeline', numeric: true, currency: true },
        ],
        rows,
        source: `Payments, expenses, clients, people, tasks and partnerships recorded in this system for ${range.label.toLowerCase()}.`,
      };
    }

    case 'client-health': {
      const rows = await sql<Record<string, unknown>>(
        `select c.name as client, co.name as company, c.status, c.stage, c.health_score,
                c.billing_status, c.monthly_retainer, c.renewal_date, u.name as owner,
                coalesce((select sum(i.amount_due) from invoices i
                  where i.client_id = c.id and i.deleted_at is null
                    and i.status in ('open','past_due')), 0) as outstanding,
                (select count(*)::int from tasks t
                  where t.client_id = c.id and t.deleted_at is null
                    and t.status not in ('done','cancelled') and t.due_at < now()) as overdue_tasks,
                c.risks
         from clients c
         join companies co on co.id = c.company_id
         left join users u on u.id = c.account_owner_id
         where c.company_id = any($1) and c.deleted_at is null
         order by c.health_score`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'client', label: 'Client' },
          { key: 'company', label: 'Company' },
          { key: 'status', label: 'Status' },
          { key: 'stage', label: 'Stage' },
          { key: 'health_score', label: 'Health', numeric: true },
          { key: 'billing_status', label: 'Billing' },
          { key: 'monthly_retainer', label: 'Retainer', numeric: true, currency: true },
          { key: 'outstanding', label: 'Outstanding', numeric: true, currency: true },
          { key: 'overdue_tasks', label: 'Overdue tasks', numeric: true },
          { key: 'renewal_date', label: 'Renewal' },
          { key: 'owner', label: 'Owner' },
          { key: 'risks', label: 'Risks' },
        ],
        rows,
        source: 'Client records. Health scores are set by the account owner, not computed.',
      };
    }

    case 'client-profitability': {
      const rows = await sql<Record<string, unknown>>(
        `select c.name as client, co.name as company,
           coalesce((select sum(p.amount) from payments p
             where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
               and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0) as revenue,
           coalesce((select sum(e.amount) from expenses e
             where e.client_id = c.id and e.deleted_at is null
               and e.incurred_on between $2::date and $3::date), 0) as attributed_cost,
           coalesce((select sum(p.amount) from payments p
             where p.client_id = c.id and p.deleted_at is null and p.direction = 'inbound'
               and p.status = 'succeeded' and p.occurred_at between $2 and $3), 0)
           - coalesce((select sum(e.amount) from expenses e
             where e.client_id = c.id and e.deleted_at is null
               and e.incurred_on between $2::date and $3::date), 0) as margin
         from clients c join companies co on co.id = c.company_id
         where c.company_id = any($1) and c.deleted_at is null
         order by revenue desc`,
        [companyIds, range.from, range.to],
      );
      return {
        columns: [
          { key: 'client', label: 'Client' },
          { key: 'company', label: 'Company' },
          { key: 'revenue', label: 'Revenue', numeric: true, currency: true },
          { key: 'attributed_cost', label: 'Attributed cost', numeric: true, currency: true },
          { key: 'margin', label: 'Margin', numeric: true, currency: true },
        ],
        rows,
        source: `Collected payments less expenses attributed to each client, ${range.label.toLowerCase()}. Unattributed overhead is excluded, so this is contribution, not full profitability.`,
      };
    }

    case 'sales-pipeline': {
      const rows = await sql<Record<string, unknown>>(
        `select d.name as deal, co.name as company, cl.name as client, d.stage, d.value,
                d.probability, round(d.value * d.probability / 100.0, 2) as weighted,
                d.expected_close, d.source, u.name as owner
         from deals d
         join companies co on co.id = d.company_id
         left join clients cl on cl.id = d.client_id
         left join users u on u.id = d.owner_user_id
         where d.company_id = any($1) and d.deleted_at is null
         order by weighted desc`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'deal', label: 'Deal' },
          { key: 'company', label: 'Company' },
          { key: 'client', label: 'Client' },
          { key: 'stage', label: 'Stage' },
          { key: 'value', label: 'Value', numeric: true, currency: true },
          { key: 'probability', label: 'Probability', numeric: true, percent: true },
          { key: 'weighted', label: 'Weighted', numeric: true, currency: true },
          { key: 'expected_close', label: 'Expected close' },
          { key: 'source', label: 'Source' },
          { key: 'owner', label: 'Owner' },
        ],
        rows,
        source: 'Deal records. Weighted value is value × probability.',
      };
    }

    case 'investor-pipeline': {
      const rows = await sql<Record<string, unknown>>(
        `select i.name as investor, pc.name as raising_for, i.investor_type, i.pipeline_stage,
                i.potential_amount, i.probability,
                round(i.potential_amount * i.probability / 100.0, 2) as weighted,
                i.interest_level, i.last_contact_at, i.next_follow_up_at,
                i.warm_intro_source, u.name as owner
         from investors i
         left join companies pc on pc.id = i.pitching_company_id
         left join users u on u.id = i.owner_user_id
         where i.deleted_at is null
           and (i.pitching_company_id = any($1) or i.company_id = any($1))
         order by weighted desc`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'investor', label: 'Investor' },
          { key: 'raising_for', label: 'Raising for' },
          { key: 'investor_type', label: 'Type' },
          { key: 'pipeline_stage', label: 'Stage' },
          { key: 'potential_amount', label: 'Potential', numeric: true, currency: true },
          { key: 'probability', label: 'Probability', numeric: true, percent: true },
          { key: 'weighted', label: 'Weighted', numeric: true, currency: true },
          { key: 'interest_level', label: 'Interest' },
          { key: 'last_contact_at', label: 'Last contact' },
          { key: 'next_follow_up_at', label: 'Next follow-up' },
          { key: 'warm_intro_source', label: 'Warm intro' },
          { key: 'owner', label: 'Owner' },
        ],
        rows,
        source: 'Investor records. Probability defaults to the pipeline stage unless overridden.',
      };
    }

    case 'partnership-pipeline': {
      const rows = await sql<Record<string, unknown>>(
        `select p.name as partner, co.name as company, p.category, p.stage, p.contract_status,
                p.estimated_value, p.probability,
                round(p.estimated_value * p.probability / 100.0, 2) as weighted,
                p.pilot_location, p.launch_date, p.next_action, u.name as owner
         from partnerships p
         join companies co on co.id = p.company_id
         left join users u on u.id = p.owner_user_id
         where p.company_id = any($1) and p.deleted_at is null
         order by weighted desc`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'partner', label: 'Partner' },
          { key: 'company', label: 'Company' },
          { key: 'category', label: 'Category' },
          { key: 'stage', label: 'Stage' },
          { key: 'contract_status', label: 'Contract' },
          { key: 'estimated_value', label: 'Estimated value', numeric: true, currency: true },
          { key: 'probability', label: 'Probability', numeric: true, percent: true },
          { key: 'weighted', label: 'Weighted', numeric: true, currency: true },
          { key: 'pilot_location', label: 'Pilot location' },
          { key: 'launch_date', label: 'Launch' },
          { key: 'next_action', label: 'Next action' },
          { key: 'owner', label: 'Owner' },
        ],
        rows,
        source: 'Partnership records.',
      };
    }

    case 'team-capacity': {
      const rows = await sql<Record<string, unknown>>(
        `select m.full_name as person, co.name as company, m.kind, m.title, d.name as department,
                m.capacity_hours,
                coalesce((select sum(a.allocation_pct)::int from member_assignments a
                  where a.member_id = m.id), 0) as allocated_pct,
                (select count(*)::int from member_assignments a
                  where a.member_id = m.id and a.client_id is not null) as clients,
                m.status
         from members m
         join companies co on co.id = m.company_id
         left join departments d on d.id = m.department_id
         where m.company_id = any($1) and m.deleted_at is null and not m.is_vacant
         order by allocated_pct desc`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'person', label: 'Person' },
          { key: 'company', label: 'Company' },
          { key: 'kind', label: 'Type' },
          { key: 'title', label: 'Title' },
          { key: 'department', label: 'Department' },
          { key: 'capacity_hours', label: 'Capacity (h/wk)', numeric: true },
          { key: 'allocated_pct', label: 'Allocated', numeric: true, percent: true },
          { key: 'clients', label: 'Clients', numeric: true },
          { key: 'status', label: 'Status' },
        ],
        rows,
        source: 'Team records. Allocation is the sum of client assignment percentages — a planning figure, not tracked time.',
      };
    }

    case 'task-completion': {
      const rows = await sql<Record<string, unknown>>(
        `select coalesce(u.name, 'Unassigned') as assignee, co.name as company,
                count(*) filter (where t.status not in ('done','cancelled'))::int as open,
                count(*) filter (where t.status not in ('done','cancelled') and t.due_at < now())::int as overdue,
                count(*) filter (where t.status = 'done' and t.completed_at between $2 and $3)::int as completed_in_period,
                count(*)::int as total
         from tasks t
         join companies co on co.id = t.company_id
         left join users u on u.id = t.assignee_user_id
         where t.company_id = any($1) and t.deleted_at is null
         group by u.name, co.name
         order by open desc`,
        [companyIds, range.from, range.to],
      );
      return {
        columns: [
          { key: 'assignee', label: 'Assignee' },
          { key: 'company', label: 'Company' },
          { key: 'open', label: 'Open', numeric: true },
          { key: 'overdue', label: 'Overdue', numeric: true },
          { key: 'completed_in_period', label: 'Completed in period', numeric: true },
          { key: 'total', label: 'All time', numeric: true },
        ],
        rows,
        source: `Task records. "Completed in period" counts tasks finished during ${range.label.toLowerCase()}.`,
      };
    }

    case 'revenue-expenses': {
      const rows = await sql<Record<string, unknown>>(
        `with months as (
           select to_char(generate_series(
             date_trunc('month', $2::timestamptz), date_trunc('month', $3::timestamptz),
             interval '1 month'), 'YYYY-MM') as month
         )
         select m.month,
           coalesce((select sum(p.amount) from payments p
             where p.company_id = any($1) and p.deleted_at is null and p.direction = 'inbound'
               and p.status = 'succeeded' and to_char(p.occurred_at, 'YYYY-MM') = m.month), 0) as revenue,
           coalesce((select sum(e.amount) from expenses e
             where e.company_id = any($1) and e.deleted_at is null
               and to_char(e.incurred_on, 'YYYY-MM') = m.month), 0) as expenses,
           coalesce((select sum(e.amount) from expenses e
             where e.company_id = any($1) and e.deleted_at is null and e.category in ('contractor','payroll')
               and to_char(e.incurred_on, 'YYYY-MM') = m.month), 0) as people_cost,
           coalesce((select sum(e.amount) from expenses e
             where e.company_id = any($1) and e.deleted_at is null and e.category = 'software'
               and to_char(e.incurred_on, 'YYYY-MM') = m.month), 0) as software_cost,
           coalesce((select sum(p.amount) from payments p
             where p.company_id = any($1) and p.deleted_at is null and p.direction = 'inbound'
               and p.status = 'succeeded' and to_char(p.occurred_at, 'YYYY-MM') = m.month), 0)
           - coalesce((select sum(e.amount) from expenses e
             where e.company_id = any($1) and e.deleted_at is null
               and to_char(e.incurred_on, 'YYYY-MM') = m.month), 0) as net
         from months m order by m.month`,
        [companyIds, range.from, range.to],
      );
      return {
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'revenue', label: 'Revenue', numeric: true, currency: true },
          { key: 'expenses', label: 'Expenses', numeric: true, currency: true },
          { key: 'people_cost', label: 'People cost', numeric: true, currency: true },
          { key: 'software_cost', label: 'Software', numeric: true, currency: true },
          { key: 'net', label: 'Net', numeric: true, currency: true },
        ],
        rows,
        source:
          'Recorded payments and expenses. This is an operating view for management, not an accounting statement — hand it to your accountant alongside your bank and ledger records.',
      };
    }

    case 'subscription-performance': {
      const rows = await sql<Record<string, unknown>>(
        `select s.plan, co.name as company, s.status, count(*)::int as subscriptions,
                sum(case s.interval when 'year' then s.amount / 12 when 'week' then s.amount * 4.345
                                    when 'day' then s.amount * 30 else s.amount end * s.quantity) as mrr
         from subscriptions s join companies co on co.id = s.company_id
         where s.company_id = any($1) and s.deleted_at is null
         group by s.plan, co.name, s.status order by mrr desc`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'plan', label: 'Plan' },
          { key: 'company', label: 'Company' },
          { key: 'status', label: 'Status' },
          { key: 'subscriptions', label: 'Subscriptions', numeric: true },
          { key: 'mrr', label: 'MRR', numeric: true, currency: true },
        ],
        rows,
        source: 'Subscription records, normalised to a monthly figure.',
      };
    }

    case 'parfax-growth': {
      const rows = await sql<Record<string, unknown>>(
        `with months as (
           select to_char(generate_series(
             date_trunc('month', current_date) - interval '11 months',
             date_trunc('month', current_date), interval '1 month'), 'YYYY-MM') as month
         )
         select m.month,
           (select count(*)::int from parfax_users u
             where u.deleted_at is null and to_char(u.signup_at, 'YYYY-MM') = m.month) as signups,
           (select count(*)::int from parfax_users u
             where u.deleted_at is null and u.plan <> 'free'
               and to_char(u.signup_at, 'YYYY-MM') = m.month) as paid_signups,
           (select count(*)::int from parfax_scans s
             where to_char(s.scanned_at, 'YYYY-MM') = m.month) as scans,
           (select count(*)::int from parfax_marketplace_events e
             where e.kind = 'sale' and to_char(e.occurred_at, 'YYYY-MM') = m.month) as sales
         from months m order by m.month`,
      );
      return {
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'signups', label: 'Signups', numeric: true },
          { key: 'paid_signups', label: 'Paid signups', numeric: true },
          { key: 'scans', label: 'Scans', numeric: true },
          { key: 'sales', label: 'Marketplace sales', numeric: true },
        ],
        rows,
        source: 'ParFax platform records held in this system, last 12 months.',
      };
    }

    case 'knowledge-activity': {
      const rows = await sql<Record<string, unknown>>(
        `select co.name as company,
           (select count(*)::int from documents d
             where d.company_id = co.id and d.deleted_at is null and d.is_current) as documents,
           (select count(*)::int from documents d
             where d.company_id = co.id and d.deleted_at is null and d.text_status = 'extracted') as searchable,
           (select count(*)::int from documents d
             where d.company_id = co.id and d.deleted_at is null and d.text_status = 'unsupported') as needs_ocr,
           (select count(*)::int from documents d
             where d.company_id = co.id and d.deleted_at is null and d.ai_status = 'ready') as summarised,
           (select count(*)::int from notes n
             where n.company_id = co.id and n.deleted_at is null) as notes,
           (select count(*)::int from knowledge_chunks k where k.company_id = co.id) as indexed_passages
         from companies co where co.id = any($1) and co.archived_at is null
         order by co.name`,
        [companyIds],
      );
      return {
        columns: [
          { key: 'company', label: 'Company' },
          { key: 'documents', label: 'Documents', numeric: true },
          { key: 'searchable', label: 'Searchable', numeric: true },
          { key: 'needs_ocr', label: 'Needs OCR', numeric: true },
          { key: 'summarised', label: 'Summarised', numeric: true },
          { key: 'notes', label: 'Notes', numeric: true },
          { key: 'indexed_passages', label: 'Indexed passages', numeric: true },
        ],
        rows,
        source: 'Document and note records, plus the retrieval index built from them.',
      };
    }

    default:
      return empty;
  }
}
