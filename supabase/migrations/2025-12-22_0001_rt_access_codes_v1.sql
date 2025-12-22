create table if not exists public.access_codes (
  code text primary key,
  max_uses integer not null default 5,
  uses integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text null,
  note text null
);

alter table public.access_codes enable row level security;

create or replace function public.rt_redeem_access_code_v1(
  p_code text,
  p_email text,
  p_approved_by text default null
) returns boolean
language plpgsql
security definer
as $$
declare
  v_code text := lower(trim(p_code));
  v_email text := lower(trim(p_email));
  v_row public.access_codes%rowtype;
begin
  if v_code is null or v_code = '' then
    raise exception 'Access code is required';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  update public.access_codes
  set uses = uses + 1
  where code = v_code and uses < max_uses
  returning * into v_row;

  if not found then
    return false;
  end if;

  insert into public.email_allowlist (email, created_by, note)
  values (v_email, p_approved_by, 'access_code:' || v_code)
  on conflict (email) do update
  set created_by = excluded.created_by;

  insert into public.waitlist_requests (email, status, approved_at, approved_by, last_requested_at)
  values (v_email, 'approved', now(), p_approved_by, now())
  on conflict (email) do update
  set status = 'approved',
      approved_at = now(),
      approved_by = p_approved_by,
      last_requested_at = now();

  return true;
end;
$$;

revoke all on function public.rt_redeem_access_code_v1(text, text, text) from public;
revoke all on function public.rt_redeem_access_code_v1(text, text, text) from anon;
revoke all on function public.rt_redeem_access_code_v1(text, text, text) from authenticated;
grant execute on function public.rt_redeem_access_code_v1(text, text, text) to service_role;
