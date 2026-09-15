-- =====================================================================
-- 0004_growth.sql — investors, partnerships, outreach, ParFax domain
-- =====================================================================

create table investors (
  id                 uuid primary key default gen_random_uuid(),
  -- Investors are holdings-level by default; company_id scopes an investor to
  -- a single company when that is the only entity raising from them.
  company_id         uuid references companies(id) on delete cascade,
  holding_id         uuid not null references holdings(id) on delete cascade,
  organization_id    uuid references organizations(id) on delete set null,
  name               text not null,
  website            text,
  linkedin_url       text,
  investor_type      text not null default 'vc' check (investor_type in (
                       'vc','angel','family_office','strategic','pe','accelerator',
                       'syndicate','crowdfunding','debt','other')),
  check_size_min     numeric(14,2),
  check_size_max     numeric(14,2),
  currency           text not null default 'USD',
  stage_preferences  text[] not null default '{}',
  industry_focus     text[] not null default '{}',
  geography          text,
  portfolio_companies text[] not null default '{}',
  warm_intro_source  text,
  pitching_company_id uuid references companies(id) on delete set null,
  owner_user_id      uuid references users(id) on delete set null,
  outreach_status    text not null default 'not_started' check (outreach_status in (
                       'not_started','queued','in_progress','responded','paused','closed')),
  pipeline_stage     text not null default 'researching' check (pipeline_stage in (
                       'researching','introduction_needed','ready_for_outreach','contacted',
                       'replied','meeting_scheduled','first_meeting','follow_up',
                       'due_diligence','verbal_interest','committed','passed','not_a_fit')),
  interest_level     text not null default 'unknown'
                       check (interest_level in ('unknown','low','medium','high')),
  probability        integer not null default 0 check (probability between 0 and 100),
  potential_amount   numeric(14,2) not null default 0,
  objections         text,
  requested_materials text,
  data_room_access   boolean not null default false,
  data_room_granted_at timestamptz,
  last_contact_at    timestamptz,
  next_follow_up_at  timestamptz,
  first_meeting_at   timestamptz,
  notes              text,
  is_demo            boolean not null default false,
  archived_at        timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index investors_holding_idx on investors(holding_id) where deleted_at is null;
create index investors_stage_idx on investors(pipeline_stage);
create index investors_followup_idx on investors(next_follow_up_at) where deleted_at is null;

create table investor_contacts (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  role        text not null default 'contact',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index investor_contacts_uniq on investor_contacts(investor_id, contact_id);

create table partnerships (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  organization_id    uuid references organizations(id) on delete set null,
  name               text not null,
  category           text not null default 'other' check (category in (
                       'golf_course','pro_shop','retailer','oem','investor',
                       'technology','ambassador','media','distributor','other')),
  stage              text not null default 'identified' check (stage in (
                       'identified','contacted','discovery','proposal','pilot',
                       'negotiation','signed','launched','paused','declined')),
  estimated_value    numeric(14,2) not null default 0,
  currency           text not null default 'USD',
  revenue_share      text,
  pilot_location     text,
  equipment_requirements text,
  contract_status    text not null default 'none' check (contract_status in (
                       'none','drafting','in_review','out_for_signature','signed','expired')),
  launch_date        date,
  probability        integer not null default 20 check (probability between 0 and 100),
  owner_user_id      uuid references users(id) on delete set null,
  last_interaction_at timestamptz,
  next_action        text,
  next_action_date   date,
  performance        jsonb not null default '{}'::jsonb,
  notes              text,
  position           integer not null default 0,
  is_demo            boolean not null default false,
  archived_at        timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index partnerships_company_idx on partnerships(company_id) where deleted_at is null;
create index partnerships_stage_idx on partnerships(company_id, stage);

create table partnership_contacts (
  id             uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references partnerships(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  role           text not null default 'contact',
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now()
);
create unique index partnership_contacts_uniq on partnership_contacts(partnership_id, contact_id);

-- Interaction timeline shared by investors, partnerships, clients and deals.
create table outreach_activities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  kind         text not null default 'note' check (kind in (
                 'email','call','meeting','linkedin','text','note','intro','material_sent')),
  direction    text not null default 'outbound' check (direction in ('outbound','inbound','internal')),
  subject      text,
  body         text,
  outcome      text,
  occurred_at  timestamptz not null default now(),
  user_id      uuid references users(id) on delete set null,
  contact_id   uuid references contacts(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index outreach_entity_idx on outreach_activities(entity_type, entity_id, occurred_at desc);

-- Drafts only. Nothing in this system sends outreach automatically.
create table message_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  name        text not null,
  category    text not null default 'investor' check (category in (
                'investor','partnership','client','recruiting','general')),
  channel     text not null default 'email' check (channel in ('email','linkedin','sms')),
  subject     text,
  body        text not null,
  variables   text[] not null default '{}',
  created_by_id uuid references users(id) on delete set null,
  is_demo     boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ====================================================================
-- ParFax product domain. Rows mirror the ParFax production platform via a
-- connector; `source` records where each row came from and nothing here is
-- treated as the billing system of record.
-- ====================================================================
create table parfax_users (
  id             uuid primary key default gen_random_uuid(),
  external_id    text,
  email          text not null,
  name           text,
  handle         text,
  plan           text not null default 'free' check (plan in ('free','plus','pro','team','lifetime')),
  status         text not null default 'active'
                   check (status in ('active','suspended','deleted','pending')),
  signup_at      timestamptz not null default now(),
  last_active_at timestamptz,
  country        text,
  region         text,
  acquisition_source text,
  lifetime_value numeric(14,2) not null default 0,
  promo_access   text,
  promo_expires_at timestamptz,
  merged_into_id uuid references parfax_users(id) on delete set null,
  source         text not null default 'manual'
                   check (source in ('manual','parfax_crm','csv','import','demo')),
  is_demo        boolean not null default false,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index parfax_users_external_uniq on parfax_users(source, external_id)
  where external_id is not null;
create index parfax_users_email_idx on parfax_users(lower(email));
create index parfax_users_status_idx on parfax_users(status, plan);

create table parfax_scans (
  id             uuid primary key default gen_random_uuid(),
  parfax_user_id uuid references parfax_users(id) on delete set null,
  external_id    text,
  scanned_at     timestamptz not null default now(),
  brand          text,
  model          text,
  club_type      text check (club_type in (
                   'driver','fairway','hybrid','iron','wedge','putter','other')),
  confidence     numeric(5,2),
  verified       boolean,
  verified_correct boolean,
  location_id    uuid,
  source         text not null default 'manual'
                   check (source in ('manual','parfax_crm','csv','import','demo')),
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index parfax_scans_time_idx on parfax_scans(scanned_at);
create index parfax_scans_brand_idx on parfax_scans(brand, model);

create table parfax_locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text not null default 'course' check (kind in (
                 'course','pro_shop','retailer','event','distribution')),
  organization_id uuid references organizations(id) on delete set null,
  partnership_id  uuid references partnerships(id) on delete set null,
  city         text,
  region       text,
  country      text,
  status       text not null default 'prospect'
                 check (status in ('prospect','pilot','live','paused','churned')),
  scanners     integer not null default 0,
  launched_on  date,
  source       text not null default 'manual',
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table parfax_marketplace_events (
  id             uuid primary key default gen_random_uuid(),
  parfax_user_id uuid references parfax_users(id) on delete set null,
  kind           text not null check (kind in ('listing','offer','sale','cancel')),
  item           text,
  amount         numeric(14,2) not null default 0,
  currency       text not null default 'USD',
  occurred_at    timestamptz not null default now(),
  source         text not null default 'manual',
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index parfax_marketplace_time_idx on parfax_marketplace_events(occurred_at);

create table parfax_support_issues (
  id             uuid primary key default gen_random_uuid(),
  parfax_user_id uuid references parfax_users(id) on delete set null,
  subject        text not null,
  description    text,
  status         text not null default 'open'
                   check (status in ('open','in_progress','waiting','resolved','closed')),
  priority       text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  category       text,
  opened_at      timestamptz not null default now(),
  resolved_at    timestamptz,
  assigned_user_id uuid references users(id) on delete set null,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Every metric point declares its provenance so no chart can imply that a
-- forecast or a manual backfill is production data.
create table parfax_metrics (
  id           uuid primary key default gen_random_uuid(),
  metric_key   text not null,
  period_start date not null,
  period_end   date not null,
  value        numeric(18,4) not null,
  unit         text,
  kind         text not null check (kind in (
                 'raw','calculated','manual','forecast','target','demo')),
  source_label text not null,
  note         text,
  created_by_id uuid references users(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index parfax_metrics_uniq on parfax_metrics(metric_key, period_start, period_end, kind);

create table parfax_annotations (
  id           uuid primary key default gen_random_uuid(),
  metric_key   text,
  occurred_on  date not null,
  title        text not null,
  body         text,
  created_by_id uuid references users(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
