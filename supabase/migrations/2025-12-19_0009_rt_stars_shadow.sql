-- Stars are mutable UI state. During shadow-write, node IDs may not exist in `nodes` yet.
-- Drop the FK to allow stars to reference git node IDs safely.

alter table public.stars drop constraint if exists stars_node_id_fkey;

-- RPC: toggle star
create or replace function public.rt_toggle_star(
  p_project_id uuid,
  p_node_id uuid
)
returns table (
  starred boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  delete from public.stars s
  where s.project_id = p_project_id and s.node_id = p_node_id;

  v_deleted := found;

  if v_deleted then
    return query select false;
    return;
  end if;

  insert into public.stars (project_id, node_id)
  values (p_project_id, p_node_id)
  on conflict do nothing;

  return query select true;
end;
$$;

revoke all on function public.rt_toggle_star(uuid, uuid) from public;
grant execute on function public.rt_toggle_star(uuid, uuid) to authenticated;

