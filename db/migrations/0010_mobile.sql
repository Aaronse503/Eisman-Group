-- Support for the mobile application.
--
-- No new source of truth: these tables record which devices a person signs in
-- from, and which changes made offline have already been applied. Every record
-- the mobile application reads or writes lives in the tables the web
-- application already uses, under the same row-level security.

-- ------------------------------------------------------------------ devices

create table devices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  -- Generated once per installation and kept in the device's secure storage.
  installation_id   text not null,
  platform          text not null check (platform in ('ios', 'android', 'web')),
  model             text,
  os_version        text,
  app_version       text,
  -- Expo push token. Null until the person allows notifications.
  push_token        text,
  push_enabled      boolean not null default false,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint devices_installation_uniq unique (user_id, installation_id)
);

create index devices_user_idx on devices (user_id) where push_enabled;
create index devices_push_token_idx on devices (push_token) where push_token is not null;

-- ------------------------------------------------------- offline change log

-- A change made on a device with no connection is queued there and sent when
-- the connection returns. The device generates the id, so a retry after a
-- timeout applies the change once rather than twice.
create table client_mutations (
  client_id     uuid primary key,
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,
  -- The record this produced, so a retry can return the same answer.
  entity_type   text,
  entity_id     uuid,
  status        text not null check (status in ('applied', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create index client_mutations_user_idx on client_mutations (user_id, created_at desc);

-- ----------------------------------------------------------- notifications

-- Delivery attempts, so a notification that never arrived can be told apart
-- from one that was never sent.
create table push_deliveries (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid references notifications(id) on delete cascade,
  device_id        uuid not null references devices(id) on delete cascade,
  status           text not null check (status in ('queued', 'sent', 'failed', 'rejected')),
  ticket_id        text,
  error            text,
  created_at       timestamptz not null default now()
);

create index push_deliveries_device_idx on push_deliveries (device_id, created_at desc);

-- ----------------------------------------------------------------- triggers

create trigger set_updated_at
  before update on devices
  for each row execute function app.set_updated_at();

-- --------------------------------------------------------- row-level security

alter table devices enable row level security;
alter table devices force row level security;
alter table client_mutations enable row level security;
alter table client_mutations force row level security;
alter table push_deliveries enable row level security;
alter table push_deliveries force row level security;

-- A person sees their own devices and their own queued changes, and nobody
-- else's. There is no company dimension here: these belong to a person.
create policy devices_own on devices
  using (app.is_service() or user_id = app.current_user_id())
  with check (app.is_service() or user_id = app.current_user_id());

create policy client_mutations_own on client_mutations
  using (app.is_service() or user_id = app.current_user_id())
  with check (app.is_service() or user_id = app.current_user_id());

create policy push_deliveries_own on push_deliveries
  using (
    app.is_service()
    or device_id in (select id from devices where user_id = app.current_user_id())
  )
  with check (app.is_service());

grant select, insert, update, delete on devices to app_user;
grant select, insert, update, delete on client_mutations to app_user;
grant select on push_deliveries to app_user;
