import { sql } from '@/lib/db/client';
import { insertMany, isoDate, type Random } from './util';
import type { SeedContext } from './core';
import { FIRST, LAST } from './demo-agency';

const BRANDS: [string, string[]][] = [
  ['Titleist', ['T100', 'TSR3', 'Vokey SM9', 'Pro V1', 'T200']],
  ['TaylorMade', ['Stealth 2', 'P790', 'Qi10', 'MG4', 'Spider Tour']],
  ['Callaway', ['Paradym', 'Apex Pro', 'Rogue ST', 'Jaws Raw', 'Epic Speed']],
  ['Ping', ['G430', 'i230', 'Blueprint', 'Glide 4.0', 'Anser']],
  ['Mizuno', ['JPX 923', 'Pro 225', 'ST-Z 230', 'T22']],
  ['Cobra', ['Aerojet', 'King Tour', 'Darkspeed']],
  ['Srixon', ['ZX5 Mk II', 'ZX7', 'Z-Forged']],
  ['Scotty Cameron', ['Newport 2', 'Phantom X', 'Special Select']],
];

const CLUB_TYPES = ['driver', 'fairway', 'hybrid', 'iron', 'wedge', 'putter'] as const;

const PARTNER_DEFS: [string, string, string, string][] = [
  ['Troon Golf Management', 'golf_course', 'signed', 'Scottsdale, AZ'],
  ['Pebble Creek Country Club', 'golf_course', 'pilot', 'Naples, FL'],
  ['Bandon Municipal Links', 'golf_course', 'proposal', 'Bandon, OR'],
  ['Worldwide Golf Shops', 'retailer', 'negotiation', 'Santa Ana, CA'],
  ['2nd Swing Golf', 'retailer', 'signed', 'Minneapolis, MN'],
  ['Club Champion', 'pro_shop', 'discovery', 'Chicago, IL'],
  ['Titleist / Acushnet', 'oem', 'contacted', 'Fairhaven, MA'],
  ['Ping Golf', 'oem', 'identified', 'Phoenix, AZ'],
  ['GolfWRX Media', 'media', 'signed', 'Remote'],
  ['Arccos Golf', 'technology', 'discovery', 'Stamford, CT'],
  ['PGA Tour Superstore', 'retailer', 'proposal', 'Atlanta, GA'],
  ['Sunbelt Golf Ambassadors', 'ambassador', 'pilot', 'Austin, TX'],
  ['Fairway Distribution Co.', 'distributor', 'identified', 'Dallas, TX'],
  ['Heritage Links Collective', 'golf_course', 'declined', 'Charleston, SC'],
];

