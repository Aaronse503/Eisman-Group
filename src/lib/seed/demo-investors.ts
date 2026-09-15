import { insertMany, type Random } from './util';
import type { SeedContext } from './core';
import { FIRST, LAST } from './demo-agency';

const FUNDS: [string, string, number, number, string[], string][] = [
  ['Fairway Ventures', 'vc', 250000, 1500000, ['seed', 'series_a'], 'Sports technology and consumer marketplaces'],
  ['Green Jacket Capital', 'vc', 500000, 3000000, ['series_a'], 'Consumer subscription and golf'],
  ['Tee Box Angels', 'syndicate', 25000, 250000, ['pre_seed', 'seed'], 'Golf industry operators'],
  ['Northbound Family Office', 'family_office', 500000, 2000000, ['seed', 'series_a'], 'Diversified, sports exposure'],
  ['Divot Capital Partners', 'vc', 1000000, 5000000, ['series_a', 'series_b'], 'Vertical SaaS and marketplaces'],
  ['Acushnet Strategic Ventures', 'strategic', 1000000, 4000000, ['series_a'], 'Golf equipment and technology'],
  ['Caddie Fund', 'vc', 150000, 900000, ['pre_seed', 'seed'], 'Consumer mobile'],
  ['Grand Slam Growth', 'pe', 3000000, 12000000, ['growth'], 'Sports and leisure'],
  ['Birdie Labs Accelerator', 'accelerator', 100000, 250000, ['pre_seed'], 'Sports tech accelerator'],
  ['Mulligan Ventures', 'vc', 300000, 1200000, ['seed'], 'Computer vision and consumer'],
  ['Harbor Light Angels', 'angel', 25000, 150000, ['pre_seed', 'seed'], 'Regional angel group'],
  ['Clubhouse Collective', 'syndicate', 50000, 400000, ['seed'], 'Golf-native operators and pros'],
  ['Summit Ridge Capital', 'vc', 750000, 3500000, ['series_a'], 'Marketplaces and commerce infrastructure'],
  ['Pinnacle Sports Partners', 'strategic', 500000, 2500000, ['seed', 'series_a'], 'Sports media and equipment'],
  ['Redline Debt Partners', 'debt', 500000, 5000000, ['growth'], 'Revenue-based financing'],
  ['Wedge & Co.', 'family_office', 250000, 1000000, ['seed'], 'Consumer brands'],
  ['Open Championship Ventures', 'vc', 400000, 2000000, ['seed', 'series_a'], 'European sports technology'],
  ['Long Drive Capital', 'vc', 200000, 1000000, ['pre_seed', 'seed'], 'Hardware-enabled consumer'],
  ['Bunker Hill Investments', 'angel', 50000, 300000, ['seed'], 'Northeast angels'],
  ['Scorecard Equity', 'pe', 2000000, 8000000, ['growth'], 'Consumer subscription roll-ups'],
  ['Approach Shot Ventures', 'vc', 350000, 1600000, ['seed'], 'Vertical AI'],
  ['Handicap Holdings', 'family_office', 300000, 1400000, ['seed', 'series_a'], 'Sports and leisure'],
  ['Tempo Capital', 'vc', 600000, 2600000, ['series_a'], 'Computer vision and robotics'],
  ['Front Nine Fund', 'syndicate', 40000, 300000, ['pre_seed'], 'Golf community syndicate'],
  ['Augusta Growth Partners', 'pe', 4000000, 15000000, ['growth'], 'Sports infrastructure'],
  ['Shotlink Ventures', 'strategic', 250000, 1200000, ['seed'], 'Golf data and analytics'],
  ['Cypress Point Capital', 'vc', 500000, 2200000, ['series_a'], 'Consumer marketplaces'],
  ['Range Finder Fund', 'vc', 150000, 700000, ['pre_seed', 'seed'], 'Early consumer hardware'],
];

const STAGES = [
  'researching','introduction_needed','ready_for_outreach','contacted','replied',
  'meeting_scheduled','first_meeting','follow_up','due_diligence','verbal_interest',
  'committed','passed','not_a_fit',
] as const;

