import { insertMany, isoDate, type Random } from './util';
import type { SeedContext } from './core';

interface Refs {
  companyId: string;
  clientIds: string[];
  clientOrgIds: string[];
  vendorOrgIds: string[];
  contactIds: string[];
  contactOrgIndex: number[];
}

const MEETING_TEMPLATES = [
  ['client_call', 'Monthly performance review'],
  ['client_call', 'Creative review'],
  ['sales_call', 'Discovery call'],
  ['team_meeting', 'Delivery stand-up'],
  ['exec_review', 'Weekly executive review'],
  ['product_meeting', 'Roadmap working session'],
] as const;

export async function seedMeetingsAndNotes(
  ctx: SeedContext,
  refs: Refs,
  extras: { projectIds: string[] },
  rnd: Random,
) {
  const { companyId, clientIds, contactIds } = refs;
  const U = ctx.users;
  const owners = [U.admin, U.am, U.member, U.owner];

  const calendarIds = await insertMany(
    'calendars',
    ['company_id', 'name', 'provider', 'color', 'is_demo'],
    [[companyId, 'Eisman Digital — Team', 'internal', '#0F5132', true]],
  );

  const meetingRows: unknown[][] = [];
  for (let i = 0; i < 22; i++) {
    const [template, title] = rnd.pick(MEETING_TEMPLATES);
    const past = i < 14;
    const start = past ? rnd.date(1, 45) : rnd.date(-21, -1);
    const end = new Date(start.getTime() + rnd.pick([30, 45, 60]) * 60000);
    const clientId = template === 'client_call' || template === 'sales_call' ? rnd.pick(clientIds) : null;
    meetingRows.push([
      companyId, calendarIds[0], clientId,
      rnd.bool(0.4) ? rnd.pick(extras.projectIds) : null,
      `${title}${clientId ? '' : ' — Eisman Digital'}`, template,
      rnd.pick(['Google Meet', 'Zoom', 'Client office', 'Studio']),
      start, end, 'America/New_York',
      past
        ? `Agenda\n1. Performance vs. plan\n2. Creative pipeline\n3. Blockers and decisions`
        : `Agenda\n1. Open items\n2. Next 30 days\n3. Questions`,
      past
        ? `Discussed the last 30 days of performance. Spend tracked ${rnd.int(2, 12)}% under plan. Creative fatigue showing on the top two ad sets. Agreed to refresh assets before the next flight.`
        : null,
      past ? rnd.pick([
        'Approved the creative refresh budget.',
        'Agreed to postpone the landing page test until after the migration.',
        'Confirmed the renewal will be discussed at the next review.',
      ]) : null,
      past ? isoDate(rnd.date(-14, -3)) : null,
      past ? 'held' : 'scheduled',
      rnd.pick(owners), true,
    ]);
  }
  const meetingIds = await insertMany(
    'meetings',
    ['company_id','calendar_id','client_id','project_id','title','template','location','starts_at','ends_at','timezone','agenda','notes','decisions','follow_up_date','status','owner_user_id','is_demo'],
    meetingRows,
  );

  await insertMany(
    'meeting_participants',
    ['meeting_id','user_id','contact_id','name','response','is_organizer'],
    meetingIds.flatMap((meetingId) => {
      const contactId = rnd.bool(0.7) ? rnd.pick(contactIds) : null;
      const rows: unknown[][] = [[meetingId, rnd.pick(owners), null, null, 'accepted', true]];
      if (contactId) rows.push([meetingId, null, contactId, null, rnd.pick(['accepted', 'needs_action', 'tentative']), false]);
      return rows;
    }),
  );

  const ACTIONS = [
    'Send the updated media plan',
    'Share the creative brief with the studio',
    'Pull the attribution comparison',
    'Confirm the renewal date with finance',
    'Draft the case study outline',
    'Schedule the technical SEO handoff',
  ];
  await insertMany(
    'action_items',
    ['meeting_id','company_id','text','owner_user_id','due_date','done','position'],
    meetingIds.slice(0, 14).flatMap((meetingId, i) =>
      Array.from({ length: rnd.int(1, 3) }, (_, n) => [
        meetingId, companyId, rnd.pick(ACTIONS), rnd.pick(owners),
        isoDate(rnd.date(-14, 7)), rnd.bool(0.45), n,
      ]).map((row) => (void i, row)),
    ),
  );

  // --------------------------------------------------------------- notes
  const noteRows: unknown[][] = [];
  clientIds.slice(0, 8).forEach((clientId, i) => {
    noteRows.push([
      companyId,
      `Account context — ${['Northwind','Harbor & Vine','Cedar Ridge','Verity','Lumen','Saltwater','Foundry Row','Anchor Point'][i]}`,
      `Relationship owner notes.\n\nDecision makers: marketing lead signs off on creative, founder signs off on budget.\nBudget cycle: reviewed quarterly, locked in the first week of the quarter.\nSensitivities: prefers async updates; dislikes long decks.\nCurrent focus: ${rnd.pick(['lowering blended CAC', 'expanding into a second region', 'launching a new product line', 'improving retention'])}.`,
      'client', clientId, rnd.pick(owners), i < 2, true,
    ]);
  });
  noteRows.push([
    companyId, 'Eisman Digital — pricing and packaging (2026)',
    `Retainers start at $4,500/mo for a single-channel engagement.\nStandard growth package is $9,500/mo covering paid media, creative refresh and reporting.\nEnterprise engagements are $15,000/mo and up with a dedicated strategist.\nProject work is quoted at $145/hr blended.\nAnnual prepay earns a 7% discount.`,
    null, null, ctx.users.owner, true, true,
  ]);
  noteRows.push([
    companyId, 'Delivery playbook — new client onboarding',
    `Week 1: kickoff call, access audit, analytics verification.\nWeek 2: baseline reporting, competitive teardown, channel plan.\nWeek 3: creative brief approved, tracking deployed.\nWeek 4: first campaigns live, weekly reporting cadence begins.\nOwner: Director of Operations. Escalation: account lead, then founder.`,
    null, null, ctx.users.admin, false, true,
  ]);
  const noteIds = await insertMany(
    'notes',
    ['company_id','title','body','entity_type','entity_id','author_user_id','pinned','is_demo'],
    noteRows,
  );

  return { meetingIds, noteIds, calendarIds };
}

