create or replace function public.rt_create_ref_from_node_v2(
  p_project_id uuid,
  p_source_ref_id uuid,
  p_new_ref_name text,
  p_node_id uuid,
  p_provider text default null,
  p_model text default null,
  p_previous_response_id text default null,
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
  v_provider text;
  v_model text;
  v_new_ref_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.provider, r.model
    into v_provider, v_model
  from public.refs r
  where r.project_id = p_project_id and r.id = p_source_ref_id;

  if not found then
    raise exception 'Source ref not found';
  end if;

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
    and co.ref_id = p_source_ref_id
    and co.commit_id = v_node_commit_id;

  if not found then
    raise exception 'Node is not on source ref in Postgres';
  end if;

  insert into public.refs (project_id, name, tip_commit_id, provider, model, previous_response_id)
  values (
    p_project_id,
    p_new_ref_name,
    v_node_commit_id,
    coalesce(nullif(btrim(p_provider), ''), v_provider),
    coalesce(nullif(btrim(p_model), ''), v_model),
    nullif(btrim(p_previous_response_id), '')
  )
  on conflict (project_id, name)
  do update set
    tip_commit_id = excluded.tip_commit_id,
    provider = coalesce(public.refs.provider, excluded.provider),
    model = coalesce(public.refs.model, excluded.model),
    previous_response_id = excluded.previous_response_id,
    updated_at = now()
  returning id into v_new_ref_id;

  delete from public.commit_order co
  where co.project_id = p_project_id and co.ref_id = v_new_ref_id;

  if v_node_ordinal >= 0 then
    insert into public.commit_order (project_id, ref_id, ordinal, commit_id)
    select co.project_id, v_new_ref_id, co.ordinal, co.commit_id
    from public.commit_order co
    where co.project_id = p_project_id
      and co.ref_id = p_source_ref_id
      and co.ordinal <= v_node_ordinal
    order by co.ordinal asc;
  end if;

  return query select v_node_commit_id, v_node_ordinal;
end;
$$;

revoke all on function public.rt_create_ref_from_node_v2(uuid, uuid, text, uuid, text, text, text, integer) from public;
grant execute on function public.rt_create_ref_from_node_v2(uuid, uuid, text, uuid, text, text, text, integer) to authenticated;
