-- Read RPCs for branches + graph endpoints.

create or replace function public.rt_list_refs_v1(
  p_project_id uuid
)
returns table (
  name text,
  head_commit text,
  node_count bigint,
  is_trunk boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk
  from public.refs r
  left join (
    select co.ref_name, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_name
  ) mx on mx.ref_name = r.name
  where r.project_id = p_project_id
  order by (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v1(uuid) from public;
grant execute on function public.rt_list_refs_v1(uuid) to authenticated;

create or replace function public.rt_get_starred_node_ids_v1(
  p_project_id uuid
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

  select coalesce(array_agg(s.node_id order by s.created_at asc), '{}'::uuid[])
    into v_ids
  from public.stars s
  where s.project_id = p_project_id;

  return v_ids;
end;
$$;

revoke all on function public.rt_get_starred_node_ids_v1(uuid) from public;
grant execute on function public.rt_get_starred_node_ids_v1(uuid) to authenticated;

