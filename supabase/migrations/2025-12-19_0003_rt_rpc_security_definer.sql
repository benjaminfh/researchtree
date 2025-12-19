-- Harden RPC functions: run as SECURITY DEFINER (RPC-only writes),
-- but enforce auth + ownership/membership checks inside the function bodies.

create or replace function public.rt_create_project(
  p_name text,
  p_description text default null,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_existing_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_project_id := coalesce(p_project_id, gen_random_uuid());

  select p.owner_user_id
    into v_existing_owner
  from public.projects p
  where p.id = v_project_id;

  if found and v_existing_owner is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  if not found then
    insert into public.projects (id, owner_user_id, name, description)
    values (v_project_id, auth.uid(), p_name, p_description);
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'owner')
  on conflict do nothing;

  insert into public.refs (project_id, name, tip_commit_id)
  values (v_project_id, 'main', null)
  on conflict do nothing;

  return v_project_id;
end;
$$;

create or replace function public.rt_append_node_to_ref(
  p_project_id uuid,
  p_ref_name text,
  p_kind text,
  p_role text,
  p_content_json jsonb,
  p_commit_message text default null,
  p_node_id uuid default null,
  p_lock_timeout_ms integer default 3000
)
returns table (
  new_commit_id uuid,
  node_id uuid,
  ordinal bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_tip uuid;
  v_new_commit_id uuid;
  v_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  -- Fail fast on concurrent writers for the same ref (UI shows spinner then error).
  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id
    into v_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_ref_name
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_ref_name;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_old_tip, null, coalesce(p_commit_message, p_kind), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_node_id, gen_random_uuid());
  v_content_json := jsonb_set(coalesce(p_content_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, p_kind, p_role, v_content_json);

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_ref_name;

  return query select v_new_commit_id, v_node_id, v_next_ordinal;
end;
$$;

revoke all on function public.rt_create_project(text, text, uuid) from public;
revoke all on function public.rt_append_node_to_ref(uuid, text, text, text, jsonb, text, uuid, integer) from public;

grant execute on function public.rt_create_project(text, text, uuid) to authenticated;
grant execute on function public.rt_append_node_to_ref(uuid, text, text, text, jsonb, text, uuid, integer) to authenticated;

