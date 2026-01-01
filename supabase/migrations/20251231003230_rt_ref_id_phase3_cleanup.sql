-- Phase 3: ref_id canonicalization + ref_name cleanup.

-- Drop legacy constraints/indexes tied to ref_name.
alter table public.commit_order
  drop constraint if exists commit_order_pkey;
alter table public.commit_order
  drop constraint if exists commit_order_project_id_ref_name_commit_id_key;
drop index if exists commit_order_pkey;
drop index if exists commit_order_project_id_ref_name_commit_id_key;

alter table public.artefact_drafts
  drop constraint if exists artefact_drafts_pkey;
drop index if exists artefact_drafts_pkey;
drop index if exists artefact_drafts_project_ref_updated_idx;

-- Drop legacy ref_name columns.
alter table public.commit_order
  drop column if exists ref_name;
alter table public.artefact_drafts
  drop column if exists ref_name;
alter table public.project_user_prefs
  drop column if exists current_ref_name;

-- Promote refs.id as primary key and preserve name uniqueness per project.
alter table public.refs
  drop constraint if exists refs_pkey;
alter table public.refs
  add constraint refs_pkey primary key (id);
create unique index if not exists refs_project_id_name_key
  on public.refs (project_id, name);
drop index if exists refs_project_id_id_key;

-- Add pinned ref to projects.
alter table public.projects
  add column if not exists pinned_ref_id uuid;
alter table public.projects
  add constraint projects_pinned_ref_id_fkey
  foreign key (pinned_ref_id)
  references public.refs (id)
  on delete set null;
create index if not exists projects_pinned_ref_id_idx
  on public.projects (pinned_ref_id);

-- Defensive backfill + guard before enforcing NOT NULL on artefacts.ref_id.
with ranked as (
  select
    co.project_id,
    co.commit_id,
    co.ref_id,
    row_number() over (
      partition by co.project_id, co.commit_id
      order by co.ordinal desc, co.ref_id
    ) as rn
  from public.commit_order co
)
update public.artefacts a
set ref_id = ranked.ref_id
from ranked
where a.project_id = ranked.project_id
  and a.commit_id = ranked.commit_id
  and ranked.rn = 1
  and a.ref_id is null;

do $$
begin
  if exists (select 1 from public.artefacts where ref_id is null) then
    raise exception 'Phase 3 blocked: artefacts.ref_id still null';
  end if;
end $$;

-- Enforce ref_id presence.
alter table public.commit_order
  alter column ref_id set not null;
alter table public.artefact_drafts
  alter column ref_id set not null;
alter table public.artefacts
  alter column ref_id set not null;

-- Recreate constraints/indexes on ref_id.
create unique index if not exists commit_order_pkey
  on public.commit_order (project_id, ref_id, ordinal);
alter table public.commit_order
  add constraint commit_order_pkey primary key using index commit_order_pkey;

create unique index if not exists commit_order_project_id_ref_id_commit_id_key
  on public.commit_order (project_id, ref_id, commit_id);
alter table public.commit_order
  add constraint commit_order_project_id_ref_id_commit_id_key
  unique using index commit_order_project_id_ref_id_commit_id_key;

create unique index if not exists artefact_drafts_pkey
  on public.artefact_drafts (project_id, ref_id, user_id);
alter table public.artefact_drafts
  add constraint artefact_drafts_pkey primary key using index artefact_drafts_pkey;

-- Foreign keys to refs.id.
alter table public.commit_order
  add constraint commit_order_ref_id_fkey
  foreign key (ref_id) references public.refs (id) on delete cascade;
alter table public.artefact_drafts
  add constraint artefact_drafts_ref_id_fkey
  foreign key (ref_id) references public.refs (id) on delete cascade;
alter table public.project_user_prefs
  add constraint project_user_prefs_current_ref_id_fkey
  foreign key (current_ref_id) references public.refs (id) on delete set null;
alter table public.artefacts
  add constraint artefacts_ref_id_fkey
  foreign key (ref_id) references public.refs (id) on delete cascade;

-- Update v2 RPCs to remove ref_name usage.
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
    insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
    values (v_state_node_id, p_project_id, v_new_commit_id, 'state', 'system', v_state_json);
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

create or replace function public.rt_save_artefact_draft_v2(
  p_project_id uuid,
  p_ref_id uuid,
  p_content text,
  p_lock_timeout_ms integer default 3000
)
returns table(content_hash text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $function$
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

  insert into public.artefact_drafts (project_id, ref_id, user_id, content, content_hash, updated_at)
  values (p_project_id, p_ref_id, auth.uid(), coalesce(p_content, ''), v_hash, now())
  on conflict (project_id, ref_id, user_id)
  do update set
    content = excluded.content,
    content_hash = excluded.content_hash,
    updated_at = excluded.updated_at
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

  insert into public.nodes (id, project_id, commit_id, kind, role, content_json)
  values (v_node_id, p_project_id, v_new_commit_id, 'merge', 'system', v_node_json);

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

  insert into public.commit_order (project_id, ref_id, ordinal, commit_id)
  select co.project_id, v_new_ref_id, co.ordinal, co.commit_id
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
  where co.project_id = p_project_id and co.ref_id = v_new_ref_id;

  if v_base_ordinal >= 0 then
    insert into public.commit_order (project_id, ref_id, ordinal, commit_id)
    select co.project_id, v_new_ref_id, co.ordinal, co.commit_id
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

create or replace function public.rt_get_current_ref_v2(
  p_project_id uuid,
  p_default_ref_name text default 'main'::text
)
returns table(ref_id uuid, ref_name text)
language plpgsql
security definer
set search_path = public
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

  select pup.current_ref_id
    into v_ref_id
  from public.project_user_prefs pup
  where pup.project_id = p_project_id and pup.user_id = auth.uid();

  if v_ref_id is not null then
    select r.name into v_ref_name
    from public.refs r
    where r.project_id = p_project_id and r.id = v_ref_id;
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
set search_path = public
as $function$
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

  if not exists (
    select 1
    from public.refs r
    where r.project_id = p_project_id and r.id = p_ref_id
  ) then
    raise exception 'Ref not found';
  end if;

  insert into public.project_user_prefs (project_id, user_id, current_ref_id, updated_at)
  values (p_project_id, auth.uid(), p_ref_id, now())
  on conflict (project_id, user_id)
  do update set
    current_ref_id = excluded.current_ref_id,
    updated_at = excluded.updated_at;
end;
$function$;

revoke all on function public.rt_set_current_ref_v2(uuid, uuid, integer) from public;
grant execute on function public.rt_set_current_ref_v2(uuid, uuid, integer) to authenticated;