export async function seedParfaxDemo(ctx: SeedContext, rnd: Random) {
  const companyId = ctx.companies['parfax']!;
  const U = ctx.users;

  const deptIds = await insertMany(
    'departments',
    ['company_id', 'name', 'description', 'is_demo'],
    [
      [companyId, 'Platform', 'Scanning engine, mobile apps and marketplace', true],
      [companyId, 'Partnerships', 'Courses, retailers, OEMs and ambassadors', true],
      [companyId, 'Support', 'Player support and account operations', true],
    ],
  );

  const memberIds = await insertMany(
    'members',
    ['company_id','user_id','full_name','email','kind','title','department_id','employment_type','pay_rate','pay_rate_unit','pay_schedule','start_date','status','skills','capacity_hours','is_demo'],
    [
      [companyId, U.parfax, 'Jordan Blake', 'jordan@parfax.test', 'employee', 'General Manager', deptIds[1], 'full_time', 135000, 'year', 'semimonthly', isoDate(rnd.date(500, 900)), 'active', ['Partnerships','Operations'], 40, true],
      [companyId, null, 'Rosa Vasquez', 'rosa@parfax.test', 'employee', 'Head of Platform', deptIds[0], 'full_time', 165000, 'year', 'semimonthly', isoDate(rnd.date(400, 800)), 'active', ['Computer Vision','Mobile'], 40, true],
      [companyId, null, 'Pete Boone', 'pete@parfax.test', 'contractor', 'Support Lead', deptIds[2], 'hourly', 55, 'hour', 'on_invoice', isoDate(rnd.date(100, 400)), 'active', ['Support','Zendesk'], 30, true],
    ],
  );
  await sql(`update members set manager_id = $1 where company_id = $2 and id <> $1`, [memberIds[0], companyId]);

  // ------------------------------------------------- partner organizations
  const orgIds = await insertMany(
    'organizations',
    ['company_id','name','industry','city','country','description','owner_user_id','is_demo'],
    PARTNER_DEFS.map(([name, kind, , location]) => [
      companyId, name, kind.replace('_', ' '), location.split(',')[0], 'United States',
      `${name} — ParFax ${kind.replace('_', ' ')} partner.`, U.parfax, true,
    ]),
  );
  await insertMany(
    'organization_roles',
    ['organization_id', 'role'],
    orgIds.map((id, i) => [id, PARTNER_DEFS[i]![1] === 'oem' ? 'oem' : PARTNER_DEFS[i]![1] === 'retailer' ? 'retailer' : PARTNER_DEFS[i]![1] === 'golf_course' ? 'course' : 'partner']),
  );

  const contactIds = await insertMany(
    'contacts',
    ['company_id','organization_id','first_name','last_name','email','phone','title','owner_user_id','is_demo'],
    PARTNER_DEFS.map(([name], i) => {
      const first = rnd.pick(FIRST);
      const last = rnd.pick(LAST);
      return [
        companyId, orgIds[i], first, last,
        `${first.toLowerCase()}.${last.toLowerCase()}@${name.toLowerCase().replace(/[^a-z]+/g, '')}.test`,
        `+1 ${rnd.int(200, 989)}-${rnd.int(200, 999)}-${String(rnd.int(0, 9999)).padStart(4, '0')}`,
        rnd.pick(['Director of Partnerships', 'GM', 'VP Merchandising', 'Head of Innovation', 'Buyer']),
        U.parfax, true,
      ];
    }),
  );
  await insertMany('contact_roles', ['contact_id', 'role'], contactIds.map((id) => [id, 'partner']));

  // ---------------------------------------------------------- partnerships
  const partnershipIds = await insertMany(
    'partnerships',
    ['company_id','organization_id','name','category','stage','estimated_value','currency','revenue_share','pilot_location','equipment_requirements','contract_status','launch_date','probability','owner_user_id','last_interaction_at','next_action','next_action_date','performance','notes','position','is_demo'],
    PARTNER_DEFS.map(([name, category, stage, location], i) => {
      const signed = stage === 'signed' || stage === 'launched';
      const piloting = stage === 'pilot';
      return [
        companyId, orgIds[i], name, category, stage,
        rnd.money(25000, 480000, 5000), 'USD',
        signed || piloting ? `${rnd.int(8, 22)}% of marketplace GMV originating at the location` : null,
        piloting || signed ? location : null,
        category === 'golf_course' || category === 'pro_shop' || category === 'retailer'
          ? `${rnd.int(1, 4)} counter-mounted scanner unit(s), tablet, and staff training`
          : null,
        signed ? 'signed' : stage === 'negotiation' ? 'out_for_signature' : stage === 'proposal' ? 'drafting' : 'none',
        signed ? isoDate(rnd.date(30, 200)) : piloting ? isoDate(rnd.date(-60, -10)) : null,
        signed ? 95 : piloting ? 70 : stage === 'negotiation' ? 55 : stage === 'proposal' ? 35 : stage === 'declined' ? 0 : rnd.int(10, 30),
        U.parfax, rnd.date(1, 40),
        stage === 'declined' ? 'Revisit in the next fiscal year' : rnd.pick([
          'Send the pilot performance recap', 'Confirm scanner shipment date',
          'Draft the revenue share addendum', 'Book the on-site training session',
          'Follow up on the merchandising review',
        ]),
        stage === 'declined' ? null : isoDate(rnd.date(-30, 5)),
        JSON.stringify(signed || piloting
          ? { scans_last_30d: rnd.int(120, 2400), attach_rate_pct: rnd.int(8, 34), gmv_last_30d: rnd.money(2000, 48000, 100) }
          : {}),
        `Partnership record for ${name}.`, i, true,
      ];
    }),
  );
  await insertMany(
    'partnership_contacts',
    ['partnership_id','contact_id','role','is_primary'],
    partnershipIds.map((pid, i) => [pid, contactIds[i]!, 'primary contact', true]),
  );

  // ------------------------------------------------------------- locations
  const locationIds = await insertMany(
    'parfax_locations',
    ['name','kind','organization_id','partnership_id','city','region','country','status','scanners','launched_on','source','is_demo'],
    PARTNER_DEFS.flatMap(([name, category, stage, location], i) => {
      if (!['golf_course', 'pro_shop', 'retailer'].includes(category)) return [];
      const [city, region] = location.split(',').map((s) => s.trim());
      const status = stage === 'signed' ? 'live' : stage === 'pilot' ? 'pilot' : stage === 'declined' ? 'churned' : 'prospect';
      return [[
        name, category === 'golf_course' ? 'course' : category === 'retailer' ? 'retailer' : 'pro_shop',
        orgIds[i], partnershipIds[i], city, region ?? null, 'United States', status,
        status === 'live' ? rnd.int(1, 4) : status === 'pilot' ? 1 : 0,
        status === 'live' || status === 'pilot' ? isoDate(rnd.date(20, 240)) : null, 'demo', true,
      ]];
    }),
  );

  // ----------------------------------------------------------- ParFax users
  const userRows: unknown[][] = [];
  const TOTAL_USERS = 420;
  for (let i = 0; i < TOTAL_USERS; i++) {
    const first = rnd.pick(FIRST);
    const last = rnd.pick(LAST);
    // Signups skew toward recent months to produce a believable growth curve.
    const daysAgo = Math.floor(Math.pow(rnd.next(), 1.6) * 540);
    const signup = new Date(Date.now() - daysAgo * 864e5);
    const paid = rnd.bool(0.27);
    const churned = paid && rnd.bool(0.12);
    const suspended = rnd.bool(0.02);
    userRows.push([
      `pfx_${100000 + i}`,
      `${first.toLowerCase()}.${last.toLowerCase()}${i}@player.test`,
      `${first} ${last}`,
      `${first.toLowerCase()}${rnd.int(10, 99)}`,
      paid ? rnd.pick(['plus', 'pro', 'pro', 'team']) : 'free',
      suspended ? 'suspended' : 'active',
      signup,
      rnd.bool(0.78) ? new Date(Date.now() - rnd.int(0, Math.max(1, daysAgo)) * 864e5) : signup,
      'United States',
      rnd.pick(['CA','FL','TX','AZ','NC','SC','GA','NY','IL','CO','OR','WA']),
      rnd.pick(['organic','app_store','partner_course','referral','paid_social','media']),
      paid ? rnd.money(60, 480, 12) : 0,
      'demo', true,
    ]);
    void churned;
  }
  const parfaxUserIds = await insertMany(
    'parfax_users',
    ['external_id','email','name','handle','plan','status','signup_at','last_active_at','country','region','acquisition_source','lifetime_value','source','is_demo'],
    userRows,
  );

  // A deliberate duplicate pair so the duplicate-resolution flow is testable.
  await insertMany(
    'parfax_users',
    ['external_id','email','name','handle','plan','status','signup_at','country','acquisition_source','source','is_demo'],
    [[
      'pfx_999001', 'alex.whitfield0@player.test', 'Alex Whitfield', 'alexw_dup', 'free', 'active',
      rnd.date(30, 120), 'United States', 'organic', 'demo', true,
    ]],
  );

  // ------------------------------------------------------------- scans
  const scanRows: unknown[][] = [];
  for (let i = 0; i < 2600; i++) {
    const [brand, models] = rnd.pick(BRANDS);
    const daysAgo = Math.floor(Math.pow(rnd.next(), 1.4) * 420);
    const verified = rnd.bool(0.35);
    scanRows.push([
      rnd.pick(parfaxUserIds), `scan_${500000 + i}`,
      new Date(Date.now() - daysAgo * 864e5 - rnd.int(0, 86_400_000)),
      brand, rnd.pick(models), rnd.pick(CLUB_TYPES),
      Number((rnd.next() * 22 + 77).toFixed(2)),
      verified, verified ? rnd.bool(0.94) : null,
      locationIds.length && rnd.bool(0.4) ? rnd.pick(locationIds) : null,
      'demo', true,
    ]);
  }
  await insertMany(
    'parfax_scans',
    ['parfax_user_id','external_id','scanned_at','brand','model','club_type','confidence','verified','verified_correct','location_id','source','is_demo'],
    scanRows,
    400,
  );

  // ------------------------------------------------------- marketplace
  const marketRows: unknown[][] = [];
  for (let i = 0; i < 380; i++) {
    const kind = rnd.pick(['listing', 'listing', 'offer', 'sale', 'cancel'] as const);
    const [brand, models] = rnd.pick(BRANDS);
    marketRows.push([
      rnd.pick(parfaxUserIds), kind, `${brand} ${rnd.pick(models)}`,
      kind === 'sale' ? rnd.money(80, 950, 5) : kind === 'offer' ? rnd.money(60, 800, 5) : rnd.money(90, 1100, 5),
      'USD', new Date(Date.now() - Math.floor(Math.pow(rnd.next(), 1.3) * 300) * 864e5), 'demo', true,
    ]);
  }
  await insertMany(
    'parfax_marketplace_events',
    ['parfax_user_id','kind','item','amount','currency','occurred_at','source','is_demo'],
    marketRows,
  );

  // ---------------------------------------------------------- support
  const SUPPORT = [
    ['Scan not recognising a re-shafted driver', 'scanning'],
    ['Cannot restore my Pro subscription', 'billing'],
    ['Duplicate account created with a second email', 'account'],
    ['Marketplace listing stuck in review', 'marketplace'],
    ['App crashes on scan preview (iOS 18)', 'bug'],
    ['Requesting refund for accidental annual upgrade', 'billing'],
    ['Course partner code not applying', 'partnerships'],
  ] as const;
  await insertMany(
    'parfax_support_issues',
    ['parfax_user_id','subject','description','status','priority','category','opened_at','resolved_at','assigned_user_id','is_demo'],
    Array.from({ length: 22 }, () => {
      const [subject, category] = rnd.pick(SUPPORT);
      const status = rnd.pick(['open', 'in_progress', 'waiting', 'resolved', 'resolved', 'closed'] as const);
      const opened = rnd.date(1, 90);
      return [
        rnd.pick(parfaxUserIds), subject,
        'Reported through in-app support. Reproduction steps and device details captured in the ticket.',
        status, rnd.pick(['low', 'normal', 'normal', 'high', 'urgent']), category, opened,
        status === 'resolved' || status === 'closed' ? new Date(opened.getTime() + rnd.int(1, 8) * 864e5) : null,
        U.parfax, true,
      ];
    }),
  );

  // --------------------------------------------- ParFax subscriptions
  const paidUsers = await sql<{ id: string; plan: string; signup_at: Date }>(
    `select id, plan, signup_at from parfax_users where plan <> 'free' and is_demo = true`,
  );
  const PLAN_PRICE: Record<string, number> = { plus: 5.99, pro: 12.99, team: 29.99, lifetime: 199 };
  await insertMany(
    'subscriptions',
    ['company_id','client_id','parfax_user_id','customer_label','plan','status','interval','amount','currency','started_at','current_period_start','current_period_end','canceled_at','source','is_demo'],
    paidUsers.map((u) => {
      const status = rnd.bool(0.1) ? 'canceled' : rnd.bool(0.06) ? 'past_due' : 'active';
      const periodStart = new Date();
      periodStart.setUTCDate(1);
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      return [
        companyId, null, u.id, `ParFax player ${u.id.slice(0, 8)}`, u.plan, status, 'month',
        PLAN_PRICE[u.plan] ?? 9.99, 'USD', u.signup_at, periodStart, periodEnd,
        status === 'canceled' ? rnd.date(1, 120) : null, 'parfax', true,
      ];
    }),
    300,
  );

  return { companyId, partnershipIds, parfaxUserIds, orgIds, contactIds, locationIds, memberIds };
}

