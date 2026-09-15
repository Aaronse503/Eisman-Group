import { sql } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrate';
import { makeRandom, insertMany, isoDate } from './util';
import { seedCore, seedDemoUsers, type SeedContext } from './core';
import { seedAgencyDemo } from './demo-agency';
import { seedTeamDemo, seedWorkDemo } from './demo-ops';
import { seedMeetingsAndNotes, seedDocumentsDemo } from './demo-records';
import { seedFinanceDemo } from './demo-finance';
import { seedParfaxDemo, seedParfaxMetrics } from './demo-parfax';
import { seedInvestorsDemo } from './demo-investors';
import { reindexCompany } from '@/lib/knowledge/index-content';
import { PROVIDERS } from '@/lib/integrations/registry';

/**
 * Tables that carry demo rows. Ordered child-first so a demo reset can delete
 * without tripping over foreign keys. Every one of these tables has an
 * `is_demo` flag, and the reset only ever touches rows where it is true —
 * production records are never in scope.
 */
export const DEMO_TABLES = [
  'task_dependencies',
  'action_items',
  'meeting_participants',
  'document_links',
  'knowledge_chunks',
  'import_records',
  'imports',
  'taggings',
  'custom_field_values',
  'comments',
  'reminders',
  'notifications',
  'recently_viewed',
  'outreach_activities',
  'investor_contacts',
  'investors',
  'partnership_contacts',
  'partnerships',
  'parfax_annotations',
  'parfax_metrics',
  'parfax_support_issues',
  'parfax_marketplace_events',
  'parfax_scans',
  'parfax_locations',
  'parfax_users',
  'contractor_invoices',
  'member_assignments',
  'org_chart_changes',
  'members',
  'financial_adjustments',
  'expenses',
  'subscriptions',
  'payments',
  'invoices',
  'documents',
  'folders',
  'notes',
  'meetings',
  'calendars',
  'tasks',
  'projects',
  'deals',
  'client_team',
  'client_contacts',
  'clients',
  'contact_roles',
  'contacts',
  'organization_roles',
  'organizations',
  'message_templates',
  'activity_log',
  'teams',
  'departments',
  'saved_views',
  'tags',
] as const;

export async function resetDemoData() {
  const deleted: Record<string, number> = {};
  for (const table of DEMO_TABLES) {
    // Join tables have no is_demo column; delete their orphans instead.
    const hasFlag = await sql<{ exists: boolean }>(
      `select exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name = 'is_demo'
       ) as exists`,
      [table],
    );
    if (!hasFlag[0]?.exists) continue;
    const rows = await sql<{ count: number }>(
      `with removed as (delete from ${table} where is_demo = true returning 1)
       select count(*)::int as count from removed`,
    );
    deleted[table] = rows[0]?.count ?? 0;
  }
  // Orphaned join rows whose parents were demo records.
  await sql(`delete from task_dependencies where task_id not in (select id from tasks)`);
  await sql(`delete from meeting_participants where meeting_id not in (select id from meetings)`);
  await sql(`delete from document_links where document_id not in (select id from documents)`);
  await sql(`delete from action_items where meeting_id is not null and meeting_id not in (select id from meetings)`);
  await sql(`delete from investor_contacts where investor_id not in (select id from investors)`);
  await sql(`delete from partnership_contacts where partnership_id not in (select id from partnerships)`);
  await sql(`delete from client_contacts where client_id not in (select id from clients)`);
  await sql(`delete from client_team where client_id not in (select id from clients)`);
  await sql(`delete from contact_roles where contact_id not in (select id from contacts)`);
  await sql(`delete from organization_roles where organization_id not in (select id from organizations)`);
  await sql(`delete from member_assignments where member_id not in (select id from members)`);
  // Demo user accounts and their grants.
  await sql(`delete from user_company_roles where user_id in (select id from users where is_demo = true)`);
  await sql(`delete from users where is_demo = true`);
  return deleted;
}

