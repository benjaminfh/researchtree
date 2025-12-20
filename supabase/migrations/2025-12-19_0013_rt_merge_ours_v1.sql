-- RPC: merge "ours" (keep target content), record merge node + DAG structure.

create or replace function public.rt_merge_ours_v1(
  p_project_id uuid,
  p_target_ref_name text,
  p_source_ref_name text,
  p_merge_node_json jsonb,
  p_merge_node_id uuid default null,
  p_commit_message text default null,
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

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_target_ref_name, null)
  on conflict do nothing;

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, p_source_ref_name, null)
  on conflict do nothing;

  -- Lock target ref so merge is serialized on that branch.
  select r.tip_commit_id
    into v_target_old_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_target_ref_name
  for update;

  if not found then
    raise exception 'Target ref not found';
  end if;

  select r.tip_commit_id
    into v_source_tip
  from public.refs r
  where r.project_id = p_project_id and r.name = p_source_ref_name;

  if v_source_tip is null then
    raise exception 'Source ref tip not available';
  end if;

  select coalesce(max(co.ordinal), -1)
    into v_last_ordinal
  from public.commit_order co
  where co.project_id = p_project_id and co.ref_name = p_target_ref_name;

  v_next_ordinal := v_last_ordinal + 1;

  insert into public.commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
  values (p_project_id, v_target_old_tip, v_source_tip, coalesce(p_commit_message, 'merge'), auth.uid())
  returning id into v_new_commit_id;

  v_node_id := coalesce(p_merge_node_id, gen_random_uuid());
  v_node_json := jsonb_set(coalesce(p_merge_node_json, '{}'::jsonb), '{id}', to_jsonb(v_node_id::text), true);

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, 'merge', 'system', v_node_json);

  insert into public.commit_order (project_id, ref_name, ordinal, commit_id)
  values (p_project_id, p_target_ref_name, v_next_ordinal, v_new_commit_id);

  update public.refs
  set tip_commit_id = v_new_commit_id, updated_at = now()
  where project_id = p_project_id and name = p_target_ref_name;

  return query select v_new_commit_id, v_node_id, v_next_ordinal;
end;
$$;

revoke all on function public.rt_merge_ours_v1(uuid, text, text, jsonb, uuid, text, integer) from public;
grant execute on function public.rt_merge_ours_v1(uuid, text, text, jsonb, uuid, text, integer) to authenticated;

