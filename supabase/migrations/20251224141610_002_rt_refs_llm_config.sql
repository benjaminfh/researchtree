-- Store provider/model config on refs (branch lock).

drop function if exists public.rt_create_project(text, text, uuid);
drop function if exists public.rt_create_ref_from_ref_v1(uuid, text, text, integer);
drop function if exists public.rt_create_ref_from_node_parent_v1(uuid, text, text, uuid, integer);

alter table public.refs
  add column if not exists provider text;

alter table public.refs
  add column if not exists model text;

create or replace function public.rt_create_project(
  p_name text,
  p_description text default null,
  p_project_id uuid default null,
  p_provider text default null,
  p_model text default null
)
returns uuid
language plpgsql
as $$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_project_id := coalesce(p_project_id, gen_random_uuid());

  insert into public.projects (id, owner_user_id, name, description)
  values (v_project_id, auth.uid(), p_name, p_description)
  on conflict (id) do nothing;

  insert into public.project_members (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'owner')
  on conflict do nothing;

  insert into public.refs (project_id, name, tip_commit_id, provider, model)
  values (
    v_project_id,
    'main',
    null,
    nullif(btrim(p_provider), ''),
    nullif(btrim(p_model), '')
  )
  on conflict do nothing;

  return v_project_id;
end;
$$;

grant execute on function public.rt_create_project(text, text, uuid, text, text) to authenticated;

create or replace function public.rt_create_ref_from_ref_v1(
  p_project_id uuid,
  p_from_ref_name text,
  p_new_ref_name text,
  p_provider text default null,
  p_model text default null,
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
  v_provider text;
  v_model text;
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

  -- Snapshot the source tip and config.
  select r.tip_commit_id, r.provider, r.model
    into v_tip, v_provider, v_model
  from public.refs r
  where r.project_id = p_project_id and r.name = btrim(p_from_ref_name)
  for share;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = btrim(p_from_ref_name);

  insert into public.refs (project_id, name, tip_commit_id, provider, model)
  values (
    p_project_id,
    btrim(p_new_ref_name),
    v_tip,
    coalesce(nullif(btrim(p_provider), ''), v_provider),
    coalesce(nullif(btrim(p_model), ''), v_model)
  );

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

revoke all on function public.rt_create_ref_from_ref_v1(uuid, text, text, text, text, integer) from public;
grant execute on function public.rt_create_ref_from_ref_v1(uuid, text, text, text, text, integer) to authenticated;

create or replace function public.rt_create_ref_from_node_parent_v1(
  p_project_id uuid,
  p_source_ref_name text,
  p_new_ref_name text,
  p_node_id uuid,
  p_provider text default null,
  p_model text default null,
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
  v_provider text;
  v_model text;
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

  select r.provider, r.model
    into v_provider, v_model
  from public.refs r
  where r.project_id = p_project_id and r.name = p_source_ref_name;

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

  insert into public.refs (project_id, name, tip_commit_id, provider, model)
  values (
    p_project_id,
    p_new_ref_name,
    v_base_commit_id,
    coalesce(nullif(btrim(p_provider), ''), v_provider),
    coalesce(nullif(btrim(p_model), ''), v_model)
  )
  on conflict (project_id, name)
  do update set
    tip_commit_id = excluded.tip_commit_id,
    provider = coalesce(public.refs.provider, excluded.provider),
    model = coalesce(public.refs.model, excluded.model),
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

revoke all on function public.rt_create_ref_from_node_parent_v1(uuid, text, text, uuid, text, text, integer) from public;
grant execute on function public.rt_create_ref_from_node_parent_v1(uuid, text, text, uuid, text, text, integer) to authenticated;

drop function if exists public.rt_list_refs_v1(uuid);

create or replace function public.rt_list_refs_v1(
  p_project_id uuid
)
returns table (
  name text,
  head_commit text,
  node_count bigint,
  is_trunk boolean,
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
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk,
    r.provider,
    r.model
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
