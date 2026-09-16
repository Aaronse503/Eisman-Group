import { sql, one } from '@/lib/db/client';
import type { DateRange } from '@/lib/dates';

export interface ParfaxOverview {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  newUsersPrevious: number;
  freeUsers: number;
  paidUsers: number;
  suspendedUsers: number;
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  canceledInPeriod: number;
  churnRate: number;
  conversions: number;
  conversionRate: number;
  totalScans: number;
  scansInPeriod: number;
  verifiedScans: number;
  scanAccuracy: number | null;
  marketplaceEvents: number;
  marketplaceGmv: number;
  liveLocations: number;
  pilotLocations: number;
  openSupportIssues: number;
}

export async function getParfaxOverview(range: DateRange, comparison: DateRange): Promise<ParfaxOverview> {
  const [row] = await sql<Record<string, number>>(
    `select
       (select count(*)::int from parfax_users where deleted_at is null) as total_users,
       (select count(*)::int from parfax_users
         where deleted_at is null and status = 'active'
           and last_active_at > now() - interval '30 days') as active_users,
       (select count(*)::int from parfax_users
         where deleted_at is null and signup_at between $1 and $2) as new_users,
       (select count(*)::int from parfax_users
         where deleted_at is null and signup_at between $3 and $4) as new_users_previous,
       (select count(*)::int from parfax_users where deleted_at is null and plan = 'free') as free_users,
       (select count(*)::int from parfax_users where deleted_at is null and plan <> 'free') as paid_users,
       (select count(*)::int from parfax_users where deleted_at is null and status = 'suspended') as suspended_users,
       coalesce((select sum(case interval
           when 'year' then amount / 12 when 'week' then amount * 4.345
           when 'day' then amount * 30 else amount end * quantity)
         from subscriptions
         where parfax_user_id is not null and deleted_at is null
           and status in ('active','trialing')), 0) as mrr,
       (select count(*)::int from subscriptions
         where parfax_user_id is not null and deleted_at is null
           and status in ('active','trialing')) as active_subscriptions,
       (select count(*)::int from subscriptions
         where parfax_user_id is not null and deleted_at is null
           and canceled_at between $1 and $2) as canceled_in_period,
       (select count(*)::int from subscriptions
         where parfax_user_id is not null and deleted_at is null
           and started_at between $1 and $2) as conversions,
       (select count(*)::int from parfax_scans) as total_scans,
       (select count(*)::int from parfax_scans where scanned_at between $1 and $2) as scans_in_period,
       (select count(*)::int from parfax_scans
         where verified = true and scanned_at between $1 and $2) as verified_scans,
       (select count(*)::int from parfax_scans
         where verified_correct = true and scanned_at between $1 and $2) as verified_correct,
       (select count(*)::int from parfax_marketplace_events
         where occurred_at between $1 and $2) as marketplace_events,
       coalesce((select sum(amount) from parfax_marketplace_events
         where kind = 'sale' and occurred_at between $1 and $2), 0) as marketplace_gmv,
       (select count(*)::int from parfax_locations where status = 'live') as live_locations,
       (select count(*)::int from parfax_locations where status = 'pilot') as pilot_locations,
       (select count(*)::int from parfax_support_issues
         where status in ('open','in_progress','waiting')) as open_support_issues`,
    [range.from, range.to, comparison.from, comparison.to],
  );

  const mrr = Number(row!.mrr ?? 0);
  const denominator = row!.active_subscriptions + row!.canceled_in_period;
  return {
    totalUsers: row!.total_users,
    activeUsers: row!.active_users,
    newUsers: row!.new_users,
    newUsersPrevious: row!.new_users_previous,
    freeUsers: row!.free_users,
    paidUsers: row!.paid_users,
    suspendedUsers: row!.suspended_users,
    mrr,
    arr: mrr * 12,
    activeSubscriptions: row!.active_subscriptions,
    canceledInPeriod: row!.canceled_in_period,
    churnRate: denominator ? (row!.canceled_in_period / denominator) * 100 : 0,
    conversions: row!.conversions,
    conversionRate: row!.new_users ? (row!.conversions / row!.new_users) * 100 : 0,
    totalScans: row!.total_scans,
    scansInPeriod: row!.scans_in_period,
    verifiedScans: row!.verified_scans,
    scanAccuracy: row!.verified_scans ? (row!.verified_correct / row!.verified_scans) * 100 : null,
    marketplaceEvents: row!.marketplace_events,
    marketplaceGmv: Number(row!.marketplace_gmv ?? 0),
    liveLocations: row!.live_locations,
    pilotLocations: row!.pilot_locations,
    openSupportIssues: row!.open_support_issues,
  };
}

