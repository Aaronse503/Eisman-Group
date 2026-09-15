-- =====================================================================
-- 0008_app_role.sql — the non-privileged role that RLS actually applies to
--
-- Superusers and BYPASSRLS roles ignore row level security even with FORCE,
-- so a policy is only meaningful when the query runs as an ordinary role.
-- `app_user` is that role: no login of its own, no bypass, and exactly the
-- table privileges the application needs.
--
-- The connection layer switches into it (SET LOCAL ROLE app_user) whenever it
-- runs as a specific end user, which is how the RLS tests exercise the
-- policies and how a Supabase/Postgres deployment should run user-scoped work.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit;
  end if;
end $$;

grant usage on schema public to app_user;
grant usage on schema app to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
grant execute on all functions in schema app to app_user;

-- New tables created by later migrations inherit the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;
alter default privileges in schema app grant execute on functions to app_user;

-- The audit log is append-only for everyone, including this role.
revoke update, delete on audit_log from app_user;

-- Session tokens are never readable in bulk by the user-scoped role beyond
-- what the RLS policy already allows; revoke the destructive verbs on the
-- migration bookkeeping table outright.
revoke insert, update, delete on schema_migrations from app_user;
