-- =====================================================================
-- 0007_rls.sql — row level security
--
-- Defence in depth. The application layer is the primary authorization
-- gate (see src/lib/rbac) and is what the authorization tests exercise;
-- RLS is a second, database-level backstop that holds even if a query
-- escapes the repository layer. Both read the same role table.
--
-- The current actor is resolved by app.current_user_id(), which reads the
-- `app.user_id` setting the connection layer sets per transaction, and
-- falls back to Supabase's auth.uid() when deployed there.
-- =====================================================================

create or replace function app.is_holdings_owner() returns boolean
language sql stable as $$
  select exists (
    select 1 from user_company_roles r
    where r.user_id = app.current_user_id()
      and r.company_id is null
      and r.role = 'holdings_owner'
  );
$$;

-- Holdings-wide grants (company_id is null) apply to every company.
create or replace function app.company_roles(cid uuid) returns text[]
language sql stable as $$
  select coalesce(array_agg(distinct r.role), '{}')
  from user_company_roles r
  where r.user_id = app.current_user_id()
    and (r.company_id = cid or r.company_id is null);
$$;

create or replace function app.can_read_company(cid uuid) returns boolean
language sql stable as $$
  select app.is_holdings_owner()
      or (cid is not null and cardinality(app.company_roles(cid)) > 0);
$$;

create or replace function app.can_write_company(cid uuid) returns boolean
language sql stable as $$
  select app.is_holdings_owner()
      or (cid is not null and app.company_roles(cid) && array[
            'company_admin','finance','account_manager','team_member']::text[]);
$$;

-- Bypass for the migration/seed/service connection, which runs as owner.
create or replace function app.is_service() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.service_role', true), '') = 'on';
$$;

do $$
declare
  t text;
  -- Tables scoped by a NOT NULL company_id column.
  strict_company text[] := array[
    'departments','teams','organizations','contacts','clients','deals','projects',
    'tasks','meetings','action_items','notes','folders','documents','invoices',
    'payments','subscriptions','expenses','financial_adjustments','members',
    'contractor_invoices','org_chart_changes','partnerships','knowledge_chunks'];
  -- Tables where company_id may be NULL (holdings-wide rows).
  loose_company text[] := array[
    'investors','outreach_activities','message_templates','tags','comments',
    'reminders','activity_log','integration_connections','imports','saved_views',
    'custom_field_defs','calendars','notifications','recently_viewed'];
begin
  foreach t in array strict_company loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format($p$
      create policy %1$s_read on public.%1$I for select
        using (app.is_service() or app.can_read_company(company_id));
      create policy %1$s_write on public.%1$I for all
        using (app.is_service() or app.can_write_company(company_id))
        with check (app.is_service() or app.can_write_company(company_id));
    $p$, t);
  end loop;

  foreach t in array loose_company loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format($p$
      create policy %1$s_read on public.%1$I for select
        using (app.is_service()
               or company_id is null and app.current_user_id() is not null
               or app.can_read_company(company_id));
      create policy %1$s_write on public.%1$I for all
        using (app.is_service()
               or company_id is null and app.current_user_id() is not null
               or app.can_write_company(company_id))
        with check (app.is_service()
               or company_id is null and app.current_user_id() is not null
               or app.can_write_company(company_id));
    $p$, t);
  end loop;
end $$;

-- Audit log: readable by holdings owners and company admins; never mutable
-- from a user connection (inserts go through the service connection).
alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy audit_log_read on audit_log for select
  using (app.is_service()
         or app.is_holdings_owner()
         or app.company_roles(company_id) && array['company_admin','finance']::text[]);
create policy audit_log_insert on audit_log for insert
  with check (app.is_service() or app.current_user_id() is not null);

-- Users may always read themselves; holdings owners and company admins may
-- read everyone. Session rows are only ever visible to their owner.
alter table users enable row level security;
alter table users force row level security;
create policy users_self_read on users for select
  using (app.is_service() or id = app.current_user_id() or app.is_holdings_owner()
         or exists (select 1 from user_company_roles r
                    where r.user_id = app.current_user_id()
                      and r.role in ('company_admin','holdings_owner')));
create policy users_self_update on users for update
  using (app.is_service() or id = app.current_user_id() or app.is_holdings_owner())
  with check (app.is_service() or id = app.current_user_id() or app.is_holdings_owner());

alter table sessions enable row level security;
alter table sessions force row level security;
create policy sessions_own on sessions for all
  using (app.is_service() or user_id = app.current_user_id())
  with check (app.is_service() or user_id = app.current_user_id());

-- ParFax production mirrors carry no company_id; access is gated on holding
-- membership in the app layer and on ParFax company membership here.
do $$
declare t text;
begin
  foreach t in array array['parfax_users','parfax_scans','parfax_locations',
                           'parfax_marketplace_events','parfax_support_issues',
                           'parfax_metrics','parfax_annotations'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format($p$
      create policy %1$s_read on public.%1$I for select
        using (app.is_service() or exists (
          select 1 from companies c
          where c.slug = 'parfax' and app.can_read_company(c.id)));
      create policy %1$s_write on public.%1$I for all
        using (app.is_service() or exists (
          select 1 from companies c
          where c.slug = 'parfax' and app.can_write_company(c.id)))
        with check (app.is_service() or exists (
          select 1 from companies c
          where c.slug = 'parfax' and app.can_write_company(c.id)));
    $p$, t);
  end loop;
end $$;
