-- RPC: create an edit branch rooted at the parent of a specific node (by stable node id),
-- copying commit_order prefix so edit-index behavior matches git.

create or replace function public.rt_create_ref_from_node_parent_v1(
  p_project_id uuid,
  p_source_ref_name text,
  p_new_ref_name text,
  p_node_id uuid,
  p_lock_timeout_ms integer default 3000
)
returns table (
  base_commit_id uuid,
  base_ordinal bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_commit_id uuid;
  v_node_ordinal bigint;
  v_base_commit_id uuid;
  v_base_ordinal bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_source_ref_name, null)
  on conflict do nothing;

  select n.commit_id
    into v_node_commit_id
  from public.nodes n
  where n.project_id = p_project_id and n.id = p_node_id;

  if not found then
    raise exception 'Node not found in Postgres (shadow-write not available for this history yet)';
  end if;

  select co.ordinal
    into v_node_ordinal
  from public.commit_order co
  where co.project_id = p_project_id
    and co.ref_name = p_source_ref_name
    and co.commit_id = v_node_commit_id;

  if not found then
    raise exception 'Node is not on source ref in Postgres';
  end if;

  select c.parent1_commit_id
    into v_base_commit_id
  from public.commits c
  where c.id = v_node_commit_id;

  v_base_ordinal := v_node_ordinal - 1;

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_new_ref_name, v_base_commit_id)
  on conflict (project_id, name)
  do update set
    tip_commit_id = excluded.tip_commit_id,
    updated_at = now();

  delete from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_new_ref_name;

  if v_base_ordinal >= 0 then
    insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
    select co.project_id, p_new_ref_name, co.ordinal, co.commit_id
    from public.commit_order co
    where co.project_id = p_project_id
      and co.ref_name = p_source_ref_name
      and co.ordinal <= v_base_ordinal
    order by co.ordinal asc;
  end if;

  return query select v_base_commit_id, v_base_ordinal;
end;
$$;

revoke all on function public.rt_create_ref_from_node_parent_v1(uuid, text, text, uuid, integer) from public;
grant execute on function public.rt_create_ref_from_node_parent_v1(uuid, text, text, uuid, integer) to authenticated;

