-- Add branch visibility flag and RPC helpers.

alter table public.refs
  add column if not exists is_hidden boolean not null default false;

drop function if exists public.rt_set_ref_hidden_v1(uuid, uuid, boolean, integer);

create function public.rt_set_ref_hidden_v1(
  p_project_id uuid,
  p_ref_id uuid,
  p_is_hidden boolean default true,
  p_lock_timeout_ms integer default 3000
)
returns void
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
  if p_ref_id is null then
    raise exception 'ref id required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  update public.refs r
    set is_hidden = coalesce(p_is_hidden, false),
        updated_at = now()
  where r.project_id = p_project_id and r.id = p_ref_id;

  if not found then
    raise exception 'Ref not found';
  end if;
end;
$$;

revoke all on function public.rt_set_ref_hidden_v1(uuid, uuid, boolean, integer) from public;
grant execute on function public.rt_set_ref_hidden_v1(uuid, uuid, boolean, integer) to authenticated;

drop function if exists public.rt_list_refs_v2(uuid);

create function public.rt_list_refs_v2(
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
  model text
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
    r.id,
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk,
    (r.id = p.pinned_ref_id) as is_pinned,
    r.is_hidden,
    r.provider,
    r.model
  from public.refs r
  left join (
    select co.ref_id, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_id
  ) mx on mx.ref_id = r.id
  left join public.projects p on p.id = p_project_id
  where r.project_id = p_project_id
  order by r.is_hidden asc, (r.id = p.pinned_ref_id) desc, (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v2(uuid) from public;
grant execute on function public.rt_list_refs_v2(uuid) to authenticated;
