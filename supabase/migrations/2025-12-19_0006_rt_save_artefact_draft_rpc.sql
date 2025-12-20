-- RPC: save mutable canvas draft (no provenance commit)

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

  v_hash := encode(digest(coalesce(p_content, ''), 'sha256'), 'hex');

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

revoke all on function public.rt_save_artefact_draft(uuid, text, text, integer) from public;
grant execute on function public.rt_save_artefact_draft(uuid, text, text, integer) to authenticated;