export async function getSignupTrend(months = 12) {
  return sql<{ month: string; signups: number; paid: number }>(
    `with months as (
       select to_char(generate_series(
         date_trunc('month', current_date) - make_interval(months => $1::int - 1),
         date_trunc('month', current_date), interval '1 month'), 'YYYY-MM') as month
     )
     select m.month,
       (select count(*)::int from parfax_users u
         where u.deleted_at is null and to_char(u.signup_at, 'YYYY-MM') = m.month) as signups,
       (select count(*)::int from parfax_users u
         where u.deleted_at is null and u.plan <> 'free'
           and to_char(u.signup_at, 'YYYY-MM') = m.month) as paid
     from months m order by m.month`,
    [months],
  );
}

export async function getScanTrend(months = 12) {
  return sql<{ month: string; scans: number; verified: number }>(
    `with months as (
       select to_char(generate_series(
         date_trunc('month', current_date) - make_interval(months => $1::int - 1),
         date_trunc('month', current_date), interval '1 month'), 'YYYY-MM') as month
     )
     select m.month,
       (select count(*)::int from parfax_scans s
         where to_char(s.scanned_at, 'YYYY-MM') = m.month) as scans,
       (select count(*)::int from parfax_scans s
         where s.verified = true and to_char(s.scanned_at, 'YYYY-MM') = m.month) as verified
     from months m order by m.month`,
    [months],
  );
}

export async function getTopBrands(range: DateRange, limit = 10) {
  return sql<{ brand: string; model: string; scans: number }>(
    `select coalesce(brand, 'Unknown') as brand, coalesce(model, '') as model, count(*)::int as scans
     from parfax_scans
     where scanned_at between $1 and $2
     group by brand, model order by scans desc limit $3`,
    [range.from, range.to, limit],
  );
}

export async function getBrandTotals(range: DateRange, limit = 8) {
  return sql<{ brand: string; scans: number }>(
    `select coalesce(brand, 'Unknown') as brand, count(*)::int as scans
     from parfax_scans where scanned_at between $1 and $2
     group by brand order by scans desc limit $3`,
    [range.from, range.to, limit],
  );
}

export interface ParfaxUserRow {
  id: string;
  external_id: string | null;
  email: string;
  name: string | null;
  handle: string | null;
  plan: string;
  status: string;
  signup_at: Date;
  last_active_at: Date | null;
  country: string | null;
  region: string | null;
  acquisition_source: string | null;
  lifetime_value: number;
  promo_access: string | null;
  promo_expires_at: Date | null;
  merged_into_id: string | null;
  source: string;
  is_demo: boolean;
  scan_count: number;
  subscription_status: string | null;
  open_issues: number;
  note_count: number;
}

export async function listParfaxUsers(opts: {
  search?: string;
  plan?: string;
  status?: string;
  activeWithinDays?: number;
  limit?: number;
}): Promise<ParfaxUserRow[]> {
  const params: unknown[] = [];
  const where = ['u.deleted_at is null'];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (opts.search) {
    const needle = p(`%${opts.search}%`);
    where.push(`(u.email ilike ${needle} or u.name ilike ${needle} or u.handle ilike ${needle} or u.external_id ilike ${needle})`);
  }
  if (opts.plan === 'paid') where.push(`u.plan <> 'free'`);
  else if (opts.plan) where.push(`u.plan = ${p(opts.plan)}`);
  if (opts.status) where.push(`u.status = ${p(opts.status)}`);
  if (opts.activeWithinDays) {
    where.push(`u.last_active_at > now() - make_interval(days => ${p(opts.activeWithinDays)}::int)`);
  }

  return sql<ParfaxUserRow>(
    `select u.*,
       (select count(*)::int from parfax_scans s where s.parfax_user_id = u.id) as scan_count,
       (select s.status from subscriptions s
         where s.parfax_user_id = u.id and s.deleted_at is null
         order by s.created_at desc limit 1) as subscription_status,
       (select count(*)::int from parfax_support_issues i
         where i.parfax_user_id = u.id and i.status in ('open','in_progress','waiting')) as open_issues,
       (select count(*)::int from notes n
         where n.entity_type = 'parfax_user' and n.entity_id = u.id and n.deleted_at is null) as note_count
     from parfax_users u
     where ${where.join(' and ')}
     order by u.signup_at desc
     limit ${Math.min(opts.limit ?? 250, 1000)}`,
    params,
  );
}

