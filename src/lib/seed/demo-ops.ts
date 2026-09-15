import { sql } from '@/lib/db/client';
import { insertMany, isoDate, type Random } from './util';
import type { SeedContext } from './core';
import { SERVICES } from './demo-agency';

interface AgencyRefs {
  companyId: string;
  deptIds: { deptClient: string; deptMedia: string; deptCreative: string; deptOps: string };
  clientIds: string[];
  clientOrgIds: string[];
  vendorOrgIds: string[];
  contactIds: string[];
  contactOrgIndex: number[];
}

const SKILLS = ['Paid Search','Paid Social','SEO','Copywriting','Motion Design','Figma','Webflow','GA4','Lifecycle','CRO','Brand Strategy','Video Editing'];

export async function seedTeamDemo(ctx: SeedContext, refs: AgencyRefs, rnd: Random) {
  const { companyId, deptIds, clientIds } = refs;
  const U = ctx.users;

  const leadership = [
    ['Dana Ortiz', 'Director of Operations', deptIds.deptOps, 'employee', U.admin, 'full_time', 148000, 'year', 'semimonthly'],
    ['Priya Raman', 'Senior Account Manager', deptIds.deptClient, 'employee', U.am, 'full_time', 96000, 'year', 'semimonthly'],
    ['Marcus Reed', 'Head of Finance', deptIds.deptOps, 'employee', U.finance, 'part_time', 120000, 'year', 'semimonthly'],
    ['Noa Feldman', 'Growth Strategist', deptIds.deptMedia, 'employee', U.member, 'full_time', 88000, 'year', 'semimonthly'],
  ] as const;

  const memberRows: unknown[][] = leadership.map(([name, title, dept, kind, userId, empType, rate, unit, schedule]) => [
    companyId, userId, name, `${name.split(' ')[0]!.toLowerCase()}@eismandigital.com`, kind, title,
    `Owns ${title.toLowerCase()} for Eisman Digital.`, dept, null, empType, rate, unit, schedule,
    isoDate(rnd.date(400, 1400)), 'active', rnd.picks(SKILLS, 4), 40, false, true,
  ]);

  const contractorDefs = [
    ['Sam Okafor', 'Contract Designer', deptIds.deptCreative, U.contractor, 85, 'hour', 25],
    ['Imani Achebe', 'Paid Social Contractor', deptIds.deptMedia, null, 95, 'hour', 20],
    ['Hugh Lindqvist', 'Motion Designer', deptIds.deptCreative, null, 110, 'hour', 15],
    ['Beatriz Ferraro', 'SEO Consultant', deptIds.deptMedia, null, 125, 'hour', 12],
    ['Omar Mensah', 'Webflow Developer', deptIds.deptCreative, null, 105, 'hour', 18],
    ['Tess Byrne', 'Copywriter', deptIds.deptCreative, null, 75, 'hour', 22],
  ] as const;

  for (const [name, title, dept, userId, rate, unit, capacity] of contractorDefs) {
    memberRows.push([
      companyId, userId, name, `${name.split(' ')[0]!.toLowerCase()}.${name.split(' ')[1]!.toLowerCase()}@contractor.test`,
      'contractor', title, `${title} engaged on a project basis.`, dept, null, 'hourly',
      rate, unit, 'on_invoice', isoDate(rnd.date(60, 700)), 'active', rnd.picks(SKILLS, 3), capacity, false, true,
    ]);
  }

  // An intentionally vacant role, so the org chart exercises that state.
  memberRows.push([
    companyId, null, 'Performance Media Lead (open)', null, 'employee', 'Performance Media Lead',
    'Open requisition: own paid media strategy across the client portfolio.',
    deptIds.deptMedia, null, 'full_time', 125000, 'year', 'semimonthly', null, 'active',
    ['Paid Search', 'Paid Social', 'Analytics'], 40, true, true,
  ]);

  const memberIds = await insertMany(
    'members',
    ['company_id','user_id','full_name','email','kind','title','role_description','department_id','manager_id','employment_type','pay_rate','pay_rate_unit','pay_schedule','start_date','status','skills','capacity_hours','is_vacant','is_demo'],
    memberRows,
  );

  // Reporting lines: everyone reports to the Director of Operations.
  const director = memberIds[0]!;
  await sql(`update members set manager_id = $1 where company_id = $2 and id <> $1`, [director, companyId]);

  const assignmentRows: unknown[][] = [];
  memberIds.slice(1).forEach((memberId, i) => {
    for (const clientId of rnd.picks(clientIds.slice(0, 6), rnd.int(1, 3))) {
      assignmentRows.push([memberId, clientId, rnd.pick(['lead','contributor','reviewer']), rnd.int(10, 45), isoDate(rnd.date(30, 300))]);
    }
    void i;
  });
  await insertMany('member_assignments', ['member_id','client_id','role','allocation_pct','start_date'], assignmentRows);

  await insertMany(
    'client_team',
    ['client_id','user_id','role','allocation_pct'],
    clientIds.slice(0, 6).flatMap((clientId) => [
      [clientId, U.am, 'account lead', 25],
      [clientId, U.member, 'strategist', 15],
    ]),
  );

  // Contractor invoices across paid / submitted / approved states.
  const contractorMemberIds = memberIds.slice(leadership.length, leadership.length + contractorDefs.length);
  const ciRows: unknown[][] = [];
  contractorMemberIds.forEach((memberId, idx) => {
    for (let m = 0; m < 3; m++) {
      const periodEnd = rnd.date(m * 30 + 3, m * 30 + 8);
      const periodStart = new Date(periodEnd);
      periodStart.setUTCDate(periodStart.getUTCDate() - 29);
      const status = m === 0 ? rnd.pick(['submitted', 'approved']) : 'paid';
      const amount = rnd.money(1800, 9400, 50);
      ciRows.push([
        companyId, memberId, `CTR-${1200 + idx * 10 + m}`, isoDate(periodStart), isoDate(periodEnd),
        amount, status, periodEnd, isoDate(new Date(periodEnd.getTime() + 14 * 864e5)),
        status === 'paid' ? new Date(periodEnd.getTime() + 9 * 864e5) : null, true,
      ]);
    }
  });
  await insertMany(
    'contractor_invoices',
    ['company_id','member_id','number','period_start','period_end','amount','status','submitted_at','due_date','paid_at','is_demo'],
    ciRows,
  );

  return { memberIds, director, contractorMemberIds };
}

