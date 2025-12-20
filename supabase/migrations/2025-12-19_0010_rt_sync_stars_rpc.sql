-- Shadow-write helper: keep Postgres stars in sync with git stars.json.
-- This is intentionally "last write wins" for the full starred set.

create or replace function public.rt_sync_stars(
  p_project_id uuid,
  p_node_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_ids uuid[] := coalesce(p_node_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  -- Remove any stars not present in the incoming list.
  if array_length(v_node_ids, 1) is null then
    delete from public.stars s
    where s.project_id = p_project_id;
  else
    delete from public.stars s
    where s.project_id = p_project_id
      and not (s.node_id = any(v_node_ids));
  end if;

  -- Insert missing stars.
  insert into public.stars (project_id, node_id)
  select p_project_id, x.node_id
  from unnest(v_node_ids) as x(node_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.rt_sync_stars(uuid, uuid[]) from public;
grant execute on function public.rt_sync_stars(uuid, uuid[]) to authenticated;

