-- Phase 2: ref_id-based RPCs (v2).

create or replace function public.rt_get_history_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_limit integer default 200,
  p_before_ordinal bigint default null,
  p_include_raw_response boolean default false
)
returns table(ordinal bigint, node_json jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select t.ordinal, t.node_json
  from (
    select
      co.ordinal,
      case
        when p_include_raw_response then n.content_json
        else ((coalesce(n.content_json, '{}'::jsonb) - 'rawResponse') #- '{thinking,raw}')
      end as node_json
    from public.commit_order co
    join public.nodes n
      on n.project_id = co.project_id
     and n.commit_id = co.commit_id
    where co.project_id = p_project_id
      and co.ref_id = p_ref_id
      and (p_before_ordinal is null or co.ordinal < p_before_ordinal)
    order by co.ordinal desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) t
  order by t.ordinal asc;
end;
$function$;

revoke all on function public.rt_get_history_v2(uuid, uuid, integer, bigint, boolean) from public;
grant execute on function public.rt_get_history_v2(uuid, uuid, integer, bigint, boolean) to authenticated;

create or replace function public.rt_get_canvas_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_kind text default 'canvas_md'::text
)
returns table(content text, content_hash text, updated_at timestamp with time zone, source text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_content text;
  v_hash text;
  v_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select d.content, d.content_hash, d.updated_at
    into v_content, v_hash, v_updated
  from public.artefact_drafts d
  where d.project_id = p_project_id
    and d.ref_id = p_ref_id
    and d.user_id = auth.uid();

  if found then
    return query select v_content, v_hash, v_updated, 'draft'::text;
    return;
  end if;

  select a.content, a.content_hash, a.created_at
    into v_content, v_hash, v_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_id = p_ref_id
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  if found then
    return query select v_content, v_hash, v_updated, 'artefact'::text;
    return;
  end if;

  return query select ''::text, ''::text, null::timestamptz, 'empty'::text;
end;
$function$;

revoke all on function public.rt_get_canvas_v2(uuid, uuid, text) from public;
grant execute on function public.rt_get_canvas_v2(uuid, uuid, text) to authenticated;

create or replace function public.rt_get_canvas_hashes_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_kind text default 'canvas_md'::text
)
returns table(
  draft_hash text,
  artefact_hash text,
  draft_updated_at timestamptz,
  artefact_updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_draft_hash text;
  v_artefact_hash text;
  v_draft_updated timestamptz;
  v_artefact_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select d.content_hash, d.updated_at
    into v_draft_hash, v_draft_updated
  from public.artefact_drafts d
  where d.project_id = p_project_id
    and d.ref_id = p_ref_id
    and d.user_id = auth.uid();

  select a.content_hash, a.created_at
    into v_artefact_hash, v_artefact_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_id = p_ref_id
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  return query select v_draft_hash, v_artefact_hash, v_draft_updated, v_artefact_updated;
end;
$function$;

revoke all on function public.rt_get_canvas_hashes_v2(uuid, uuid, text) from public;
grant execute on function public.rt_get_canvas_hashes_v2(uuid, uuid, text) to authenticated;

create or replace function public.rt_get_canvas_pair_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_kind text default 'canvas_md'::text
)
returns table(
  draft_content text,
  draft_hash text,
  artefact_content text,
  artefact_hash text,
  draft_updated_at timestamptz,
  artefact_updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_draft_content text;
  v_draft_hash text;
  v_artefact_content text;
  v_artefact_hash text;
  v_draft_updated timestamptz;
  v_artefact_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select d.content, d.content_hash, d.updated_at
    into v_draft_content, v_draft_hash, v_draft_updated
  from public.artefact_drafts d
  where d.project_id = p_project_id
    and d.ref_id = p_ref_id
    and d.user_id = auth.uid();

  select a.content, a.content_hash, a.created_at
    into v_artefact_content, v_artefact_hash, v_artefact_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_id = p_ref_id
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  return query select v_draft_content, v_draft_hash, v_artefact_content, v_artefact_hash, v_draft_updated, v_artefact_updated;
end;
$function$;

revoke all on function public.rt_get_canvas_pair_v2(uuid, uuid, text) from public;
grant execute on function public.rt_get_canvas_pair_v2(uuid, uuid, text) to authenticated;

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
  v_ref_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id, r.name
    into v_old_tip, v_ref_name
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

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json, raw_response)
  values (v_node_id, p_project_id, v_new_commit_id, p_kind, coalesce(p_role, 'system'), v_content_json, p_raw_response);

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
        insert into public.artefacts (project_id, commit_id, kind, content, content_hash)
        values (p_project_id, v_new_commit_id, p_artefact_kind, coalesce(v_draft_content, ''), v_draft_hash)
        returning id, content_hash into v_artefact_id, v_artefact_hash;
      end if;
    end if;
  end if;

  insert into public.commit_order (project_id, ref_name, ref_id, ordinal, commit_id)
  values (p_project_id, v_ref_name, p_ref_id, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and id = p_ref_id;

  return query select v_new_commit_id, v_node_id, v_next_ordinal, v_artefact_id, v_artefact_hash;
end;
$$;

revoke all on function public.rt_append_node_to_ref_v2(uuid, uuid, text, text, jsonb, uuid, text, boolean, text, integer, jsonb) from public;
grant execute on function public.rt_append_node_to_ref_v2(uuid, uuid, text, text, jsonb, uuid, text, boolean, text, integer, jsonb) to authenticated;

create or replace function public.rt_update_artefact_on_ref_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_content text,
  p_kind text default 'canvas_md'::text,
  p_state_node_id uuid default null,
  p_state_node_json jsonb default null,
  p_commit_message text default null,
  p_lock_timeout_ms integer default 3000
)
returns table(new_commit_id uuid, artefact_id uuid, state_node_id uuid, ordinal bigint, content_hash text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_tip uuid;
  v_new_commit_id uuid;
  v_artefact_id uuid;
  v_state_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_hash text;
  v_state_json jsonb;
  v_ref_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id, r.name
    into v_old_tip, v_ref_name
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

  insert into public.artefacts (project_id, commit_id, kind, content, content_hash)
  values (p_project_id, v_new_commit_id, p_kind, coalesce(p_content, ''), v_content_hash)
  returning id into v_artefact_id;

  if p_state_node_json is not null then
    v_state_node_id := coalesce(p_state_node_id, gen_random_uuid());
    v_state_json := jsonb_set(coalesce(p_state_node_json, '{}'::jsonb), '{id}', to_jsonb(v_state_node_id::text), true);
    insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
    values (v_state_node_id, p_project_id, v_new_commit_id, 'state', 'system', v_state_json);
  end if;

  insert into public.commit_order (project_id, ref_name, ref_id, ordinal, commit_id)
  values (p_project_id, v_ref_name, p_ref_id, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and id = p_ref_id;

  return query select v_new_commit_id, v_artefact_id, v_state_node_id, v_next_ordinal, v_content_hash;
end;
$function$;

revoke all on function public.rt_update_artefact_on_ref_v2(uuid, uuid, text, text, uuid, jsonb, text, integer) from public;
grant execute on function public.rt_update_artefact_on_ref_v2(uuid, uuid, text, text, uuid, jsonb, text, integer) to authenticated;

create or replace function public.rt_save_artefact_draft_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_content text,
  p_lock_timeout_ms integer default 3000
)
returns table(content_hash text, updated_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hash text;
  v_updated timestamptz;
  v_ref_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_ref_id is null then
    raise exception 'ref id is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.name
    into v_ref_name
  from public.refs r
  where r.project_id = p_project_id and r.id = p_ref_id;

  if not found then
    raise exception 'Ref not found';
  end if;

  v_hash := encode(extensions.digest(convert_to(coalesce(p_content, ''), 'utf8'), 'sha256'::text), 'hex');

  insert into public.artefact_drafts (project_id, ref_name, ref_id, user_id, content, content_hash, updated_at)
  values (p_project_id, v_ref_name, p_ref_id, auth.uid(), coalesce(p_content, ''), v_hash, now())
  on conflict (project_id, ref_name, user_id)
  do update set
    content = excluded.content,
    content_hash = excluded.content_hash,
    updated_at = excluded.updated_at,
    ref_id = excluded.ref_id
  returning artefact_drafts.updated_at into v_updated;

  return query select v_hash, v_updated;
end;
$function$;

revoke all on function public.rt_save_artefact_draft_v2(uuid, uuid, text, integer) from public;
grant execute on function public.rt_save_artefact_draft_v2(uuid, uuid, text, integer) to authenticated;

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
set search_path to 'public'
as $function$
declare
  v_target_old_tip uuid;
  v_source_tip uuid;
  v_new_commit_id uuid;
  v_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_node_json jsonb;
  v_target_name text;
  v_source_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.tip_commit_id, r.name
    into v_target_old_tip, v_target_name
  from public.refs r
  where r.project_id = p_project_id and r.id = p_target_ref_id
  for update;

  if not found then
    raise exception 'Target ref not found';
  end if;

  select r.tip_commit_id, r.name
    into v_source_tip, v_source_name
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

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, 'merge', 'system', v_node_json);

  insert into public.commit_order (project_id, ref_name, ref_id, ordinal, commit_id)
  values (p_project_id, v_target_name, p_target_ref_id, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and id = p_target_ref_id;

  return query select v_new_commit_id, v_node_id, v_next_ordinal;
end;
$function$;

revoke all on function public.rt_merge_ours_v2(uuid, uuid, uuid, jsonb, uuid, text, integer) from public;
grant execute on function public.rt_merge_ours_v2(uuid, uuid, uuid, jsonb, uuid, text, integer) to authenticated;

create or replace function public.rt_create_ref_from_ref_v2(
  p_project_id uuid,
  p_from_ref_id uuid,
  p_new_ref_name text,
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
  v_tip uuid;
  v_last_ordinal bigint;
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

  if p_new_ref_name is null or btrim(p_new_ref_name) = '' then
    raise exception 'new ref name is required';
  end if;
  if p_from_ref_id is null then
    raise exception 'from ref id is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  if exists (
    select 1 from public.refs r
    where r.project_id = p_project_id and r.name = btrim(p_new_ref_name)
  ) then
    raise exception 'Ref already exists';
  end if;

  select r.tip_commit_id, r.provider, r.model
    into v_tip, v_provider, v_model
  from public.refs r
  where r.project_id = p_project_id and r.id = p_from_ref_id
  for share;

  if not found then
    raise exception 'Source ref not found';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_id = p_from_ref_id;

  insert into public.refs (project_id, name, tip_commit_id, provider, model, previous_response_id)
  values (
    p_project_id,
    btrim(p_new_ref_name),
    v_tip,
    coalesce(nullif(btrim(p_provider), ''), v_provider),
    coalesce(nullif(btrim(p_model), ''), v_model),
    nullif(btrim(p_previous_response_id), '')
  )
  returning id into v_new_ref_id;

  insert into public.commit_order (project_id, ref_name, ref_id, ordinal, commit_id)
  select co.project_id, btrim(p_new_ref_name), v_new_ref_id, co.ordinal, co.commit_id
  from public.commit_order co
  where co.project_id = p_project_id
    and co.ref_id = p_from_ref_id
  order by co.ordinal asc;

  return query select v_tip, v_last_ordinal;
end;
$$;

revoke all on function public.rt_create_ref_from_ref_v2(uuid, uuid, text, text, text, text, integer) from public;
grant execute on function public.rt_create_ref_from_ref_v2(uuid, uuid, text, text, text, text, integer) to authenticated;

create or replace function public.rt_create_ref_from_node_parent_v2(
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
  v_base_commit_id uuid;
  v_base_ordinal bigint;
  v_provider text;
  v_model text;
  v_new_ref_id uuid;
  v_source_ref_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.provider, r.model, r.name
    into v_provider, v_model, v_source_ref_name
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

  select c.parent1_commit_id
    into v_base_commit_id
  from public.commits c
  where c.id = v_node_commit_id;

  v_base_ordinal := v_node_ordinal - 1;

  insert into public.refs (project_id, name, tip_commit_id, provider, model, previous_response_id)
  values (
    p_project_id,
    p_new_ref_name,
    v_base_commit_id,
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
  where co.project_id = p_project_id and co.ref_name = p_new_ref_name;

  if v_base_ordinal >= 0 then
    insert into public.commit_order (project_id, ref_name, ref_id, ordinal, commit_id)
    select co.project_id, p_new_ref_name, v_new_ref_id, co.ordinal, co.commit_id
    from public.commit_order co
    where co.project_id = p_project_id
      and co.ref_id = p_source_ref_id
      and co.ordinal <= v_base_ordinal
    order by co.ordinal asc;
  end if;

  return query select v_base_commit_id, v_base_ordinal;
end;
$$;

revoke all on function public.rt_create_ref_from_node_parent_v2(uuid, uuid, text, uuid, text, text, text, integer) from public;
grant execute on function public.rt_create_ref_from_node_parent_v2(uuid, uuid, text, uuid, text, text, text, integer) to authenticated;

create or replace function public.rt_list_refs_v2(
  p_project_id uuid
)
returns table (
  id uuid,
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
    r.id,
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk,
    r.provider,
    r.model
  from public.refs r
  left join (
    select co.ref_id, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_id
  ) mx on mx.ref_id = r.id
  where r.project_id = p_project_id
  order by (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v2(uuid) from public;
grant execute on function public.rt_list_refs_v2(uuid) to authenticated;

create or replace function public.rt_get_current_ref_v2(
  p_project_id uuid,
  p_default_ref_name text default 'main'::text
)
returns table(ref_id uuid, ref_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref_id uuid;
  v_ref_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select pup.current_ref_id, pup.current_ref_name
    into v_ref_id, v_ref_name
  from public.project_user_prefs pup
  where pup.project_id = p_project_id and pup.user_id = auth.uid();

  if v_ref_id is not null then
    if v_ref_name is null then
      select r.name into v_ref_name
      from public.refs r
      where r.project_id = p_project_id and r.id = v_ref_id;
    end if;
    return query select v_ref_id, v_ref_name;
    return;
  end if;

  if v_ref_name is not null then
    select r.id into v_ref_id
    from public.refs r
    where r.project_id = p_project_id and r.name = v_ref_name;
    return query select v_ref_id, v_ref_name;
    return;
  end if;

  v_ref_name := coalesce(p_default_ref_name, 'main');
  select r.id into v_ref_id
  from public.refs r
  where r.project_id = p_project_id and r.name = v_ref_name;

  return query select v_ref_id, v_ref_name;
end;
$function$;

revoke all on function public.rt_get_current_ref_v2(uuid, text) from public;
grant execute on function public.rt_get_current_ref_v2(uuid, text) to authenticated;

create or replace function public.rt_set_current_ref_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_lock_timeout_ms integer default 3000
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_ref_id is null then
    raise exception 'ref id is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  select r.name
    into v_ref_name
  from public.refs r
  where r.project_id = p_project_id and r.id = p_ref_id;

  if not found then
    raise exception 'Ref not found';
  end if;

  insert into public.project_user_prefs (project_id, user_id, current_ref_name, current_ref_id, updated_at)
  values (p_project_id, auth.uid(), v_ref_name, p_ref_id, now())
  on conflict (project_id, user_id)
  do update set
    current_ref_name = excluded.current_ref_name,
    current_ref_id = excluded.current_ref_id,
    updated_at = excluded.updated_at;
end;
$function$;

revoke all on function public.rt_set_current_ref_v2(uuid, uuid, integer) from public;
grant execute on function public.rt_set_current_ref_v2(uuid, uuid, integer) to authenticated;

create or replace function public.rt_get_ref_previous_response_id_v2(
  p_project_id uuid,
  p_ref_id uuid
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_previous text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select r.previous_response_id
    into v_previous
  from public.refs r
  where r.project_id = p_project_id and r.id = p_ref_id;

  return v_previous;
end;
$function$;

revoke all on function public.rt_get_ref_previous_response_id_v2(uuid, uuid) from public;
grant execute on function public.rt_get_ref_previous_response_id_v2(uuid, uuid) to authenticated;

create or replace function public.rt_set_ref_previous_response_id_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_previous_response_id text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  update public.refs
  set previous_response_id = nullif(btrim(p_previous_response_id), ''), updated_at = now()
  where project_id = p_project_id and id = p_ref_id;
end;
$function$;

revoke all on function public.rt_set_ref_previous_response_id_v2(uuid, uuid, text) from public;
grant execute on function public.rt_set_ref_previous_response_id_v2(uuid, uuid, text) to authenticated;