export async function seedWorkDemo(
  ctx: SeedContext,
  refs: AgencyRefs,
  team: { memberIds: string[] },
  rnd: Random,
) {
  const { companyId, clientIds } = refs;
  const U = ctx.users;
  const assignees = [U.admin, U.am, U.member, U.contractor, U.owner];

  // ------------------------------------------------------------- projects
  const projectRows = clientIds.slice(0, 7).flatMap((clientId, i) => [
    [companyId, clientId, `${['Q3 Growth Sprint','Website Refresh','Always-On Media','Brand Refresh','Lifecycle Build','SEO Foundation','Launch Campaign'][i]}`,
     'Delivery workstream for the current contract period.', rnd.pick(['active','active','planned']),
     rnd.pick(assignees), isoDate(rnd.date(60, 120)), isoDate(rnd.date(-60, -10)), true],
  ]);
  const projectIds = await insertMany(
    'projects',
    ['company_id','client_id','name','description','status','owner_user_id','start_date','due_date','is_demo'],
    projectRows,
  );

  // ---------------------------------------------------------------- tasks
  const TASK_TITLES = [
    'Draft September performance recap','Rebuild conversion tracking for checkout','QA new landing page variants',
    'Prepare renewal proposal','Refresh ad creative set','Audit keyword cannibalisation','Set up lifecycle welcome flow',
    'Review contractor invoices','Reconcile Stripe payouts','Update client health scores','Write case study draft',
    'Plan Q4 budget allocation','Interview candidates for media lead','Migrate analytics to server-side tagging',
    'Build attribution dashboard','Refresh brand guidelines','Run competitor teardown','Schedule quarterly business review',
    'Fix broken redirects after migration','Negotiate vendor renewal','Publish blog content calendar','Test new bidding strategy',
  ];
  const STATUSES = ['backlog','todo','in_progress','blocked','in_review','done'] as const;

  const taskRows: unknown[][] = [];
  for (let i = 0; i < 68; i++) {
    const status = rnd.pick(STATUSES);
    const done = status === 'done';
    const overdue = !done && rnd.bool(0.22);
    const due = overdue ? rnd.date(1, 25) : rnd.date(-28, 3);
    const clientId = rnd.bool(0.75) ? rnd.pick(clientIds) : null;
    const assignee = rnd.pick(assignees);
    taskRows.push([
      companyId,
      rnd.bool(0.6) ? rnd.pick(projectIds) : null,
      clientId,
      `${rnd.pick(TASK_TITLES)}${rnd.bool(0.3) ? ` — ${rnd.pick(SERVICES)}` : ''}`,
      rnd.bool(0.55) ? 'Details captured from the last working session. See linked notes and documents.' : null,
      status,
      rnd.pick(['low','normal','normal','high','urgent']),
      assignee,
      rnd.pick(assignees),
      rnd.bool(0.25) ? rnd.pick(assignees) : null,
      status === 'blocked' ? rnd.pick(['Client approval','Vendor response','Legal review','Budget sign-off']) : null,
      due,
      done ? rnd.date(1, 30) : null,
      rnd.bool(0.4) ? rnd.int(1, 12) : null,
      rnd.bool(0.12),
      i,
      true,
    ]);
  }
  // A recurring executive task, to exercise the recurrence UI.
  taskRows.push([
    companyId, null, null, 'Weekly executive review prep', 'Pull the holdings dashboard and flag anything off-plan.',
    'todo', 'high', U.owner, U.owner, null, null, rnd.date(-7, -1), null, 1, true, 100, true,
  ]);

  const taskIds = await insertMany(
    'tasks',
    ['company_id','project_id','client_id','title','description','status','priority','assignee_user_id','created_by_id','delegated_by_id','waiting_on','due_at','completed_at','estimate_hours','is_personal','position','is_demo'],
    taskRows,
  );
  await sql(`update tasks set recurrence_rule = 'FREQ=WEEKLY;BYDAY=MO' where id = $1`, [taskIds.at(-1)]);

  // Subtasks and a dependency chain.
  const parentIds = taskIds.slice(0, 6);
  const subtaskRows = parentIds.flatMap((parentId, i) =>
    Array.from({ length: 2 }, (_, n) => [
      companyId, parentId, `Step ${n + 1} of ${['research','draft','review'][n % 3]}`,
      rnd.pick(['todo', 'in_progress', 'done']), rnd.pick(assignees), rnd.date(-14, 5), i * 2 + n, true,
    ]),
  );
  await insertMany(
    'tasks',
    ['company_id','parent_task_id','title','status','assignee_user_id','due_at','position','is_demo'],
    subtaskRows,
  );
  await insertMany(
    'task_dependencies',
    ['task_id', 'depends_on_task_id'],
    [[taskIds[1]!, taskIds[0]!], [taskIds[2]!, taskIds[1]!]],
  );

  // --------------------------------------------------------- deals
  const dealRows = clientIds.slice(8, 12).map((clientId, i) => [
    companyId, clientId, refs.clientOrgIds[8 + i], null,
    `${['Kestrel Robotics retainer','Meridian Wellness launch','Brightline Logistics SEO','Tallgrass referral package'][i]}`,
    rnd.pick(['discovery','qualified','proposal','negotiation']),
    rnd.money(45000, 220000, 1000), rnd.int(20, 80), isoDate(rnd.date(-75, -10)),
    rnd.pick(['Referral','Inbound','Outbound','Event']), rnd.pick([U.am, U.admin]), true,
  ]);
  const dealIds = await insertMany(
    'deals',
    ['company_id','client_id','organization_id','primary_contact_id','name','stage','value','probability','expected_close','source','owner_user_id','is_demo'],
    dealRows,
  );

  return { projectIds, taskIds, dealIds };
}
