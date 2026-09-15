import { insertMany, isoDate, type Random } from './util';
import type { SeedContext } from './core';

const SERVICES = [
  'Paid Media',
  'SEO',
  'Content Studio',
  'Lifecycle Email',
  'Brand Design',
  'Web Development',
  'Analytics',
  'Social',
];

const CLIENT_DEFS = [
  { name: 'Northwind Outfitters', industry: 'Outdoor retail', domain: 'northwindoutfitters.com', status: 'active', retainer: 12500, health: 88 },
  { name: 'Harbor & Vine', industry: 'Hospitality', domain: 'harborandvine.com', status: 'active', retainer: 8500, health: 74 },
  { name: 'Cedar Ridge Dental Group', industry: 'Healthcare', domain: 'cedarridgedental.com', status: 'active', retainer: 6000, health: 91 },
  { name: 'Verity Financial Partners', industry: 'Financial services', domain: 'verityfp.com', status: 'active', retainer: 15000, health: 62 },
  { name: 'Lumen Home Systems', industry: 'Home services', domain: 'lumenhome.com', status: 'active', retainer: 9500, health: 45 },
  { name: 'Saltwater Athletic', industry: 'Apparel', domain: 'saltwaterathletic.com', status: 'active', retainer: 11000, health: 79 },
  { name: 'Foundry Row Coffee', industry: 'Food & beverage', domain: 'foundryrow.coffee', status: 'paused', retainer: 4500, health: 38 },
  { name: 'Anchor Point Legal', industry: 'Legal', domain: 'anchorpointlegal.com', status: 'former', retainer: 0, health: 30 },
  { name: 'Kestrel Robotics', industry: 'Industrial tech', domain: 'kestrelrobotics.io', status: 'prospect', retainer: 0, health: 60 },
  { name: 'Meridian Wellness Collective', industry: 'Wellness', domain: 'meridianwellness.co', status: 'prospect', retainer: 0, health: 55 },
  { name: 'Brightline Logistics', industry: 'Logistics', domain: 'brightlinelogistics.com', status: 'prospect', retainer: 0, health: 48 },
  { name: 'Tallgrass Realty Group', industry: 'Real estate', domain: 'tallgrassrealty.com', status: 'referral_partner', retainer: 0, health: 82 },
];

const FIRST = ['Alex','Jamie','Morgan','Riley','Casey','Avery','Quinn','Elena','Marcus','Dana','Priya','Noa','Sam','Val','Jordan','Tess','Omar','Leila','Grant','Beatriz','Hugh','Imani','Pete','Rosa'];
const LAST = ['Whitfield','Okonkwo','Delgado','Harrington','Nakamura','Boone','Alvarez','Petrov','Laurent','Mensah','Kowalski','Sandoval','Byrne','Ferraro','Achebe','Lindqvist','Moreau','Vasquez'];

