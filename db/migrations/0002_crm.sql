-- =====================================================================
-- 0002_crm.sql — contacts, organizations, clients, deals, projects, tasks
-- =====================================================================

create table organizations (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  name             text not null,
  legal_name       text,
  domain           text,
  website          text,
  industry         text,
  size_band        text,
  description      text,
  logo_url         text,
  linkedin_url     text,
  twitter_url      text,
  instagram_url    text,
  address_line1    text,
  address_line2    text,
  city             text,
  region           text,
  postal_code      text,
  country          text,
  status           text not null default 'active'
                     check (status in ('active','inactive','archived')),
  owner_user_id    uuid references users(id) on delete set null,
  is_demo          boolean not null default false,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index organizations_company_idx on organizations(company_id) where deleted_at is null;

-- An organization may simultaneously be a client, a vendor and a partner.
create table organization_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role            text not null check (role in (
                    'client','prospect','vendor','partner','investor',
                    'agency','media','oem','retailer','course','technology')),
  created_at      timestamptz not null default now()
);
create unique index organization_roles_uniq on organization_roles(organization_id, role);

create table contacts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  organization_id  uuid references organizations(id) on delete set null,
  first_name       text not null,
  last_name        text,
  email            text,
  secondary_email  text,
  phone            text,
  title            text,
  linkedin_url     text,
  twitter_url      text,
  timezone         text,
  city             text,
  country          text,
  description      text,
  status           text not null default 'active'
                     check (status in ('active','inactive','archived')),
  owner_user_id    uuid references users(id) on delete set null,
  is_demo          boolean not null default false,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index contacts_company_idx on contacts(company_id) where deleted_at is null;
create index contacts_org_idx on contacts(organization_id);
create index contacts_email_idx on contacts(lower(email));

-- One person can be an investor, an advisor, a partner and a client at once.
create table contact_roles (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  role       text not null check (role in (
               'client','prospect','investor','advisor','partner','vendor',
               'contractor','employee','referral_partner','media','ambassador')),
  created_at timestamptz not null default now()
);
create unique index contact_roles_uniq on contact_roles(contact_id, role);

-- Cross-company / cross-entity relationships (e.g. contact ↔ partnership).
create table relationships (
  id           uuid primary key default gen_random_uuid(),
  from_type    text not null,
  from_id      uuid not null,
  to_type      text not null,
  to_id        uuid not null,
  kind         text not null default 'related',
  note         text,
  created_at   timestamptz not null default now()
);
create unique index relationships_uniq on relationships(from_type, from_id, to_type, to_id, kind);
create index relationships_to_idx on relationships(to_type, to_id);

-- ------------------------------------------------------------------ clients
create table clients (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  organization_id      uuid references organizations(id) on delete set null,
  name                 text not null,
  status               text not null default 'prospect' check (status in (
                         'prospect','active','paused','former','referral_partner')),
  stage                text not null default 'new' check (stage in (
                         'new','qualifying','proposal','negotiation','onboarding',
                         'delivering','renewal','offboarding','closed')),
  account_owner_id     uuid references users(id) on delete set null,
  website              text,
  socials              jsonb not null default '{}'::jsonb,
  services             text[] not null default '{}',
  monthly_retainer     numeric(14,2) not null default 0,
  contract_value       numeric(14,2) not null default 0,
  currency             text not null default 'USD',
  contract_start       date,
  contract_end         date,
  renewal_date         date,
  billing_status       text not null default 'current' check (billing_status in (
                         'current','pending','overdue','on_hold','not_billed')),
  health_score         integer not null default 70 check (health_score between 0 and 100),
  goals                text,
  deliverables         text,
  kpis                 text,
  risks                text,
  next_action          text,
  next_action_date     date,
  last_activity_at     timestamptz,
  position             integer not null default 0,
  is_demo              boolean not null default false,
  archived_at          timestamptz,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index clients_company_idx on clients(company_id) where deleted_at is null;
create index clients_status_idx on clients(company_id, status);

create table client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role       text not null default 'contact',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index client_contacts_uniq on client_contacts(client_id, contact_id);

create table client_team (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  user_id      uuid references users(id) on delete cascade,
  member_id    uuid,
  role         text not null default 'contributor',
  allocation_pct integer not null default 0,
  created_at   timestamptz not null default now()
);
create index client_team_client_idx on client_team(client_id);

create table deals (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  client_id        uuid references clients(id) on delete set null,
  organization_id  uuid references organizations(id) on delete set null,
  primary_contact_id uuid references contacts(id) on delete set null,
  name             text not null,
  stage            text not null default 'discovery' check (stage in (
                     'discovery','qualified','proposal','negotiation','won','lost')),
  value            numeric(14,2) not null default 0,
  currency         text not null default 'USD',
  probability      integer not null default 20 check (probability between 0 and 100),
  expected_close   date,
  closed_at        timestamptz,
  lost_reason      text,
  source           text,
  owner_user_id    uuid references users(id) on delete set null,
  notes            text,
  is_demo          boolean not null default false,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index deals_company_idx on deals(company_id) where deleted_at is null;

-- --------------------------------------------------------- projects & tasks
create table projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,
  name          text not null,
  description   text,
  status        text not null default 'active' check (status in (
                  'planned','active','on_hold','complete','cancelled')),
  owner_user_id uuid references users(id) on delete set null,
  start_date    date,
  due_date      date,
  color         text,
  external_source text,
  external_id   text,
  is_demo       boolean not null default false,
  archived_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index projects_company_idx on projects(company_id) where deleted_at is null;

create table tasks (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  project_id      uuid references projects(id) on delete set null,
  client_id       uuid references clients(id) on delete set null,
  parent_task_id  uuid references tasks(id) on delete cascade,
  title           text not null,
  description     text,
  status          text not null default 'todo' check (status in (
                    'backlog','todo','in_progress','blocked','in_review','done','cancelled')),
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assignee_user_id  uuid references users(id) on delete set null,
  assignee_member_id uuid,
  created_by_id   uuid references users(id) on delete set null,
  delegated_by_id uuid references users(id) on delete set null,
  waiting_on      text,
  start_at        timestamptz,
  due_at          timestamptz,
  completed_at    timestamptz,
  estimate_hours  numeric(8,2),
  is_personal     boolean not null default false,
  recurrence_rule text,
  recurrence_parent_id uuid references tasks(id) on delete set null,
  position        integer not null default 0,
  external_source text,
  external_id     text,
  external_url    text,
  external_synced_at timestamptz,
  is_demo         boolean not null default false,
  archived_at     timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_company_idx on tasks(company_id) where deleted_at is null;
create index tasks_assignee_idx on tasks(assignee_user_id, status);
create index tasks_due_idx on tasks(due_at) where completed_at is null;
create index tasks_parent_idx on tasks(parent_task_id);
create unique index tasks_external_uniq on tasks(external_source, external_id)
  where external_source is not null and external_id is not null;

create table task_dependencies (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  created_at         timestamptz not null default now(),
  check (task_id <> depends_on_task_id)
);
create unique index task_dependencies_uniq on task_dependencies(task_id, depends_on_task_id);