export async function seedParfaxMetrics(ctx: SeedContext, rnd: Random) {
  const metricRows: unknown[][] = [];
  const now = new Date();

  // Targets and forecasts are stored separately from production reads and are
  // always labelled, so a chart can never present a target as a fact.
  for (let m = 0; m < 6; m++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m + 1, 0));
    metricRows.push(
      ['mrr', isoDate(start), isoDate(end), 4200 + m * 950, 'USD', 'target',
       'Board target — 2026 plan', 'Set in the 2026 operating plan.', ctx.users.owner, true],
      ['registered_users', isoDate(start), isoDate(end), 4800 + m * 900, 'users', 'target',
       'Board target — 2026 plan', null, ctx.users.owner, true],
      ['scans', isoDate(start), isoDate(end), 9000 + m * 1800, 'scans', 'forecast',
       'Forecast — trailing 90-day run rate', 'Straight-line projection, not a commitment.', ctx.users.parfax, true],
    );
  }
  // Historical figures that pre-date the platform's own instrumentation.
  for (let m = 18; m > 12; m--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m + 1, 0));
    metricRows.push([
      'registered_users', isoDate(start), isoDate(end), rnd.int(220, 900), 'users', 'manual',
      'Manual backfill — legacy analytics export',
      'Entered from the pre-migration analytics export; not reproducible from production data.',
      ctx.users.parfax, true,
    ]);
  }
  await insertMany(
    'parfax_metrics',
    ['metric_key','period_start','period_end','value','unit','kind','source_label','note','created_by_id','is_demo'],
    metricRows,
  );

  await insertMany(
    'parfax_annotations',
    ['metric_key','occurred_on','title','body','created_by_id','is_demo'],
    [
      ['registered_users', isoDate(rnd.date(120, 150)), 'GolfWRX feature',
       'Coverage on GolfWRX drove a signup spike over four days.', ctx.users.parfax, true],
      ['scans', isoDate(rnd.date(60, 80)), 'Troon pilot went live',
       'First multi-location course partner activated three scanners.', ctx.users.parfax, true],
      ['mrr', isoDate(rnd.date(25, 40)), 'Pro plan price change',
       'Pro moved from $9.99 to $12.99 for new subscribers only.', ctx.users.owner, true],
    ],
  );
}
