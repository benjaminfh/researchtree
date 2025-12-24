-- Some environments auto-name FKs differently, so drop any FK from public.stars(node_id)
-- (we allow stars to reference git node IDs during shadow-write before nodes are migrated).

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'stars'
      and c.contype = 'f'
  loop
    execute format('alter table public.stars drop constraint if exists %I', r.conname);
  end loop;
end
$$;

