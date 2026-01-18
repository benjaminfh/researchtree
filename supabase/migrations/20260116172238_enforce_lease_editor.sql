-- Require editor role to acquire ref leases.

create or replace function public.rt_acquire_ref_lease_v1(
  p_project_id uuid,
  p_ref_id uuid,
  p_session_id text,
  p_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_holder_user_id uuid;
  v_holder_session_id text;
  v_expires_at timestamptz;
  v_now timestamptz := now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 60), 10);
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor')
  ) then
    raise exception 'Not authorized';
  end if;

  if p_session_id is null or trim(p_session_id) = '' then
    raise exception 'Session id is required';
  end if;

  select l.holder_user_id, l.holder_session_id, l.expires_at
    into v_holder_user_id, v_holder_session_id, v_expires_at
    from public.ref_leases l
    where l.project_id = p_project_id
      and l.ref_id = p_ref_id
    for update;

  if found and v_expires_at is not null and v_expires_at > v_now then
    if v_holder_user_id is distinct from auth.uid() or v_holder_session_id is distinct from p_session_id then
      raise exception 'Lease held';
    end if;
  end if;

  insert into public.ref_leases (project_id, ref_id, holder_user_id, holder_session_id, expires_at)
    values (p_project_id, p_ref_id, auth.uid(), p_session_id, v_now + make_interval(secs => v_ttl))
    on conflict (project_id, ref_id) do update set
      holder_user_id = excluded.holder_user_id,
      holder_session_id = excluded.holder_session_id,
      expires_at = excluded.expires_at,
      updated_at = now();
end;
$$;

revoke all on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) from public;
grant execute on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) to authenticated;
