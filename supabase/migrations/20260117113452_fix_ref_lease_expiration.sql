-- Qualify expires_at references to avoid ambiguity with output columns.
create or replace function public.rt_list_ref_leases_v1(
  p_project_id uuid
)
returns table (
  ref_id uuid,
  holder_user_id uuid,
  holder_session_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  delete from public.ref_leases
   where project_id = p_project_id
     and public.ref_leases.expires_at < now();

  return query
    select l.ref_id, l.holder_user_id, l.holder_session_id, l.expires_at
      from public.ref_leases l
     where l.project_id = p_project_id;
end;
$$;

revoke all on function public.rt_list_ref_leases_v1(uuid) from public;
grant execute on function public.rt_list_ref_leases_v1(uuid) to authenticated;

create or replace function public.rt_list_refs_v2(
  p_project_id uuid
)
returns table (
  id uuid,
  name text,
  head_commit text,
  node_count bigint,
  is_trunk boolean,
  is_pinned boolean,
  is_hidden boolean,
  provider text,
  model text,
  lease_holder_user_id uuid,
  lease_holder_session_id text,
  lease_expires_at timestamptz
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

  delete from public.ref_leases
   where project_id = p_project_id
     and public.ref_leases.expires_at < now();

  return query
  select
    r.id,
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk,
    (r.id = p.pinned_ref_id) as is_pinned,
    coalesce(r.is_hidden, false) as is_hidden,
    r.provider,
    r.model,
    l.holder_user_id,
    l.holder_session_id,
    l.expires_at
  from public.refs r
  left join (
    select co.ref_id, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_id
  ) mx on mx.ref_id = r.id
  left join public.projects p on p.id = p_project_id
  left join public.ref_leases l
    on l.project_id = r.project_id
   and l.ref_id = r.id
  where r.project_id = p_project_id
  order by (r.id = p.pinned_ref_id) desc, (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v2(uuid) from public;
grant execute on function public.rt_list_refs_v2(uuid) to authenticated;