export async function getParfaxUser(id: string) {
  return one<ParfaxUserRow>(
    `select u.*,
       (select count(*)::int from parfax_scans s where s.parfax_user_id = u.id) as scan_count,
       (select s.status from subscriptions s
         where s.parfax_user_id = u.id and s.deleted_at is null
         order by s.created_at desc limit 1) as subscription_status,
       (select count(*)::int from parfax_support_issues i
         where i.parfax_user_id = u.id and i.status in ('open','in_progress','waiting')) as open_issues,
       (select count(*)::int from notes n
         where n.entity_type = 'parfax_user' and n.entity_id = u.id and n.deleted_at is null) as note_count
     from parfax_users u where u.id = $1 and u.deleted_at is null`,
    [id],
  );
}

export async function getParfaxUserDetail(id: string) {
  const [scans, subscriptions, issues, marketplace] = await Promise.all([
    sql<{ id: string; scanned_at: Date; brand: string | null; model: string | null; club_type: string | null; confidence: number | null; verified: boolean | null; verified_correct: boolean | null }>(
      `select id, scanned_at, brand, model, club_type, confidence, verified, verified_correct
       from parfax_scans where parfax_user_id = $1 order by scanned_at desc limit 50`,
      [id],
    ),
    sql<{ id: string; plan: string; status: string; amount: number; currency: string; interval: string; started_at: Date | null; current_period_end: Date | null; canceled_at: Date | null; source: string }>(
      `select id, plan, status, amount, currency, interval, started_at, current_period_end, canceled_at, source
       from subscriptions where parfax_user_id = $1 and deleted_at is null order by created_at desc`,
      [id],
    ),
    sql<{ id: string; subject: string; status: string; priority: string; category: string | null; opened_at: Date; resolved_at: Date | null }>(
      `select id, subject, status, priority, category, opened_at, resolved_at
       from parfax_support_issues where parfax_user_id = $1 order by opened_at desc limit 25`,
      [id],
    ),
    sql<{ id: string; kind: string; item: string | null; amount: number; occurred_at: Date }>(
      `select id, kind, item, amount, occurred_at from parfax_marketplace_events
       where parfax_user_id = $1 order by occurred_at desc limit 25`,
      [id],
    ),
  ]);
  return { scans, subscriptions, issues, marketplace };
}

/** Accounts that share an email prefix or name — candidates for merging. */
export async function findParfaxDuplicates(limit = 25) {
  return sql<{ key: string; ids: string[]; emails: string[]; names: string[] }>(
    `select lower(coalesce(name, split_part(email, '@', 1))) as key,
            array_agg(id) as ids, array_agg(email) as emails, array_agg(coalesce(name, '')) as names
     from parfax_users
     where deleted_at is null and merged_into_id is null
     group by 1 having count(*) > 1
     limit $1`,
    [limit],
  );
}

export async function listParfaxLocations() {
  return sql<{
    id: string; name: string; kind: string; city: string | null; region: string | null;
    status: string; scanners: number; launched_on: string | null;
    partnership_id: string | null; scan_count: number;
  }>(
    `select l.*, (select count(*)::int from parfax_scans s where s.location_id = l.id) as scan_count
     from parfax_locations l order by l.status, l.name`,
  );
}

export async function listSupportIssues(status?: string) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (status) {
    params.push(status);
    where.push(`i.status = $${params.length}`);
  }
  return sql<{
    id: string; subject: string; description: string | null; status: string; priority: string;
    category: string | null; opened_at: Date; resolved_at: Date | null;
    user_email: string | null; parfax_user_id: string | null; assigned_to: string | null;
  }>(
    `select i.id, i.subject, i.description, i.status, i.priority, i.category, i.opened_at,
            i.resolved_at, u.email as user_email, i.parfax_user_id, a.name as assigned_to
     from parfax_support_issues i
     left join parfax_users u on u.id = i.parfax_user_id
     left join users a on a.id = i.assigned_user_id
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by i.status, i.opened_at desc limit 200`,
    params,
  );
}

export async function listParfaxMetrics(metricKey?: string) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (metricKey) {
    params.push(metricKey);
    where.push(`m.metric_key = $${params.length}`);
  }
  return sql<{
    id: string; metric_key: string; period_start: string; period_end: string;
    value: number; unit: string | null; kind: string; source_label: string;
    note: string | null; created_by: string | null; is_demo: boolean; updated_at: Date;
  }>(
    `select m.*, u.name as created_by
     from parfax_metrics m left join users u on u.id = m.created_by_id
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by m.metric_key, m.period_start desc limit 300`,
    params,
  );
}

export async function listParfaxAnnotations() {
  return sql<{
    id: string; metric_key: string | null; occurred_on: string; title: string;
    body: string | null; created_by: string | null;
  }>(
    `select a.*, u.name as created_by from parfax_annotations a
     left join users u on u.id = a.created_by_id
     order by a.occurred_on desc limit 100`,
  );
}