export async function seedInvestorsDemo(ctx: SeedContext, rnd: Random) {
  const parfaxId = ctx.companies['parfax']!;
  const U = ctx.users;

  // Investors live at the holding level; `pitching_company_id` records which
  // entity is actually raising from them.
  const orgIds = await insertMany(
    'organizations',
    ['company_id','name','industry','website','description','owner_user_id','is_demo'],
    FUNDS.map(([name, type, , , , focus]) => [
      parfaxId, name, 'Investment', `https://${name.toLowerCase().replace(/[^a-z]+/g, '')}.test`,
      `${type.replace('_', ' ')} — ${focus}`, U.owner, true,
    ]),
  );
  await insertMany('organization_roles', ['organization_id', 'role'], orgIds.map((id) => [id, 'investor']));

  const contactRows = FUNDS.flatMap(([name], i) =>
    Array.from({ length: rnd.int(1, 2) }, () => {
      const first = rnd.pick(FIRST);
      const last = rnd.pick(LAST);
      return [
        parfaxId, orgIds[i], first, last,
        `${first.toLowerCase()}.${last.toLowerCase()}@${name.toLowerCase().replace(/[^a-z]+/g, '')}.test`,
        rnd.pick(['Partner', 'Principal', 'Managing Director', 'Investment Lead', 'General Partner']),
        U.owner, true,
      ];
    }),
  );
  const contactIds = await insertMany(
    'contacts',
    ['company_id','organization_id','first_name','last_name','email','title','owner_user_id','is_demo'],
    contactRows,
  );
  await insertMany('contact_roles', ['contact_id', 'role'], contactIds.map((id) => [id, 'investor']));

  const investorRows = FUNDS.map(([name, type, min, max, stages, focus], i) => {
    const stage = STAGES[Math.min(i % STAGES.length, STAGES.length - 1)]!;
    const advanced = ['due_diligence', 'verbal_interest', 'committed'].includes(stage);
    const engaged = ['contacted','replied','meeting_scheduled','first_meeting','follow_up'].includes(stage) || advanced;
    return [
      null, ctx.holdingId, orgIds[i], name,
      `https://${name.toLowerCase().replace(/[^a-z]+/g, '')}.test`,
      type, min, max, 'USD', stages, focus.split(' and ').map((s) => s.trim()),
      rnd.pick(['United States', 'North America', 'US East Coast', 'Global', 'Europe']),
      rnd.picks(['Shotlink','Arccos','SwingU','18Birdies','GolfNow','TrackMan','Whoop','Strava'], rnd.int(1, 3)),
      rnd.bool(0.45) ? rnd.pick(['Warm intro via GolfWRX','Portfolio founder referral','Met at PGA Show','LinkedIn connection','Advisor introduction']) : null,
      parfaxId, U.owner,
      stage === 'researching' || stage === 'introduction_needed' ? 'not_started'
        : stage === 'ready_for_outreach' ? 'queued'
        : ['passed', 'not_a_fit'].includes(stage) ? 'closed' : 'in_progress',
      stage,
      advanced ? 'high' : engaged ? rnd.pick(['medium', 'high']) : 'unknown',
      stage === 'committed' ? 100 : stage === 'verbal_interest' ? 70 : stage === 'due_diligence' ? 45
        : ['passed', 'not_a_fit'].includes(stage) ? 0 : engaged ? rnd.int(10, 35) : rnd.int(0, 10),
      advanced ? rnd.money(250000, 2000000, 50000) : engaged ? rnd.money(100000, 800000, 25000) : rnd.money(0, 300000, 25000),
      stage === 'passed' ? rnd.pick([
        'Golf is too narrow a wedge for our fund thesis.',
        'Wants to see 12 months of retention data first.',
        'Passing on hardware-dependent distribution.',
      ]) : engaged && rnd.bool(0.4) ? 'Wants clarity on scan accuracy verification methodology.' : null,
      advanced ? 'Data room, cohort retention, unit economics model' : engaged ? 'Deck and one-pager' : null,
      advanced, advanced ? rnd.date(5, 60) : null,
      engaged ? rnd.date(1, 60) : null,
      ['passed', 'not_a_fit'].includes(stage) ? null : rnd.date(-21, 5),
      ['first_meeting','follow_up','due_diligence','verbal_interest','committed'].includes(stage) ? rnd.date(5, 70) : null,
      `${name} — ${focus}.`, true,
    ];
  });

  const investorIds = await insertMany(
    'investors',
    ['company_id','holding_id','organization_id','name','website','investor_type','check_size_min','check_size_max','currency','stage_preferences','industry_focus','geography','portfolio_companies','warm_intro_source','pitching_company_id','owner_user_id','outreach_status','pipeline_stage','interest_level','probability','potential_amount','objections','requested_materials','data_room_access','data_room_granted_at','last_contact_at','next_follow_up_at','first_meeting_at','notes','is_demo'],
    investorRows,
  );

  let ci = 0;
  await insertMany(
    'investor_contacts',
    ['investor_id','contact_id','role','is_primary'],
    FUNDS.flatMap((_, i) => {
      const count = contactRows.filter((_r, idx) => Math.floor(idx) >= 0).length && 1;
      void count;
      const rows: unknown[][] = [];
      // contactRows were generated per fund in order; walk them in the same order.
      while (ci < contactIds.length && contactRows[ci]![1] === orgIds[i]) {
        rows.push([investorIds[i]!, contactIds[ci]!, 'investment contact', rows.length === 0]);
        ci++;
      }
      return rows;
    }),
  );

  // --------------------------------------------------- interaction history
  const activityRows: unknown[][] = [];
  investorIds.forEach((investorId, i) => {
    const stage = STAGES[Math.min(i % STAGES.length, STAGES.length - 1)]!;
    if (stage === 'researching' || stage === 'introduction_needed') return;
    const count = ['due_diligence', 'verbal_interest', 'committed'].includes(stage) ? rnd.int(4, 7) : rnd.int(1, 3);
    for (let n = 0; n < count; n++) {
      const kind = rnd.pick(['email', 'email', 'call', 'meeting', 'linkedin', 'material_sent'] as const);
      activityRows.push([
        null, 'investor', investorId, kind,
        kind === 'material_sent' ? 'outbound' : rnd.pick(['outbound', 'inbound']),
        {
          email: 'Follow-up on ParFax',
          call: 'Intro call',
          meeting: 'Partner meeting',
          linkedin: 'LinkedIn message',
          material_sent: 'Sent deck and metrics one-pager',
        }[kind],
        'Summary of the exchange captured by the relationship owner.',
        rnd.pick(['Positive', 'Neutral', 'Asked for more data', 'Scheduling next step', null]),
        rnd.date(1, 120), ctx.users.owner, true,
      ]);
    }
  });
  await insertMany(
    'outreach_activities',
    ['company_id','entity_type','entity_id','kind','direction','subject','body','outcome','occurred_at','user_id','is_demo'],
    activityRows,
  );

  // ------------------------------------------------------------ templates
  await insertMany(
    'message_templates',
    ['company_id','name','category','channel','subject','body','variables','created_by_id','is_demo'],
    [
      [null, 'Investor — cold intro', 'investor', 'email', 'ParFax — {{one_line}}',
`Hi {{first_name}},

I'm Aaron, founder of ParFax. We turn a phone camera into a golf club identification and authentication engine — {{traction_line}}.

Given {{fund_name}}'s work with {{portfolio_example}}, I thought this might be relevant. Would you be open to a 20-minute call in the next couple of weeks?

Happy to send the deck ahead of time either way.

Aaron`,
       ['first_name','fund_name','one_line','traction_line','portfolio_example'], ctx.users.owner, true],
      [null, 'Investor — warm intro request', 'investor', 'email', 'Intro to {{fund_name}}?',
`Hi {{intro_source}},

Hope you're well. I noticed you're connected to {{first_name}} at {{fund_name}}. We're raising for ParFax and they look like a strong fit given {{reason}}.

Would you be comfortable making an intro? I've written a forwardable blurb below.

—
{{forwardable_blurb}}`,
       ['intro_source','first_name','fund_name','reason','forwardable_blurb'], ctx.users.owner, true],
      [null, 'Investor — post-meeting follow-up', 'investor', 'email', 'Following up — ParFax',
`Hi {{first_name}},

Thanks for the time today. As promised:

• {{material_1}}
• {{material_2}}

You asked about {{open_question}} — short answer: {{answer}}. Happy to go deeper.

What's the right next step on your side?

Aaron`,
       ['first_name','material_1','material_2','open_question','answer'], ctx.users.owner, true],
      [null, 'Partnership — course outreach', 'partnership', 'email', 'ParFax at {{course_name}}',
`Hi {{first_name}},

We install a counter-mounted scanner in the pro shop at no cost. Members scan a club, get an instant valuation and can list it to the ParFax marketplace. You earn {{rev_share}} of anything sold through your location.

{{proof_point}}

Worth a 15-minute call?`,
       ['first_name','course_name','rev_share','proof_point'], ctx.users.parfax, true],
    ],
  );

  return { investorIds, orgIds, contactIds };
}
