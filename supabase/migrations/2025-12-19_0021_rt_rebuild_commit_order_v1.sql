-- Repair + hardening: rebuild commit_order from the ref's parent1 commit chain.
-- This fixes corrupted refs created before commit_order-copy semantics were correct.

create or replace function public.rt_rebuild_commit_order_v1(
  p_project_id uuid,
  p_ref_name text,
  p_lock_timeout_ms integer default 3000
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_name text;
  v_tip uuid;
  v_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  v_ref_name := btrim(coalesce(p_ref_name, ''));
  if v_ref_name = '' then
    raise exception 'ref name is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id
    into v_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = v_ref_name
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  delete from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = v_ref_name;

  if v_tip is null then
    return 0;
  end if;

  with recursive chain as (
    select c.id as commit_id, c.parent1_commit_id, 0::bigint as depth
    from public.commits c
    where c.id = v_tip
    union all
    select c.id, c.parent1_commit_id, (chain.depth + 1)
    from chain
    join public.commits c on c.id = chain.parent1_commit_id
    where chain.parent1_commit_id is not null
  ),
  ordered as (
    select commit_id, (row_number() over (order by depth desc) - 1)::bigint as ordinal
    from chain
  )
  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  select p_project_id, v_ref_name, o.ordinal, o.commit_id
  from ordered o
  order by o.ordinal asc;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.rt_rebuild_commit_order_v1(uuid, text, integer) from public;
grant execute on function public.rt_rebuild_commit_order_v1(uuid, text, integer) to authenticated;
