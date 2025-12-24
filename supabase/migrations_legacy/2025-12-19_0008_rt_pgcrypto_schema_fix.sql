-- Supabase installs pgcrypto in the `extensions` schema; SECURITY DEFINER functions often set search_path=public.
-- Use schema-qualified `extensions.digest(...)` to avoid lookup failures.

create or replace function public.rt_save_artefact_draft(
  p_project_id uuid,
  p_ref_name text,
  p_content text,
  p_lock_timeout_ms integer default 3000
)
returns table (
  content_hash text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  v_hash := encode(extensions.digest(convert_to(coalesce(p_content, ''), 'utf8'), 'sha256'::text), 'hex');

  insert into public.artefact_drafts (project_id, ref_name, user_id, content, content_hash, updated_at)
  values (p_project_id, p_ref_name, auth.uid(), coalesce(p_content, ''), v_hash, now())
  on conflict (project_id, ref_name, user_id)
  do update set
    content = excluded.content,
    content_hash = excluded.content_hash,
    updated_at = excluded.updated_at
  returning artefact_drafts.updated_at into v_updated;

  return query select v_hash, v_updated;
end;
$$;

create or replace function public.rt_update_artefact_on_ref(
  p_project_id uuid,
  p_ref_name text,
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
  v_artefact_id uuid;
  v_state_node_id uuid;
  v_last_ordinal bigint;
  v_next_ordinal bigint;
  v_content_hash text;
  v_state_json jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_ref_name, null)
  on conflict do nothing;

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

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_ref_name;

  return query select v_new_commit_id, v_artefact_id, v_state_node_id, v_next_ordinal, v_content_hash;
end;
$$;

