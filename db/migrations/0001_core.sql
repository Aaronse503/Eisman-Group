-- =====================================================================
-- 0001_core.sql — Eisman Holdings Command Center: tenancy, identity, RBAC
-- Portable Postgres 14+ (runs on Supabase, plain Postgres, and PGlite).
-- No extensions required: gen_random_uuid() is core since PG13.
-- =====================================================================

create schema if not exists app;

-- Returns the user id for the current request. On Supabase this falls back to
-- auth.uid(); everywhere else the app sets `app.user_id` per transaction.
create or replace function app.current_user_id() returns uuid
language plpgsql stable as $$
declare v text;
begin
  v := current_setting('app.user_id', true);
  if v is null or v = '' then return null; end if;
  return v::uuid;
exception when others then return null;
end $$;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- holdings
create table holdings (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  legal_name    text,
  tagline       text,
  timezone      text not null default 'America/New_York',
  base_currency text not null default 'USD',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table companies (
  id            uuid primary key default gen_random_uuid(),
  holding_id    uuid not null references holdings(id) on delete cascade,
  slug          text not null unique,
  name          text not null,
  legal_name    text,
  kind          text not null default 'operating'
                  check (kind in ('operating','holding','spv','product')),
  status        text not null default 'active'
                  check (status in ('active','paused','archived')),
  description   text,
  website       text,
  brand_color   text not null default '#0F5132',
  accent_color  text not null default '#C8A951',
  timezone      text not null default 'America/New_York',
  currency      text not null default 'USD',
  logo_url      text,
  position      integer not null default 0,
  is_demo       boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index companies_holding_idx on companies(holding_id) where archived_at is null;

create table departments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  parent_id     uuid references departments(id) on delete set null,
  name          text not null,
  description   text,
  is_demo       boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index departments_company_idx on departments(company_id);

create table teams (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  name          text not null,
  description   text,
  is_demo       boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index teams_company_idx on teams(company_id);

-- ---------------------------------------------------------------- identity
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  name           text not null,
  title          text,
  phone          text,
  avatar_url     text,
  timezone       text not null default 'America/New_York',
  password_hash  text,
  password_algo  text not null default 'scrypt',
  status         text not null default 'active'
                   check (status in ('active','invited','suspended','deactivated')),
  must_change_password boolean not null default false,
  last_login_at  timestamptz,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index users_email_lower_idx on users(lower(email));

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  issued_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  ip            text,
  user_agent    text
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expiry_idx on sessions(expires_at) where revoked_at is null;

-- A NULL company_id grants the role across the whole holding company.
create table user_company_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  role       text not null check (role in (
                'holdings_owner','company_admin','finance',
                'account_manager','team_member','contractor','viewer')),
  created_at timestamptz not null default now()
);
create unique index user_company_roles_uniq
  on user_company_roles(user_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
create index user_company_roles_user_idx on user_company_roles(user_id);

create table rate_limits (
  bucket       text primary key,
  window_start timestamptz not null,
  count        integer not null default 0
);

create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);
