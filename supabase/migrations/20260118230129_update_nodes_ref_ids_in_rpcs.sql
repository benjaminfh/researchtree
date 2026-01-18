-- Populate node ref-id columns in write RPCs.

create or replace function public.rt_append_node_to_ref_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_kind text,
  p_role text,
  p_content_json jsonb,
  p_node_id uuid default null,
  p_commit_message text default null,
  p_attach_draft boolean default false,
  p_artefact_kind text default 'canvas_md',
  p_lock_timeout_ms integer default 3000,
  p_raw_response jsonb default null
)
returns table (
  new_commit_id uuid,
  node_id uuid,
  ordinal bigint,
  artefact_id uuid,
  artefact_content_hash text
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
  v_draft_content text;
  v_draft_hash text;
  v_latest_hash text;
  v_artefact_id uuid;
  v_artefact_hash text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id
    into v_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.id = p_ref_id
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_id = p_ref_id;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_old_tip, null, coalesce(p_commit_message, p_kind), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_node_id, gen_random_uuid());
  v_content_json := jsonb_set(coalesce(p_content_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);
  v_content_json := jsonb_set(v_content_json, '{createdOnRefId}', to_jsonb(p_ref_id::text), true);

  insert into public.nodes (
    id,
    project_id,
    commit_id,
    kind,
    role,
    content_json,
    raw_response,
    created_on_ref_id,
    merge_from_ref_id
  )
  values (
    v_node_id,
    p_project_id,
    v_new_commit_id,
    p_kind,
    coalesce(p_role, 'system'),
    v_content_json,
    p_raw_response,
    p_ref_id,
    null
  );

  if p_attach_draft then
    select d.content, d.content_hash
      into v_draft_content, v_draft_hash
    from public.artefact_drafts d
    where d.project_id = p_project_id
      and d.ref_id = p_ref_id
      and d.user_id = auth.uid();

    if found then
      select a.content_hash
        into v_latest_hash
      from public.artefacts a
      join public.commit_order co
        on co.project_id = a.project_id
       and co.commit_id = a.commit_id
      where a.project_id = p_project_id
        and co.ref_id = p_ref_id
        and a.kind = p_artefact_kind
      order by co.ordinal desc
      limit 1;

      if v_latest_hash is distinct from v_draft_hash then
        insert into public.artefacts (project_id, commit_id, kind, content, content_hash, ref_id)
        values (p_project_id, v_new_commit_id, p_artefact_kind, coalesce(v_draft_content, ''), v_draft_hash, p_ref_id)
        returning id, content_hash into v_artefact_id, v_artefact_hash;
      end if;
    end if;
  end if;

  insert into public.commit_order (project_id, ref_id, ordinal, commit_id)
  values (p_project_id, p_ref_id, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and id = p_ref_id;

  return query
  select v_new_commit_id, v_node_id, v_next_ordinal, v_artefact_id, v_artefact_hash;
end;
$$;

revoke all on function public.rt_append_node_to_ref_v2(uuid, uuid, text, text, jsonb, uuid, text, boolean, text, integer, jsonb) from public;
grant execute on function public.rt_append_node_to_ref_v2(uuid, uuid, text, text, jsonb, uuid, text, boolean, text, integer, jsonb) to authenticated;

create or replace function public.rt_update_artefact_on_ref_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_content text,
  p_kind text default 'canvas_md',
  p_state_node_id uuid default null,
  p_state_node_json jsonb default null,
  p_commit_message text default null,
  p_lock_timeout_ms integer default 3000
)
returns table (
  new_commit_id uuid,
  artefact_id uuid,
  state_node_id uuid,
  ordinal bigint,
  content_hash text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_tip uuid;
  v_new_commit_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_hash text;
  v_state_node_id uuid;
  v_state_json jsonb;
  v_artefact_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id
    into v_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.id = p_ref_id
  for update;

  if not found then
    raise exception 'Ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_id = p_ref_id;

  v_next_ordinal := v_last_ordinal + 1;
  v_content_hash := encode(extensions.digest(convert_to(coalesce(p_content, ''), 'utf8'), 'sha256'::text), 'hex');

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_old_tip, null, coalesce(p_commit_message, 'artefact'), auth.uid())
  returning id into v_new_commit_id;

  insert into public.artefacts (project_id, commit_id, kind, content, content_hash, ref_id)
  values (p_project_id, v_new_commit_id, p_kind, coalesce(p_content, ''), v_content_hash, p_ref_id)
  returning id into v_artefact_id;

  if p_state_node_json is not null then
    v_state_node_id := coalesce(p_state_node_id, gen_random_uuid());
    v_state_json := jsonb_set(coalesce(p_state_node_json, '{}'::jsonb), '{id}', to_jsonb(v_state_node_id::text), true);
    v_state_json := jsonb_set(v_state_json, '{createdOnRefId}', to_jsonb(p_ref_id::text), true);
    insert into public.nodes (
      id,
      project_id,
      commit_id,
      kind,
      role,
      content_json,
      created_on_ref_id,
      merge_from_ref_id
    )
    values (
      v_state_node_id,
      p_project_id,
      v_new_commit_id,
      'state',
      'system',
      v_state_json,
      p_ref_id,
      null
    );
  end if;

  insert into public.commit_order (project_id, ref_id, ordinal, commit_id)
  values (p_project_id, p_ref_id, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and id = p_ref_id;

  return query select v_new_commit_id, v_artefact_id, v_state_node_id, v_next_ordinal, v_content_hash;
end;
$$;

revoke all on function public.rt_update_artefact_on_ref_v2(uuid, uuid, text, text, uuid, jsonb, text, integer) from public;
grant execute on function public.rt_update_artefact_on_ref_v2(uuid, uuid, text, text, uuid, jsonb, text, integer) to authenticated;

create or replace function public.rt_merge_ours_v2(
  p_project_id uuid,
  p_target_ref_id uuid,
  p_source_ref_id uuid,
  p_merge_node_json jsonb,
  p_merge_node_id uuid default null,
  p_commit_message text default null,
  p_lock_timeout_ms integer default 3000
)
returns table(new_commit_id uuid, node_id uuid, ordinal bigint)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_target_old_tip uuid;
  v_source_tip uuid;
  v_new_commit_id uuid;
  v_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_node_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id
    into v_target_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.id = p_target_ref_id
  for update;

  if not found then
    raise exception 'Target ref not found';
  end if;

  select r.tip_commit_id
    into v_source_tip
  from public.refs r
  where r.project_id = p_project_id and r.id = p_source_ref_id;

  if not found then
    raise exception 'Source ref not found';
  end if;

  if v_source_tip is null then
    raise exception 'Source ref tip not available';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_id = p_target_ref_id;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_target_old_tip, v_source_tip, coalesce(p_commit_message, 'merge'), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_merge_node_id, gen_random_uuid());
  v_node_json := jsonb_set(coalesce(p_merge_node_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);
  v_node_json := jsonb_set(v_node_json, '{createdOnRefId}', to_jsonb(p_target_ref_id::text), true);
  v_node_json := jsonb_set(v_node_json, '{mergeFromRefId}', to_jsonb(p_source_ref_id::text), true);

  insert into public.nodes (
    id,
    project_id,
    commit_id,
    kind,
    role,
    content_json,
    created_on_ref_id,
    merge_from_ref_id
  )
  values (
    v_node_id,
    p_project_id,
    v_new_commit_id,
    'merge',
    'system',
    v_node_json,
    p_target_ref_id,
    p_source_ref_id
  );

  insert into public.commit_order (project_id, ref_id, ordinal, commit_id)
  values (p_project_id, p_target_ref_id, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and id = p_target_ref_id;

  return query select v_new_commit_id, v_node_id, v_next_ordinal;
end;
$function$;

revoke all on function public.rt_merge_ours_v2(uuid, uuid, uuid, jsonb, uuid, text, integer) from public;
grant execute on function public.rt_merge_ours_v2(uuid, uuid, uuid, jsonb, uuid, text, integer) to authenticated;
