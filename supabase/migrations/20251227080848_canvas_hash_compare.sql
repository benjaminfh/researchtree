create or replace function public.rt_get_canvas_hashes_v1(
  p_project_id uuid,
  p_ref_name text,
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
    and d.ref_name = p_ref_name
    and d.user_id = auth.uid();

  select a.content_hash, a.created_at
    into v_artefact_hash, v_artefact_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_name = p_ref_name
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  return query select v_draft_hash, v_artefact_hash, v_draft_updated, v_artefact_updated;
end;
$function$
;

create or replace function public.rt_get_canvas_pair_v1(
  p_project_id uuid,
  p_ref_name text,
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
    and d.ref_name = p_ref_name
    and d.user_id = auth.uid();

  select a.content, a.content_hash, a.created_at
    into v_artefact_content, v_artefact_hash, v_artefact_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_name = p_ref_name
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  return query select v_draft_content, v_draft_hash, v_artefact_content, v_artefact_hash, v_draft_updated, v_artefact_updated;
end;
$function$
;
