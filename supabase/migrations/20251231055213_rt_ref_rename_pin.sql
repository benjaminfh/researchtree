-- Add ref rename + pinned branch RPCs and surface is_pinned on list.

create or replace function public.rt_rename_ref_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_new_name text,
  p_lock_timeout_ms integer default 3000
)
returns table(ref_id uuid, ref_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_name text;
  v_current_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  v_new_name := btrim(coalesce(p_new_name, ''));
  if v_new_name = '' then
    raise exception 'Branch name is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.name
    into v_current_name
  from public.refs r
  where r.project_id = p_project_id
    and r.id = p_ref_id;

  if v_current_name is null then
    raise exception 'Branch not found';
  end if;
  if v_current_name = 'main' then
    raise exception 'Cannot rename trunk branch';
  end if;

  if exists (
    select 1
    from public.refs r
    where r.project_id = p_project_id
      and r.name = v_new_name
      and r.id <> p_ref_id
  ) then
    raise exception 'Branch name already exists';
  end if;

  update public.refs
  set name = v_new_name,
      updated_at = now()
  where project_id = p_project_id
    and id = p_ref_id;

  return query
  select r.id, r.name
  from public.refs r
  where r.project_id = p_project_id
    and r.id = p_ref_id;
end;
$$;

revoke all on function public.rt_rename_ref_v2(uuid, uuid, text, integer) from public;
grant execute on function public.rt_rename_ref_v2(uuid, uuid, text, integer) to authenticated;

create or replace function public.rt_set_pinned_ref_v2(
  p_project_id uuid,
  p_ref_id uuid
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

  if not exists (
    select 1
    from public.refs r
    where r.project_id = p_project_id
      and r.id = p_ref_id
  ) then
    raise exception 'Branch not found';
  end if;

  update public.projects
  set pinned_ref_id = p_ref_id
  where id = p_project_id;
end;
$$;

revoke all on function public.rt_set_pinned_ref_v2(uuid, uuid) from public;
grant execute on function public.rt_set_pinned_ref_v2(uuid, uuid) to authenticated;

create or replace function public.rt_clear_pinned_ref_v2(
  p_project_id uuid
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

  update public.projects
  set pinned_ref_id = null
  where id = p_project_id;
end;
$$;

revoke all on function public.rt_clear_pinned_ref_v2(uuid) from public;
grant execute on function public.rt_clear_pinned_ref_v2(uuid) to authenticated;

create or replace function public.rt_get_pinned_ref_v2(
  p_project_id uuid
)
returns table(ref_id uuid, ref_name text)
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
  select p.pinned_ref_id, r.name
  from public.projects p
  left join public.refs r on r.id = p.pinned_ref_id
  where p.id = p_project_id;
end;
$$;

revoke all on function public.rt_get_pinned_ref_v2(uuid) from public;
grant execute on function public.rt_get_pinned_ref_v2(uuid) to authenticated;

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
  order by (r.id = p.pinned_ref_id) desc, (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v2(uuid) from public;
grant execute on function public.rt_list_refs_v2(uuid) to authenticated;
