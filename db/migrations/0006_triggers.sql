-- =====================================================================
-- 0006_triggers.sql — updated_at maintenance for every versioned table
-- =====================================================================
do $$
declare t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
         for each row execute function app.set_updated_at();', t.table_name, t.table_name);
  end loop;
end $$;