async function seedPlatformRecords(ctx: SeedContext) {
  const rnd = makeRandom(4242);
  const digital = ctx.companies['eisman-digital']!;
  const parfax = ctx.companies['parfax']!;

  await insertMany(
    'tags',
    ['company_id', 'name', 'color', 'kind', 'is_demo'],
    [
      [digital, 'Key account', '#0F5132', 'client', true],
      [digital, 'At risk', '#A32A26', 'client', true],
      [digital, 'Upsell candidate', '#C8A951', 'client', true],
      [digital, 'Referral source', '#14663F', 'contact', true],
      [parfax, 'Flagship partner', '#0F5132', 'partnership', true],
      [parfax, 'Pilot', '#AB8A2B', 'partnership', true],
      [null, 'Priority investor', '#C8A951', 'investor', true],
      [null, 'Needs intro', '#2C5F73', 'investor', true],
    ],
  );

  // Configuration, not demo data: these survive a demo reset, so the insert
  // must be safe to re-run.
  await insertMany(
    'custom_field_defs',
    ['company_id','entity_type','key','label','field_type','options','required','help_text','position'],
    [
      [digital, 'client', 'primary_channel', 'Primary channel', 'select',
       ['Paid Search','Paid Social','SEO','Email','Mixed'], false, 'The channel carrying most of the budget.', 0],
      [digital, 'client', 'contract_type', 'Contract type', 'select',
       ['Retainer','Project','Hybrid'], false, null, 1],
      [parfax, 'partnership', 'scanner_count', 'Scanner units', 'number', [], false,
       'Number of scanner units committed at this location.', 0],
      [null, 'investor', 'fund_size', 'Fund size', 'currency', [], false,
       'Total fund size, if disclosed.', 0],
    ],
    200,
    `(coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_type, key) do nothing`,
  );

  // Integration connections start disconnected. They are created here so the
  // Integrations page lists every provider with an honest status, never a
  // fabricated "connected" state.
  await insertMany(
    'integration_connections',
    ['company_id','provider','status','mode','created_by_id'],
    PROVIDERS.map((p) => [
      p.scope === 'company' ? (p.id === 'parfax_crm' ? parfax : digital) : null,
      p.id,
      'disconnected',
      'disconnected',
      ctx.users.owner,
    ]),
    200,
    `(provider, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing`,
  );

  await insertMany(
    'saved_views',
    ['company_id','user_id','entity_type','name','config','is_shared'],
    [
      [digital, null, 'client', 'At-risk accounts',
       JSON.stringify({ filters: { status: 'active', maxHealth: 60 }, sort: 'health_score:asc' }), true],
      [digital, null, 'task', 'Overdue across all clients',
       JSON.stringify({ filters: { overdue: true }, sort: 'due_at:asc' }), true],
      [null, null, 'investor', 'Needs follow-up this week',
       JSON.stringify({ filters: { followUpWithinDays: 7 }, sort: 'next_follow_up_at:asc' }), true],
      [parfax, null, 'partnership', 'Signed and live',
       JSON.stringify({ filters: { stage: ['signed', 'launched'] } }), true],
    ],
  );

  // A handful of reminders and notifications for the owner.
  const overdue = await sql<{ id: string; title: string }>(
    `select id, title from tasks where completed_at is null and due_at < now() and is_demo = true limit 3`,
  );
  await insertMany(
    'notifications',
    ['user_id','company_id','kind','title','body','entity_type','entity_id','href','is_demo'],
    [
      ...overdue.map((t) => [
        ctx.users.owner, digital, 'warning', 'Task is overdue', t.title, 'task', t.id,
        `/tasks/${t.id}`, true,
      ]),
      [ctx.users.owner, null, 'reminder', 'Investor follow-ups due this week',
       'Several investors are scheduled for follow-up in the next seven days.', 'investor', null,
       '/investors?view=follow_up', true],
      [ctx.users.owner, parfax, 'info', 'Troon pilot performance updated',
       'Scan volume at the Troon pilot rose week over week.', 'partnership', null, '/partnerships', true],
    ],
  );

  const investorsForReminder = await sql<{ id: string; name: string }>(
    `select id, name from investors where next_follow_up_at is not null and is_demo = true limit 4`,
  );
  await insertMany(
    'reminders',
    ['company_id','user_id','entity_type','entity_id','title','body','remind_at','is_demo'],
    investorsForReminder.map((inv) => [
      null, ctx.users.owner, 'investor', inv.id, `Follow up with ${inv.name}`,
      'Scheduled from the investor pipeline.', rnd.date(-10, -1), true,
    ]),
  );

  await insertMany(
    'activity_log',
    ['company_id','actor_user_id','entity_type','entity_id','action','summary','is_demo'],
    [
      [digital, ctx.users.am, 'client', null, 'updated', 'Updated the health score for Lumen Home Systems', true],
      [digital, ctx.users.admin, 'invoice', null, 'created', 'Issued the September retainer invoices', true],
      [parfax, ctx.users.parfax, 'partnership', null, 'stage_changed', 'Moved 2nd Swing Golf to Signed', true],
      [null, ctx.users.owner, 'investor', null, 'created', 'Added 6 new investors to the pipeline', true],
      [digital, ctx.users.member, 'document', null, 'uploaded', 'Uploaded the Q3 performance review', true],
    ],
  );
  void isoDate;
}

export interface SeedResult {
  companies: number;
  demoUsers: number;
  counts: Record<string, number>;
}

export async function seedAll(opts: { demo?: boolean; ownerPassword?: string } = {}) {
  await runMigrations({ silent: true });
  const ctx = await seedCore({ ownerPassword: opts.ownerPassword });
  if (!opts.demo) return { ctx, seededDemo: false };

  await seedDemoUsers(ctx);
  const rnd = makeRandom();

  const agency = await seedAgencyDemo(ctx, rnd);
  const team = await seedTeamDemo(ctx, agency, rnd);
  const work = await seedWorkDemo(ctx, agency, team, rnd);
  await seedMeetingsAndNotes(ctx, agency, work, rnd);
  await seedDocumentsDemo(ctx, agency, rnd);
  await seedFinanceDemo(ctx, agency, team, rnd);
  await seedParfaxDemo(ctx, rnd);
  await seedParfaxMetrics(ctx, rnd);
  await seedInvestorsDemo(ctx, rnd);
  await seedPlatformRecords(ctx);

  // Build the retrieval corpus so the knowledge assistant works immediately.
  for (const companyId of Object.values(ctx.companies)) {
    await reindexCompany(companyId);
  }

  return { ctx, seededDemo: true };
}

export async function demoCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ['clients','contacts','organizations','tasks','meetings','notes','documents','invoices','payments','members','partnerships','investors','parfax_users','parfax_scans','subscriptions']) {
    const rows = await sql<{ count: number }>(
      `select count(*)::int as count from ${table} where is_demo = true`,
    );
    out[table] = rows[0]?.count ?? 0;
  }
  return out;
}
