-- Fix ambiguous ref_id references in lease acquisition.

create or replace function public.rt_acquire_ref_lease_v1(
  p_project_id uuid,
  p_ref_id uuid,
  p_session_id text,
  p_ttl_seconds integer
)
returns table (
  ref_id uuid,
  holder_user_id uuid,
  holder_session_id text,
  expires_at timestamp with time zone,
  acquired boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_expires_at timestamp with time zone;
  v_now timestamp with time zone := now();
  v_session text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_editor(p_project_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.refs r where r.project_id = p_project_id and r.id = p_ref_id
  ) then
    raise exception 'Branch not found';
  end if;

  v_session := coalesce(trim(p_session_id), '');
  if v_session = '' then
    raise exception 'Lease session required';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds <= 0 then
    raise exception 'Invalid lease duration';
  end if;

  v_expires_at := v_now + make_interval(secs => p_ttl_seconds);

  select * into v_existing
  from public.ref_leases rl
  where rl.project_id = p_project_id
    and rl.ref_id = p_ref_id
  for update;

  if not found then
    insert into public.ref_leases (project_id, ref_id, holder_user_id, holder_session_id, expires_at, updated_at)
    values (p_project_id, p_ref_id, auth.uid(), v_session, v_expires_at, v_now);
    return query select p_ref_id, auth.uid(), v_session, v_expires_at, true;
    return;
  end if;

  if v_existing.expires_at <= v_now or v_existing.holder_user_id = auth.uid() then
    update public.ref_leases rl
    set holder_user_id = auth.uid(),
        holder_session_id = v_session,
        expires_at = v_expires_at,
        updated_at = v_now
    where rl.project_id = p_project_id
      and rl.ref_id = p_ref_id;
    return query select p_ref_id, auth.uid(), v_session, v_expires_at, true;
    return;
  end if;

  return query select v_existing.ref_id, v_existing.holder_user_id, v_existing.holder_session_id, v_existing.expires_at, false;
end;
$$;

revoke all on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) from public;
grant execute on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) to authenticated;