export async function seedDocumentsDemo(ctx: SeedContext, refs: Refs, rnd: Random) {
  const { companyId, clientIds } = refs;
  const U = ctx.users;

  const folderIds = await insertMany(
    'folders',
    ['company_id', 'name', 'description', 'is_demo'],
    [
      [companyId, 'Contracts', 'Signed agreements, SOWs and amendments', true],
      [companyId, 'Client Reporting', 'Monthly and quarterly performance reporting', true],
      [companyId, 'Proposals', 'Outbound proposals and pitch material', true],
      [companyId, 'Internal', 'Playbooks, templates and operating documents', true],
    ],
  );

  const DOCS: {
    name: string;
    folder: number;
    summary: string;
    text: string;
    points: string[];
    actions: string[];
    people: string[];
    orgs: string[];
    dates: string[];
    clientIdx?: number;
    access?: string;
  }[] = [
    {
      name: 'Northwind Outfitters — Master Services Agreement.pdf',
      folder: 0,
      clientIdx: 0,
      summary:
        'Twelve-month master services agreement with Northwind Outfitters covering paid media, SEO and creative, at $12,500 per month with a 60-day termination clause.',
      text: `MASTER SERVICES AGREEMENT\n\nThis Agreement is entered into between Eisman Digital LLC ("Agency") and Northwind Outfitters ("Client").\n\n1. SERVICES. Agency will provide paid media management, search engine optimization and creative production as described in the attached Statement of Work.\n\n2. TERM. The initial term is twelve (12) months commencing on the Effective Date, renewing automatically for successive twelve-month terms unless either party gives written notice at least sixty (60) days prior to the end of the then-current term.\n\n3. FEES. Client will pay Agency a monthly retainer of twelve thousand five hundred dollars ($12,500), invoiced on the first business day of each month and due net thirty (30).\n\n4. MEDIA SPEND. Media spend is billed at cost and is not included in the retainer. Agency will not commit media spend above the approved monthly budget without written approval.\n\n5. TERMINATION. Either party may terminate for convenience on sixty (60) days written notice. Fees for work performed through the termination date remain payable.\n\n6. INTELLECTUAL PROPERTY. Upon payment in full, Client owns all final deliverables. Agency retains ownership of its pre-existing tools, templates and methodologies.\n\n7. CONFIDENTIALITY. Each party will protect the other's confidential information with no less than reasonable care for three (3) years following disclosure.`,
      points: [
        'Monthly retainer is $12,500, invoiced on the first business day, net 30.',
        'Initial term is 12 months with automatic annual renewal.',
        'Either party may terminate for convenience with 60 days written notice.',
        'Media spend is billed at cost and excluded from the retainer.',
      ],
      actions: ['Diary the 60-day renewal notice window', 'Confirm approved monthly media budget in writing'],
      people: ['Eisman Digital LLC', 'Northwind Outfitters'],
      orgs: ['Eisman Digital LLC', 'Northwind Outfitters'],
      dates: ['Effective Date', 'Twelve (12) months from Effective Date'],
      access: 'restricted',
    },
    {
      name: 'Verity Financial — Q3 Performance Review.pdf',
      folder: 1,
      clientIdx: 3,
      summary:
        'Q3 performance review for Verity Financial Partners: spend was 8% under plan, cost per lead rose 14%, and the account is flagged at risk pending a creative refresh.',
      text: `VERITY FINANCIAL PARTNERS — Q3 PERFORMANCE REVIEW\n\nHEADLINES\nTotal media spend for the quarter was $184,200 against a plan of $200,000, finishing 8% under plan due to a two-week pause in August.\nQualified leads totalled 1,412, down 6% quarter over quarter.\nBlended cost per qualified lead was $130, up 14% from $114 in Q2.\nPipeline value attributed to paid channels was $2.1M.\n\nWHAT DROVE THE CHANGE\nCreative fatigue on the two highest-spending ad sets is the primary driver. Frequency exceeded 4.2 in both, with click-through rate declining each month of the quarter.\nCompetitive pressure increased in the compliance keyword cluster, raising average cost per click by 19%.\n\nRISKS\nThe primary marketing champion left the business in September. The relationship needs to be rebuilt with the incoming VP of Marketing.\nBudget for Q4 is under review and has not been confirmed.\n\nRECOMMENDATIONS\nRefresh the full creative set before the next flight, targeting launch within three weeks.\nShift 15% of budget from the compliance cluster to the retirement planning cluster, which holds a $78 cost per lead.\nSchedule a strategy session with the incoming VP of Marketing within 30 days.`,
      points: [
        'Media spend finished 8% under plan at $184,200.',
        'Cost per qualified lead rose 14% quarter over quarter to $130.',
        'Creative fatigue on the two top ad sets is the main driver of decline.',
        'The primary champion left the business; the relationship needs rebuilding.',
      ],
      actions: [
        'Refresh the full creative set within three weeks',
        'Shift 15% of budget to the retirement planning cluster',
        'Schedule a strategy session with the incoming VP of Marketing',
      ],
      people: ['VP of Marketing'],
      orgs: ['Verity Financial Partners'],
      dates: ['Q3', 'Q4 budget review'],
    },
    {
      name: 'Kestrel Robotics — Proposal.pdf',
      folder: 2,
      clientIdx: 8,
      summary:
        'Proposal to Kestrel Robotics for a $14,000 per month growth engagement with a 90-day pilot, focused on demand generation for industrial buyers.',
      text: `PROPOSAL — KESTREL ROBOTICS\n\nOBJECTIVE\nBuild a repeatable demand generation engine for Kestrel Robotics targeting operations and plant engineering buyers in North America.\n\nSCOPE\nPhase 1 (Days 1-30): analytics and tracking foundation, ICP definition, messaging tests.\nPhase 2 (Days 31-60): paid search and LinkedIn programs live, landing page system deployed.\nPhase 3 (Days 61-90): lifecycle nurture, attribution reporting, scale plan.\n\nINVESTMENT\nEngagement fee: $14,000 per month.\nRecommended media budget: $35,000 per month, billed at cost.\nPilot term: 90 days, converting to a 12-month agreement on mutual agreement.\n\nSUCCESS CRITERIA\n45 sales-qualified leads within the pilot window.\nCost per sales-qualified opportunity below $2,400.\nA documented, transferable playbook at the end of the pilot.`,
      points: [
        'Engagement fee is $14,000 per month plus $35,000 per month recommended media.',
        'Structured as a 90-day pilot converting to a 12-month agreement.',
        'Success criteria: 45 SQLs and cost per opportunity under $2,400.',
      ],
      actions: ['Follow up on proposal decision', 'Prepare the pilot statement of work'],
      people: [],
      orgs: ['Kestrel Robotics', 'Eisman Digital'],
      dates: ['90-day pilot', 'Days 1-30', 'Days 31-60', 'Days 61-90'],
    },
    {
      name: 'Eisman Digital — 2026 Operating Plan.pdf',
      folder: 3,
      summary:
        'Internal 2026 operating plan: target $2.4M revenue, hold gross margin at 58%, hire a Performance Media Lead, and reduce revenue concentration below 25% per client.',
      text: `EISMAN DIGITAL — 2026 OPERATING PLAN\n\nFINANCIAL TARGETS\nRevenue target: $2,400,000.\nGross margin target: 58%.\nContractor cost as a share of revenue: below 26%.\n\nGROWTH\nAdd six new retainer clients at an average of $9,500 per month.\nLift average retainer from $9,100 to $10,250 through service expansion.\nMaintain net revenue retention above 105%.\n\nRISK\nRevenue concentration: the top client represents 21% of revenue. Target is no client above 25%, and the top three below 50%.\nKey person risk in performance media. Mitigation is the Performance Media Lead hire.\n\nPEOPLE\nHire a Performance Media Lead in the first half of the year at $125,000.\nConvert two contractors to part-time employees if utilisation holds above 70%.`,
      points: [
        'Revenue target is $2.4M at a 58% gross margin.',
        'Plan adds six retainer clients averaging $9,500 per month.',
        'No single client should exceed 25% of revenue.',
        'Performance Media Lead hire is budgeted at $125,000.',
      ],
      actions: ['Open the Performance Media Lead requisition', 'Review contractor utilisation quarterly'],
      people: [],
      orgs: ['Eisman Digital'],
      dates: ['2026', 'First half of the year'],
      access: 'restricted',
    },
    {
      name: 'Lumen Home Systems — Account Risk Review.pdf',
      folder: 1,
      clientIdx: 4,
      summary:
        'Risk review for Lumen Home Systems: health score has fallen to 45, results plateaued for two months, and a save plan is proposed ahead of the renewal date.',
      text: `LUMEN HOME SYSTEMS — ACCOUNT RISK REVIEW\n\nSTATUS\nHealth score: 45 (at risk). Down from 71 ninety days ago.\n\nWHAT IS HAPPENING\nLead volume has been flat for two consecutive months while spend held steady.\nThe client's internal sales follow-up time increased from 4 hours to 31 hours, which is suppressing conversion downstream of our work.\nTwo of three stakeholders have not attended the last four reviews.\n\nSAVE PLAN\n1. Executive-to-executive call within ten days to reset expectations.\n2. Joint working session on lead response time with the client's sales leadership.\n3. Reduce media spend by 20% for one cycle and redirect to a higher-intent segment.\n4. Present a revised scope at a lower monthly fee if results do not improve within 60 days.\n\nRENEWAL EXPOSURE\nAnnual contract value at risk: $114,000. Renewal decision expected within the quarter.`,
      points: [
        'Health score has fallen from 71 to 45 over ninety days.',
        'Client lead response time rose from 4 hours to 31 hours.',
        'Annual contract value at risk is $114,000.',
        'Save plan starts with an executive-to-executive call within ten days.',
      ],
      actions: [
        'Book the executive-to-executive call within ten days',
        'Run a joint working session on lead response time',
        'Prepare a revised lower-fee scope option',
      ],
      people: [],
      orgs: ['Lumen Home Systems'],
      dates: ['Within ten days', 'Within 60 days', 'This quarter'],
    },
  ];

  const docRows = DOCS.map((doc) => [
    companyId, folderIds[doc.folder], doc.name,
    `Demo document generated for testing. ${doc.summary}`,
    'file', 'application/pdf', doc.text.length * 12,
    'local', null, null, U.admin, 1, true, doc.access ?? 'company',
    'extracted', doc.text, Math.max(1, Math.round(doc.text.length / 1800)),
    'ready', 'local', 'extractive-v1', new Date(),
    doc.summary, JSON.stringify(doc.points), JSON.stringify(doc.actions),
    JSON.stringify(doc.people), JSON.stringify(doc.orgs), JSON.stringify(doc.dates), true,
  ]);
  const docIds = await insertMany(
    'documents',
    ['company_id','folder_id','name','description','kind','mime_type','byte_size','storage_driver','storage_key','checksum','uploaded_by_id','version','is_current','access_level','text_status','extracted_text','page_count','ai_status','ai_provider','ai_model','ai_generated_at','summary','key_points','extracted_action_items','extracted_people','extracted_orgs','extracted_dates','is_demo'],
    docRows,
  );

  await insertMany(
    'document_links',
    ['document_id', 'entity_type', 'entity_id'],
    DOCS.flatMap((doc, i) =>
      doc.clientIdx !== undefined ? [[docIds[i]!, 'client', clientIds[doc.clientIdx]!]] : [],
    ),
  );

  void rnd;
  return { docIds, folderIds };
}
