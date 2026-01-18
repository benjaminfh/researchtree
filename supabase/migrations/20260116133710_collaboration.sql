-- Collaboration: invites + ref leases.

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'viewer'::text,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid,
  revoked_at timestamptz
);

create index if not exists project_invites_project_id_idx on public.project_invites(project_id);
create index if not exists project_invites_email_idx on public.project_invites(lower(email));
create unique index if not exists project_invites_project_email_pending_idx
  on public.project_invites(project_id, lower(email))
  where revoked_at is null and accepted_at is null;

alter table public.project_invites enable row level security;

create policy "project_invites_select_owner" on public.project_invites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_invites.project_id
        and p.owner_user_id = auth.uid()
    )
  );

create table if not exists public.ref_leases (
  project_id uuid not null references public.projects(id) on delete cascade,
  ref_id uuid not null references public.refs(id) on delete cascade,
  holder_user_id uuid not null,
  holder_session_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, ref_id)
);

create index if not exists ref_leases_expires_idx on public.ref_leases(expires_at);
create index if not exists ref_leases_holder_idx on public.ref_leases(holder_user_id);

alter table public.ref_leases enable row level security;

create policy "ref_leases_select_member" on public.ref_leases
  for select
  to authenticated
  using (public.rt_is_project_member(project_id));

create or replace function public.rt_is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_user_id = auth.uid()
  )
$$;

revoke all on function public.rt_is_project_owner(uuid) from public;
grant execute on function public.rt_is_project_owner(uuid) to authenticated;

