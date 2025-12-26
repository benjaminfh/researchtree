-- Drop legacy shadow-write stars RPCs and restore FK integrity.
-- Stars are now PG-native mutable UI state and should reference real `nodes(id)`.

do $$
begin
  -- Legacy shadow-write RPCs (no longer used).
  execute 'drop function if exists public.rt_toggle_star(uuid, uuid)';
  execute 'drop function if exists public.rt_sync_stars(uuid, uuid[])';
end
$$;

-- Ensure FK exists (older migrations dropped it for shadow-write compatibility).
do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'stars'
      and c.contype = 'f'
  ) into v_exists;

  if not v_exists then
    alter table public.stars
      add constraint stars_node_id_fkey
      foreign key (node_id) references public.nodes(id) on delete cascade;
  end if;
end
$$;

