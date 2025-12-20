-- RPC: toggle a star for a node (stars are mutable UI state).

create or replace function public.rt_toggle_star_v1(
  p_project_id uuid,
  p_node_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_node_id is null then
    raise exception 'node id is required';
  end if;

  if exists (
    select 1 from public.stars s
    where s.project_id = p_project_id and s.node_id = p_node_id
  ) then
    delete from public.stars s
    where s.project_id = p_project_id and s.node_id = p_node_id;
  else
    insert into public.stars (project_id, node_id)
    values (p_project_id, p_node_id)
    on conflict do nothing;
  end if;

  select coalesce(array_agg(s.node_id order by s.created_at asc), '{}'::uuid[])
    into v_ids
  from public.stars s
  where s.project_id = p_project_id;

  return v_ids;
end;
$$;

revoke all on function public.rt_toggle_star_v1(uuid, uuid) from public;
grant execute on function public.rt_toggle_star_v1(uuid, uuid) to authenticated;

