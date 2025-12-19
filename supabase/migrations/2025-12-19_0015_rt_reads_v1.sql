-- Read RPCs to support flipping /history and /artefact to Postgres behind a feature flag.
-- Writes remain via RPC; these reads are RPC to keep ordering/fallback logic server-side.

create or replace function public.rt_get_history_v1(
  p_project_id uuid,
  p_ref_name text,
  p_limit integer default 200,
  p_before_ordinal bigint default null
)
returns table (
  ordinal bigint,
  node_json jsonb
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
  select t.ordinal, t.node_json
  from (
    select co.ordinal, n.content_json as node_json
    from public.commit_order co
    join public.nodes n
      on n.project_id = co.project_id
     and n.commit_id = co.commit_id
    where co.project_id = p_project_id
      and co.ref_name = p_ref_name
      and (p_before_ordinal is null or co.ordinal < p_before_ordinal)
    order by co.ordinal desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) t
  order by t.ordinal asc;
end;
$$;

revoke all on function public.rt_get_history_v1(uuid, text, integer, bigint) from public;
grant execute on function public.rt_get_history_v1(uuid, text, integer, bigint) to authenticated;

create or replace function public.rt_get_canvas_v1(
  p_project_id uuid,
  p_ref_name text,
  p_kind text default 'canvas_md'
)
returns table (
  content text,
  content_hash text,
  updated_at timestamptz,
  source text
)
language plpgsql
security definer
set search_path = public
as $$
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

  -- Prefer the caller's draft (mutable).
  select d.content, d.content_hash, d.updated_at
    into v_content, v_hash, v_updated
  from public.artefact_drafts d
  where d.project_id = p_project_id
    and d.ref_name = p_ref_name
    and d.user_id = auth.uid();

  if found then
    return query select v_content, v_hash, v_updated, 'draft'::text;
    return;
  end if;

  -- Fallback: latest immutable artefact on the ref history.
  select a.content, a.content_hash, a.created_at
    into v_content, v_hash, v_updated
  from public.artefacts a
  join public.commit_order co
    on co.project_id = a.project_id
   and co.commit_id = a.commit_id
  where a.project_id = p_project_id
    and co.ref_name = p_ref_name
    and a.kind = p_kind
  order by co.ordinal desc
  limit 1;

  if found then
    return query select v_content, v_hash, v_updated, 'artefact'::text;
    return;
  end if;

  return query select ''::text, ''::text, null::timestamptz, 'empty'::text;
end;
$$;

revoke all on function public.rt_get_canvas_v1(uuid, text, text) from public;
grant execute on function public.rt_get_canvas_v1(uuid, text, text) to authenticated;

