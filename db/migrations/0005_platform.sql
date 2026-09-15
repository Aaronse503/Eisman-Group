-- =====================================================================
-- 0005_platform.sql — tags, custom fields, comments, reminders,
-- notifications, activity, audit, integrations, imports, saved views
-- =====================================================================

create table tags (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name       text not null,
  color      text not null default '#0F5132',
  kind       text not null default 'general',
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index tags_uniq
  on tags(coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table taggings (
  id          uuid primary key default gen_random_uuid(),
  tag_id      uuid not null references tags(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);
create unique index taggings_uniq on taggings(tag_id, entity_type, entity_id);
create index taggings_entity_idx on taggings(entity_type, entity_id);

create table custom_field_defs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  entity_type text not null,
  key         text not null,
  label       text not null,
  field_type  text not null default 'text' check (field_type in (
                'text','textarea','number','currency','date','boolean','select','multiselect','url','email')),
  options     text[] not null default '{}',
  required    boolean not null default false,
  help_text   text,
  position    integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index custom_field_defs_uniq
  on custom_field_defs(coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_type, key);

create table custom_field_values (
  id          uuid primary key default gen_random_uuid(),
  def_id      uuid not null references custom_field_defs(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  value       jsonb,
  updated_at  timestamptz not null default now()
);
create unique index custom_field_values_uniq on custom_field_values(def_id, entity_id);
create index custom_field_values_entity_idx on custom_field_values(entity_type, entity_id);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  parent_id   uuid references comments(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  body        text not null,
  is_demo     boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index comments_entity_idx on comments(entity_type, entity_id, created_at);

create table reminders (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  entity_type text,
  entity_id   uuid,
  title       text not null,
  body        text,
  remind_at   timestamptz not null,
  status      text not null default 'pending'
                check (status in ('pending','sent','dismissed','done')),
  sent_at     timestamptz,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index reminders_due_idx on reminders(remind_at) where status = 'pending';
create index reminders_user_idx on reminders(user_id, status);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  kind        text not null default 'info'
                check (kind in ('info','success','warning','error','mention','assignment','reminder')),
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  href        text,
  read_at     timestamptz,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);

create table activity_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  entity_type   text not null,
  entity_id     uuid,
  action        text not null,
  summary       text not null,
  meta          jsonb not null default '{}'::jsonb,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index activity_log_company_idx on activity_log(company_id, created_at desc);
create index activity_log_entity_idx on activity_log(entity_type, entity_id, created_at desc);

-- Append-only. UPDATE/DELETE are blocked by trigger below and by RLS.
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  actor_email   text,
  actor_ip      text,
  user_agent    text,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  entity_label  text,
  reason        text,
  before_value  jsonb,
  after_value   jsonb,
  severity      text not null default 'info'
                  check (severity in ('info','notice','warning','critical')),
  created_at    timestamptz not null default now()
);
create index audit_log_created_idx on audit_log(created_at desc);
create index audit_log_entity_idx on audit_log(entity_type, entity_id);
create index audit_log_actor_idx on audit_log(actor_user_id, created_at desc);

create or replace function app.audit_log_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only (attempted %)', TG_OP;
end $$;

create trigger audit_log_no_update before update on audit_log
  for each row execute function app.audit_log_is_append_only();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function app.audit_log_is_append_only();

create table recently_viewed (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  label       text not null,
  href        text not null,
  viewed_at   timestamptz not null default now()
);
create unique index recently_viewed_uniq on recently_viewed(user_id, entity_type, entity_id);
create index recently_viewed_user_idx on recently_viewed(user_id, viewed_at desc);

-- ------------------------------------------------------------ integrations
create table integration_connections (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  provider       text not null check (provider in (
                   'clickup','stripe','gusto','google_calendar','parfax_crm','anthropic','email')),
  status         text not null default 'disconnected' check (status in (
                   'disconnected','connected','error','needs_reauth')),
  mode           text not null default 'disconnected'
                   check (mode in ('disconnected','demo','live')),
  account_name   text,
  account_id     text,
  scopes         text[] not null default '{}',
  config         jsonb not null default '{}'::jsonb,
  -- AES-256-GCM ciphertext; the key never leaves the server environment.
  credentials_encrypted text,
  credentials_hint text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error     text,
  sync_cursor    jsonb not null default '{}'::jsonb,
  write_enabled  boolean not null default false,
  created_by_id  uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index integration_connections_uniq
  on integration_connections(provider, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table integration_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections(id) on delete cascade,
  trigger       text not null default 'manual'
                  check (trigger in ('manual','scheduled','webhook','startup')),
  status        text not null default 'running'
                  check (status in ('running','success','partial','failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  records_read  integer not null default 0,
  records_written integer not null default 0,
  conflicts     integer not null default 0,
  error         text,
  log           jsonb not null default '[]'::jsonb,
  actor_user_id uuid references users(id) on delete set null
);
create index integration_sync_runs_conn_idx on integration_sync_runs(connection_id, started_at desc);

-- Maps an external provider record to its local row, so re-syncs update
-- rather than duplicate, and conflicts can be detected by content hash.
create table external_record_map (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections(id) on delete cascade,
  provider      text not null,
  entity_type   text not null,
  external_id   text not null,
  local_id      uuid not null,
  remote_hash   text,
  local_hash    text,
  last_synced_at timestamptz not null default now(),
  conflict      boolean not null default false,
  conflict_detail jsonb
);
create unique index external_record_map_uniq
  on external_record_map(connection_id, entity_type, external_id);
create index external_record_map_local_idx on external_record_map(entity_type, local_id);

create table field_mappings (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references integration_connections(id) on delete cascade,
  entity_type   text not null,
  source_field  text not null,
  target_field  text not null,
  transform     text,
  source_of_truth text not null default 'remote'
                  check (source_of_truth in ('remote','local','manual')),
  approved      boolean not null default false,
  approved_by_id uuid references users(id) on delete set null,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index field_mappings_uniq on field_mappings(connection_id, entity_type, source_field);

-- ------------------------------------------------------- imports & exports
create table imports (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  entity_type   text not null,
  filename      text not null,
  status        text not null default 'mapping' check (status in (
                  'mapping','validating','previewed','importing','complete','failed','rolled_back')),
  mapping       jsonb not null default '{}'::jsonb,
  duplicate_strategy text not null default 'skip'
                  check (duplicate_strategy in ('skip','update','create_anyway')),
  total_rows    integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count  integer not null default 0,
  errors        jsonb not null default '[]'::jsonb,
  raw_sample    jsonb not null default '[]'::jsonb,
  rolled_back_at timestamptz,
  created_by_id uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index imports_company_idx on imports(company_id, created_at desc);

create table import_records (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references imports(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  action      text not null check (action in ('created','updated','skipped')),
  row_number  integer,
  created_at  timestamptz not null default now()
);
create index import_records_import_idx on import_records(import_id);

create table saved_views (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  user_id     uuid references users(id) on delete cascade,
  entity_type text not null,
  name        text not null,
  config      jsonb not null default '{}'::jsonb,
  is_shared   boolean not null default false,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index saved_views_lookup_idx on saved_views(entity_type, company_id);