create or replace function public.rt_list_project_members_v1(p_project_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select pm.user_id,
         u.email,
         pm.role,
         pm.created_at
    from public.project_members pm
    left join auth.users u on u.id = pm.user_id
   where pm.project_id = p_project_id
   order by (pm.role = 'owner') desc, pm.created_at asc;
end;
$$;

revoke all on function public.rt_list_project_members_v1(uuid) from public;
grant execute on function public.rt_list_project_members_v1(uuid) to authenticated;

create or replace function public.rt_get_project_owner_v1(p_project_id uuid)
returns table (owner_user_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
    select p.owner_user_id
    from public.projects p
    where p.id = p_project_id
    limit 1;
end;
$$;

revoke all on function public.rt_get_project_owner_v1(uuid) from public;
grant execute on function public.rt_get_project_owner_v1(uuid) to authenticated;

create or replace function public.rt_list_project_invites_v1(p_project_id uuid)
returns table (
  id uuid,
  email text,
  role text,
  invited_by uuid,
  invited_by_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select i.id,
         i.email,
         i.role,
         i.invited_by,
         u.email,
         i.created_at
    from public.project_invites i
    left join auth.users u on u.id = i.invited_by
   where i.project_id = p_project_id
     and i.revoked_at is null
     and i.accepted_at is null
   order by i.created_at desc;
end;
$$;

revoke all on function public.rt_list_project_invites_v1(uuid) from public;
grant execute on function public.rt_list_project_invites_v1(uuid) to authenticated;

create or replace function public.rt_invite_project_member_v1(
  p_project_id uuid,
  p_email text,
  p_role text default 'viewer'::text
)
returns table (
  invite_id uuid,
  member_user_id uuid
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_user_id uuid;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_role is null or p_role not in ('viewer', 'editor') then
    raise exception 'Invalid role';
  end if;

  select u.id into v_user_id
    from auth.users u
    where lower(u.email) = v_email
    limit 1;

  if v_user_id is not null then
    insert into public.project_members (project_id, user_id, role)
      values (p_project_id, v_user_id, p_role)
      on conflict (project_id, user_id) do update
        set role = case
          when project_members.role = 'owner' then project_members.role
          else excluded.role
        end;
    return query select null::uuid, v_user_id;
    return;
  end if;

  select i.id into v_invite_id
    from public.project_invites i
   where i.project_id = p_project_id
     and lower(i.email) = v_email
     and i.revoked_at is null
     and i.accepted_at is null
   limit 1;

  if v_invite_id is not null then
    update public.project_invites
       set role = p_role,
           updated_at = now(),
           revoked_at = null,
           accepted_at = null,
           accepted_user_id = null
     where id = v_invite_id
     returning id into v_invite_id;
  else
    insert into public.project_invites (project_id, email, role, invited_by)
      values (p_project_id, v_email, p_role, auth.uid())
      returning id into v_invite_id;
  end if;

  return query select v_invite_id, null::uuid;
end;
$$;

revoke all on function public.rt_invite_project_member_v1(uuid, text, text) from public;
grant execute on function public.rt_invite_project_member_v1(uuid, text, text) to authenticated;

create or replace function public.rt_update_project_member_role_v1(
  p_project_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_role is null or p_role not in ('viewer', 'editor') then
    raise exception 'Invalid role';
  end if;

  select owner_user_id into v_owner_id from public.projects where id = p_project_id;
  if v_owner_id is not null and v_owner_id = p_user_id then
    raise exception 'Owner role cannot be changed';
  end if;

  update public.project_members
     set role = p_role
   where project_id = p_project_id
     and user_id = p_user_id;

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.rt_update_project_member_role_v1(uuid, uuid, text) from public;
grant execute on function public.rt_update_project_member_role_v1(uuid, uuid, text) to authenticated;

create or replace function public.rt_remove_project_member_v1(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select owner_user_id into v_owner_id from public.projects where id = p_project_id;
  if v_owner_id is not null and v_owner_id = p_user_id then
    raise exception 'Owner cannot be removed';
  end if;

  delete from public.project_members
   where project_id = p_project_id
     and user_id = p_user_id;

  if not found then
    raise exception 'Member not found';
  end if;

  delete from public.ref_leases
   where project_id = p_project_id
     and holder_user_id = p_user_id;
end;
$$;

revoke all on function public.rt_remove_project_member_v1(uuid, uuid) from public;
grant execute on function public.rt_remove_project_member_v1(uuid, uuid) to authenticated;

create or replace function public.rt_update_project_invite_role_v1(
  p_project_id uuid,
  p_invite_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_role is null or p_role not in ('viewer', 'editor') then
    raise exception 'Invalid role';
  end if;

  update public.project_invites
     set role = p_role,
         updated_at = now()
   where id = p_invite_id
     and project_id = p_project_id
     and revoked_at is null
     and accepted_at is null;

  if not found then
    raise exception 'Invite not found';
  end if;
end;
$$;

revoke all on function public.rt_update_project_invite_role_v1(uuid, uuid, text) from public;
grant execute on function public.rt_update_project_invite_role_v1(uuid, uuid, text) to authenticated;

create or replace function public.rt_revoke_project_invite_v1(
  p_project_id uuid,
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  update public.project_invites
     set revoked_at = now(),
         updated_at = now()
   where id = p_invite_id
     and project_id = p_project_id
     and revoked_at is null
     and accepted_at is null;

  if not found then
    raise exception 'Invite not found';
  end if;
end;
$$;

revoke all on function public.rt_revoke_project_invite_v1(uuid, uuid) from public;
grant execute on function public.rt_revoke_project_invite_v1(uuid, uuid) to authenticated;

create or replace function public.rt_accept_project_invites_v1(
  p_email text
)
returns table (
  project_id uuid,
  role text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_auth_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_auth_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if v_auth_email = '' then
    raise exception 'Email not available';
  end if;

  v_email := lower(trim(coalesce(p_email, v_auth_email)));
  if v_email <> v_auth_email then
    raise exception 'Not authorized';
  end if;

  if v_email = '' then
    return;
  end if;

  for project_id, role in
    select i.project_id, i.role
      from public.project_invites i
     where lower(i.email) = v_email
       and i.revoked_at is null
       and i.accepted_at is null
  loop
    insert into public.project_members (project_id, user_id, role)
      values (project_id, auth.uid(), role)
      on conflict (project_id, user_id) do update
        set role = case
          when project_members.role = 'owner' then project_members.role
          else excluded.role
        end;

    update public.project_invites
       set accepted_at = now(),
           accepted_user_id = auth.uid(),
           updated_at = now()
     where project_invites.project_id = project_id
       and lower(project_invites.email) = v_email
       and project_invites.revoked_at is null
       and project_invites.accepted_at is null;

    return next;
  end loop;
end;
$$;

revoke all on function public.rt_accept_project_invites_v1(text) from public;
grant execute on function public.rt_accept_project_invites_v1(text) to authenticated;

create or replace function public.rt_list_ref_leases_v1(
  p_project_id uuid
)
returns table (
  ref_id uuid,
  holder_user_id uuid,
  holder_session_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  delete from public.ref_leases
   where project_id = p_project_id
     and expires_at < now();

  return query
    select l.ref_id, l.holder_user_id, l.holder_session_id, l.expires_at
      from public.ref_leases l
     where l.project_id = p_project_id;
end;
$$;

revoke all on function public.rt_list_ref_leases_v1(uuid) from public;
grant execute on function public.rt_list_ref_leases_v1(uuid) to authenticated;

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
  v_rowcount integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
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
      updated_at = now()
    where public.ref_leases.expires_at <= v_now
       or (public.ref_leases.holder_user_id = auth.uid() and public.ref_leases.holder_session_id = p_session_id);

  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Lease held';
  end if;
end;
$$;

revoke all on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) from public;
grant execute on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) to authenticated;

create or replace function public.rt_release_ref_lease_v1(
  p_project_id uuid,
  p_ref_id uuid,
  p_session_id text default null,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_force and public.rt_is_project_owner(p_project_id) then
    delete from public.ref_leases
      where project_id = p_project_id
        and ref_id = p_ref_id;
    return;
  end if;

  delete from public.ref_leases
    where project_id = p_project_id
      and ref_id = p_ref_id
      and holder_user_id = auth.uid()
      and (p_session_id is null or holder_session_id = p_session_id);

  if not found then
    raise exception 'Lease not found';
  end if;
end;
$$;

revoke all on function public.rt_release_ref_lease_v1(uuid, uuid, text, boolean) from public;
grant execute on function public.rt_release_ref_lease_v1(uuid, uuid, text, boolean) to authenticated;

drop function if exists public.rt_list_refs_v2(uuid);

create or replace function public.rt_list_refs_v2(
  p_project_id uuid
)
returns table (
  id uuid,
  name text,
  head_commit text,
  node_count bigint,
  is_trunk boolean,
  is_pinned boolean,
  is_hidden boolean,
  provider text,
  model text,
  lease_holder_user_id uuid,
  lease_holder_session_id text,
  lease_expires_at timestamptz
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

  delete from public.ref_leases
   where project_id = p_project_id
     and expires_at < now();

  return query
  select
    r.id,
    r.name,
    coalesce(r.tip_commit_id::text, '') as head_commit,
    coalesce(mx.max_ordinal + 1, 0)::bigint as node_count,
    (r.name = 'main') as is_trunk,
    (r.id = p.pinned_ref_id) as is_pinned,
    coalesce(r.is_hidden, false) as is_hidden,
    r.provider,
    r.model,
    l.holder_user_id,
    l.holder_session_id,
    l.expires_at
  from public.refs r
  left join (
    select co.ref_id, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_id
  ) mx on mx.ref_id = r.id
  left join public.projects p on p.id = p_project_id
  left join public.ref_leases l
    on l.project_id = r.project_id
   and l.ref_id = r.id
  where r.project_id = p_project_id
  order by (r.id = p.pinned_ref_id) desc, (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v2(uuid) from public;
grant execute on function public.rt_list_refs_v2(uuid) to authenticated;