export async function seedAgencyDemo(ctx: SeedContext, rnd: Random) {
  const companyId = ctx.companies['eisman-digital']!;
  const U = ctx.users;

  // ------------------------------------------------------------ structure
  const deptIds = await insertMany(
    'departments',
    ['company_id', 'name', 'description', 'is_demo'],
    [
      [companyId, 'Client Services', 'Account management and client strategy', true],
      [companyId, 'Performance Media', 'Paid acquisition across search, social and retail media', true],
      [companyId, 'Creative Studio', 'Design, content production and brand', true],
      [companyId, 'Operations', 'Finance, people, systems and delivery operations', true],
    ],
  );
  const [deptClient, deptMedia, deptCreative, deptOps] = deptIds as [string, string, string, string];

  await insertMany(
    'teams',
    ['company_id', 'department_id', 'name', 'is_demo'],
    [
      [companyId, deptClient, 'Enterprise Accounts', true],
      [companyId, deptClient, 'Growth Accounts', true],
      [companyId, deptMedia, 'Paid Search', true],
      [companyId, deptCreative, 'Content Studio', true],
    ],
  );

  // -------------------------------------------------------- organizations
  const orgRows = CLIENT_DEFS.map((c) => [
    companyId,
    c.name,
    c.domain,
    `https://${c.domain}`,
    c.industry,
    rnd.pick(['1-10', '11-50', '51-200', '201-500']),
    `${c.name} — ${c.industry.toLowerCase()} business working with Eisman Digital.`,
    rnd.pick(['United States']),
    rnd.pick(['Portland', 'Austin', 'Charlotte', 'Denver', 'Providence', 'Madison', 'Savannah']),
    rnd.pick([U.am, U.admin, U.member]),
    true,
  ]);
  const vendorRows = [
    ['Adcircle Media Buying', 'adcircle.io', 'Advertising'],
    ['Pixelforge Studios', 'pixelforge.studio', 'Creative production'],
    ['Northbeam Analytics', 'northbeam.co', 'Analytics software'],
  ].map(([name, domain, industry]) => [
    companyId,
    name,
    domain,
    `https://${domain}`,
    industry,
    '11-50',
    `${name} — vendor partner.`,
    'United States',
    'Remote',
    U.admin,
    true,
  ]);

  const orgIds = await insertMany(
    'organizations',
    ['company_id','name','domain','website','industry','size_band','description','country','city','owner_user_id','is_demo'],
    [...orgRows, ...vendorRows],
  );
  const clientOrgIds = orgIds.slice(0, CLIENT_DEFS.length);
  const vendorOrgIds = orgIds.slice(CLIENT_DEFS.length);

  await insertMany(
    'organization_roles',
    ['organization_id', 'role'],
    [
      ...CLIENT_DEFS.map((c, i) => [
        clientOrgIds[i]!,
        c.status === 'prospect' ? 'prospect' : c.status === 'referral_partner' ? 'partner' : 'client',
      ]),
      ...vendorOrgIds.map((id) => [id, 'vendor']),
    ],
  );

  // -------------------------------------------------------------- contacts
  const contactRows: unknown[][] = [];
  const contactOrgIndex: number[] = [];
  CLIENT_DEFS.forEach((c, i) => {
    const count = c.status === 'active' ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const first = rnd.pick(FIRST);
      const last = rnd.pick(LAST);
      contactRows.push([
        companyId,
        clientOrgIds[i],
        first,
        last,
        `${first.toLowerCase()}.${last.toLowerCase()}@${c.domain}`,
        `+1 ${rnd.int(200, 989)}-${rnd.int(200, 999)}-${String(rnd.int(0, 9999)).padStart(4, '0')}`,
        n === 0 ? rnd.pick(['Founder', 'CEO', 'VP Marketing', 'Owner']) : rnd.pick(['Marketing Manager', 'Director of Growth', 'Operations Lead']),
        rnd.pick([U.am, U.admin, U.member]),
        true,
      ]);
      contactOrgIndex.push(i);
    }
  });
  const contactIds = await insertMany(
    'contacts',
    ['company_id','organization_id','first_name','last_name','email','phone','title','owner_user_id','is_demo'],
    contactRows,
  );
  await insertMany(
    'contact_roles',
    ['contact_id', 'role'],
    contactIds.map((id, i) => {
      const def = CLIENT_DEFS[contactOrgIndex[i]!]!;
      return [id, def.status === 'prospect' ? 'prospect' : def.status === 'referral_partner' ? 'referral_partner' : 'client'];
    }),
  );

  // --------------------------------------------------------------- clients
  const clientRows = CLIENT_DEFS.map((c, i) => {
    const start = rnd.date(300, 900);
    const end = new Date(start);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    const renewal = new Date(end);
    renewal.setUTCDate(renewal.getUTCDate() - 30);
    const isActive = c.status === 'active';
    return [
      companyId,
      clientOrgIds[i],
      c.name,
      c.status,
      isActive ? rnd.pick(['delivering', 'renewal', 'onboarding']) : c.status === 'prospect' ? rnd.pick(['qualifying', 'proposal', 'negotiation']) : c.status === 'paused' ? 'delivering' : 'closed',
      rnd.pick([U.am, U.admin, U.member]),
      `https://${c.domain}`,
      JSON.stringify({ linkedin: `https://linkedin.com/company/${c.domain.split('.')[0]}`, instagram: null }),
      rnd.picks(SERVICES, rnd.int(2, 4)),
      c.retainer,
      c.retainer * 12,
      isoDate(start),
      isoDate(end),
      isoDate(renewal),
      isActive ? rnd.pick(['current', 'current', 'current', 'pending', 'overdue']) : c.status === 'former' ? 'not_billed' : 'not_billed',
      c.health,
      isActive ? `Grow qualified pipeline ${rnd.int(20, 60)}% year over year while holding CAC flat.` : 'Establish baseline goals during discovery.',
      isActive ? 'Monthly paid media management, creative refresh every 6 weeks, quarterly strategy review.' : 'To be defined.',
      isActive ? `CPL under $${rnd.int(40, 140)}; ROAS above ${(rnd.next() * 2 + 2.5).toFixed(1)}x; organic sessions +${rnd.int(10, 40)}%.` : null,
      c.health < 55 ? rnd.pick(['Primary champion left the business; relationship needs rebuilding.','Results plateaued for two consecutive months.','Budget under review for next fiscal year.']) : null,
      isActive ? rnd.pick(['Send Q3 performance recap','Prepare renewal proposal','Schedule creative workshop','Review landing page test results']) : 'Send follow-up proposal',
      isoDate(rnd.date(-21, -1)),
      rnd.date(0, 14),
      i,
      true,
    ];
  });
  const clientIds = await insertMany(
    'clients',
    ['company_id','organization_id','name','status','stage','account_owner_id','website','socials','services','monthly_retainer','contract_value','contract_start','contract_end','renewal_date','billing_status','health_score','goals','deliverables','kpis','risks','next_action','next_action_date','last_activity_at','position','is_demo'],
    clientRows,
  );

  await insertMany(
    'client_contacts',
    ['client_id', 'contact_id', 'role', 'is_primary'],
    contactIds.map((cid, i) => {
      const clientIdx = contactOrgIndex[i]!;
      return [clientIds[clientIdx]!, cid, 'primary contact', i === contactOrgIndex.indexOf(clientIdx)];
    }),
  );

  return { companyId, deptIds: { deptClient, deptMedia, deptCreative, deptOps }, clientIds, clientOrgIds, vendorOrgIds, contactIds, contactOrgIndex };
}

export { CLIENT_DEFS, SERVICES, FIRST, LAST };
