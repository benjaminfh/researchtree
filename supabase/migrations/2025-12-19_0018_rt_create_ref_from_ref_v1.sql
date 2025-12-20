-- RPC: create a new ref from an existing ref's current tip, copying commit_order prefix.

create or replace function public.rt_create_ref_from_ref_v1(
  p_project_id uuid,
  p_from_ref_name text,
  p_new_ref_name text,
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
  v_tip uuid;
  v_last_ordinal bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_new_ref_name is null or btrim(p_new_ref_name) = '' then
    raise exception 'new ref name is required';
  end if;
  if p_from_ref_name is null or btrim(p_from_ref_name) = '' then
    raise exception 'from ref name is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  -- Ensure source exists.
  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, btrim(p_from_ref_name), null)
  on conflict do nothing;

  -- Fail if destination already exists.
  if exists (
    select 1 from public.refs r
    where r.project_id = p_project_id and r.name = btrim(p_new_ref_name)
  ) then
    raise exception 'Ref already exists';
  end if;

  -- Snapshot the source tip.
  select r.tip_commit_id
    into v_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = btrim(p_from_ref_name)
  for share;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = btrim(p_from_ref_name);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, btrim(p_new_ref_name), v_tip);

  -- Copy commit ordering prefix so "node index" semantics match the source ref.
  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  select co.project_id, btrim(p_new_ref_name), co.ordinal, co.commit_id
  from public.commit_order co
  where co.project_id = p_project_id
    and co.ref_name = btrim(p_from_ref_name)
  order by co.ordinal asc;

  return query select v_tip, v_last_ordinal;
end;
$$;

revoke all on function public.rt_create_ref_from_ref_v1(uuid, text, text, integer) from public;
grant execute on function public.rt_create_ref_from_ref_v1(uuid, text, text, integer) to authenticated;

