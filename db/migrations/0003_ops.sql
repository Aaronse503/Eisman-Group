-- =====================================================================
-- 0003_ops.sql — meetings, notes, documents, finance, team, org chart
-- =====================================================================

create table calendars (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  connection_id  uuid,
  name           text not null,
  external_id    text,
  provider       text not null default 'internal',
  timezone       text not null default 'America/New_York',
  color          text not null default '#0F5132',
  enabled        boolean not null default true,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table meetings (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  calendar_id     uuid references calendars(id) on delete set null,
  client_id       uuid references clients(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  investor_id     uuid,
  partnership_id  uuid,
  title           text not null,
  template        text not null default 'general' check (template in (
                    'general','client_call','sales_call','investor_call',
                    'partnership_call','team_meeting','exec_review','product_meeting')),
  location        text,
  meeting_url     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  timezone        text not null default 'America/New_York',
  all_day         boolean not null default false,
  agenda          text,
  notes           text,
  decisions       text,
  follow_up_date  date,
  status          text not null default 'scheduled' check (status in (
                    'scheduled','held','cancelled','no_show')),
  owner_user_id   uuid references users(id) on delete set null,
  source          text not null default 'internal',
  external_id     text,
  external_url    text,
  external_synced_at timestamptz,
  is_demo         boolean not null default false,
  archived_at     timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index meetings_company_idx on meetings(company_id, starts_at) where deleted_at is null;
create unique index meetings_external_uniq on meetings(source, external_id)
  where external_id is not null;

create table meeting_participants (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  email      text,
  name       text,
  response   text not null default 'needs_action'
               check (response in ('needs_action','accepted','declined','tentative')),
  is_organizer boolean not null default false,
  created_at timestamptz not null default now()
);
create index meeting_participants_meeting_idx on meeting_participants(meeting_id);

create table action_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid references meetings(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  text        text not null,
  owner_user_id uuid references users(id) on delete set null,
  due_date    date,
  task_id     uuid references tasks(id) on delete set null,
  done        boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index action_items_meeting_idx on action_items(meeting_id);

-- ------------------------------------------------------------------- notes
create table notes (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  title        text not null,
  body         text not null default '',
  entity_type  text,
  entity_id    uuid,
  author_user_id uuid references users(id) on delete set null,
  pinned       boolean not null default false,
  visibility   text not null default 'company'
                 check (visibility in ('company','private','restricted')),
  is_demo      boolean not null default false,
  archived_at  timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notes_company_idx on notes(company_id) where deleted_at is null;
create index notes_entity_idx on notes(entity_type, entity_id);

-- --------------------------------------------------------------- documents
create table folders (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  parent_id   uuid references folders(id) on delete cascade,
  name        text not null,
  description text,
  is_demo     boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index folders_company_idx on folders(company_id);

create table documents (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  folder_id       uuid references folders(id) on delete set null,
  name            text not null,
  description     text,
  kind            text not null default 'file' check (kind in ('file','link')),
  link_url        text,
  mime_type       text,
  byte_size       bigint not null default 0,
  storage_driver  text not null default 'local',
  storage_key     text,
  checksum        text,
  uploaded_by_id  uuid references users(id) on delete set null,
  version_group   uuid not null default gen_random_uuid(),
  version         integer not null default 1,
  is_current      boolean not null default true,
  access_level    text not null default 'company' check (access_level in (
                    'company','finance','investor','hr','restricted')),
  -- extraction / AI enrichment ------------------------------------------
  text_status     text not null default 'pending' check (text_status in (
                    'pending','extracted','unsupported','failed','skipped')),
  extracted_text  text,
  text_error      text,
  page_count      integer,
  ai_status       text not null default 'pending' check (ai_status in (
                    'pending','ready','failed','skipped')),
  ai_provider     text,
  ai_model        text,
  ai_generated_at timestamptz,
  summary         text,
  key_points      jsonb not null default '[]'::jsonb,
  extracted_action_items jsonb not null default '[]'::jsonb,
  extracted_people       jsonb not null default '[]'::jsonb,
  extracted_orgs         jsonb not null default '[]'::jsonb,
  extracted_dates        jsonb not null default '[]'::jsonb,
  is_demo         boolean not null default false,
  archived_at     timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index documents_company_idx on documents(company_id) where deleted_at is null;
create index documents_version_idx on documents(version_group, version);

create table document_links (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);
create unique index document_links_uniq on document_links(document_id, entity_type, entity_id);
create index document_links_entity_idx on document_links(entity_type, entity_id);

-- Retrieval corpus. Every chunk is company-scoped so retrieval can never
-- cross a tenant boundary, and carries a citation back to its source record.
create table knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  source_type  text not null,
  source_id    uuid not null,
  source_title text not null,
  source_url   text,
  chunk_index  integer not null default 0,
  content      text not null,
  metadata     jsonb not null default '{}'::jsonb,
  is_demo      boolean not null default false,
  updated_at   timestamptz not null default now(),
  tsv          tsvector generated always as (to_tsvector('english', content)) stored
);
create index knowledge_chunks_tsv_idx on knowledge_chunks using gin(tsv);
create index knowledge_chunks_company_idx on knowledge_chunks(company_id);
create unique index knowledge_chunks_source_uniq
  on knowledge_chunks(source_type, source_id, chunk_index);

-- ----------------------------------------------------------------- finance
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  client_id       uuid references clients(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  number          text not null,
  status          text not null default 'draft' check (status in (
                    'draft','open','paid','past_due','void','uncollectible')),
  issue_date      date not null default current_date,
  due_date        date,
  currency        text not null default 'USD',
  subtotal        numeric(14,2) not null default 0,
  tax             numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  amount_due      numeric(14,2) not null default 0,
  description     text,
  source          text not null default 'manual'
                    check (source in ('manual','stripe','csv','import')),
  external_id     text,
  hosted_url      text,
  is_demo         boolean not null default false,
  archived_at     timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index invoices_company_idx on invoices(company_id) where deleted_at is null;
create unique index invoices_external_uniq on invoices(source, external_id)
  where external_id is not null;

create table payments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  invoice_id   uuid references invoices(id) on delete set null,
  client_id    uuid references clients(id) on delete set null,
  direction    text not null default 'inbound' check (direction in ('inbound','outbound')),
  amount       numeric(14,2) not null default 0,
  currency     text not null default 'USD',
  status       text not null default 'succeeded' check (status in (
                 'pending','succeeded','failed','refunded','disputed')),
  method       text,
  occurred_at  timestamptz not null default now(),
  description  text,
  failure_reason text,
  source       text not null default 'manual'
                 check (source in ('manual','stripe','gusto','csv','import')),
  external_id  text,
  is_demo      boolean not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index payments_company_idx on payments(company_id, occurred_at) where deleted_at is null;
create unique index payments_external_uniq on payments(source, external_id)
  where external_id is not null;

create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,
  parfax_user_id uuid,
  customer_label text,
  plan          text not null,
  status        text not null default 'active' check (status in (
                  'trialing','active','past_due','canceled','paused','incomplete')),
  interval      text not null default 'month' check (interval in ('day','week','month','year')),
  amount        numeric(14,2) not null default 0,
  currency      text not null default 'USD',
  quantity      integer not null default 1,
  started_at    timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  canceled_at   timestamptz,
  source        text not null default 'manual'
                  check (source in ('manual','stripe','parfax','csv','import')),
  external_id   text,
  is_demo       boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index subscriptions_company_idx on subscriptions(company_id, status) where deleted_at is null;
create unique index subscriptions_external_uniq on subscriptions(source, external_id)
  where external_id is not null;

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  category        text not null default 'other' check (category in (
                    'contractor','payroll','software','marketing','equipment',
                    'travel','professional_services','other')),
  vendor_organization_id uuid references organizations(id) on delete set null,
  member_id       uuid,
  client_id       uuid references clients(id) on delete set null,
  description     text not null,
  amount          numeric(14,2) not null default 0,
  currency        text not null default 'USD',
  incurred_on     date not null default current_date,
  recurring       text check (recurring in ('monthly','quarterly','annual')),
  source          text not null default 'manual'
                    check (source in ('manual','stripe','gusto','csv','import')),
  external_id     text,
  is_demo         boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index expenses_company_idx on expenses(company_id, incurred_on) where deleted_at is null;

-- Manually entered figures are never silently blended with connected data:
-- every row carries an explicit source label surfaced in the UI.
create table financial_adjustments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  label       text not null,
  metric      text not null,
  amount      numeric(14,2) not null default 0,
  currency    text not null default 'USD',
  period_start date not null,
  period_end   date not null,
  note        text,
  source_label text not null default 'Manual entry',
  created_by_id uuid references users(id) on delete set null,
  is_demo     boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index financial_adjustments_company_idx on financial_adjustments(company_id);

-- -------------------------------------------------------- team & org chart
create table members (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  user_id           uuid references users(id) on delete set null,
  contact_id        uuid references contacts(id) on delete set null,
  full_name         text not null,
  email             text,
  phone             text,
  kind              text not null default 'employee'
                      check (kind in ('employee','contractor','agency','advisor')),
  title             text not null default '',
  role_description  text,
  department_id     uuid references departments(id) on delete set null,
  team_id           uuid references teams(id) on delete set null,
  manager_id        uuid references members(id) on delete set null,
  employment_type   text not null default 'full_time' check (employment_type in (
                      'full_time','part_time','contract','hourly','project')),
  pay_rate          numeric(14,2),
  pay_rate_unit     text check (pay_rate_unit in ('hour','day','month','year','project')),
  pay_schedule      text check (pay_schedule in ('weekly','biweekly','semimonthly','monthly','on_invoice')),
  currency          text not null default 'USD',
  start_date        date,
  end_date          date,
  status            text not null default 'active'
                      check (status in ('active','on_leave','offboarding','inactive')),
  skills            text[] not null default '{}',
  capacity_hours    numeric(6,2) not null default 40,
  location          text,
  is_vacant         boolean not null default false,
  external_source   text,
  external_id       text,
  external_synced_at timestamptz,
  is_demo           boolean not null default false,
  archived_at       timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index members_company_idx on members(company_id) where deleted_at is null;
create index members_manager_idx on members(manager_id);
create unique index members_external_uniq on members(external_source, external_id)
  where external_source is not null and external_id is not null;

create table member_assignments (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references members(id) on delete cascade,
  client_id      uuid references clients(id) on delete cascade,
  project_id     uuid references projects(id) on delete cascade,
  role           text not null default 'contributor',
  allocation_pct integer not null default 0 check (allocation_pct between 0 and 100),
  start_date     date,
  end_date       date,
  created_at     timestamptz not null default now()
);
create index member_assignments_member_idx on member_assignments(member_id);

create table contractor_invoices (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  number       text,
  period_start date,
  period_end   date,
  amount       numeric(14,2) not null default 0,
  currency     text not null default 'USD',
  status       text not null default 'submitted' check (status in (
                 'draft','submitted','approved','paid','disputed','void')),
  submitted_at timestamptz,
  due_date     date,
  paid_at      timestamptz,
  document_id  uuid references documents(id) on delete set null,
  notes        text,
  source       text not null default 'manual'
                 check (source in ('manual','gusto','csv','import')),
  external_id  text,
  is_demo      boolean not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index contractor_invoices_company_idx on contractor_invoices(company_id, status);

-- Org-chart reporting changes are auditable on their own timeline.
create table org_chart_changes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  member_id      uuid not null references members(id) on delete cascade,
  from_manager_id uuid references members(id) on delete set null,
  to_manager_id   uuid references members(id) on delete set null,
  reason         text not null,
  actor_user_id  uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index org_chart_changes_company_idx on org_chart_changes(company_id, created_at);
