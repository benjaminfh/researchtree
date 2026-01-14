-- Add collaboration tables, membership management, and branch lease support.

create table if not exists public.project_invites (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  email text not null,
  role text not null default 'viewer',
  invited_by uuid not null,
  accepted_user_id uuid,
  created_at timestamp with time zone not null default now(),
  accepted_at timestamp with time zone
);

alter table public.project_invites enable row level security;

alter table public.project_invites
  add constraint project_invites_pkey primary key (id);

create unique index if not exists project_invites_project_email_key
  on public.project_invites (project_id, lower(email));

alter table public.project_invites
  add constraint project_invites_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade not valid;

alter table public.project_invites validate constraint project_invites_project_id_fkey;

create table if not exists public.ref_leases (
  project_id uuid not null,
  ref_id uuid not null,
  holder_user_id uuid not null,
  holder_session_id text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.ref_leases enable row level security;

create unique index if not exists ref_leases_pkey on public.ref_leases (project_id, ref_id);

alter table public.ref_leases
  add constraint ref_leases_pkey primary key using index ref_leases_pkey;

alter table public.ref_leases
  add constraint ref_leases_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade not valid;

alter table public.ref_leases validate constraint ref_leases_project_id_fkey;

alter table public.ref_leases
  add constraint ref_leases_ref_id_fkey foreign key (ref_id) references public.refs(id) on delete cascade not valid;

alter table public.ref_leases validate constraint ref_leases_ref_id_fkey;

create index if not exists ref_leases_expires_at_idx on public.ref_leases (expires_at);

create or replace function public.rt_is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_user_id = auth.uid()
  );
$$;

create or replace function public.rt_is_project_editor(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner', 'editor')
  );
$$;

create or replace function public.rt_get_project_member_role_v1(
  p_project_id uuid
)
returns text
language sql
stable
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.rt_list_project_members_v1(
  p_project_id uuid
)
returns table (
  user_id uuid,
  role text,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select pm.user_id, pm.role, pm.created_at
  from public.project_members pm
  where pm.project_id = p_project_id
  order by pm.created_at asc;
end;
$$;

create or replace function public.rt_list_project_invites_v1(
  p_project_id uuid
)
returns table (
  id uuid,
  email text,
  role text,
  invited_by uuid,
  created_at timestamp with time zone,
  accepted_user_id uuid,
  accepted_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    pi.id,
    pi.email,
    pi.role,
    pi.invited_by,
    pi.created_at,
    pi.accepted_user_id,
    pi.accepted_at
  from public.project_invites pi
  where pi.project_id = p_project_id
  order by pi.created_at desc;
end;
$$;

create or replace function public.rt_share_project_by_email_v1(
  p_project_id uuid,
  p_email text,
  p_role text
)
returns table (
  invite_id uuid,
  resolved_user_id uuid,
  role text,
  accepted boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_role text;
  v_user_id uuid;
  v_invite_id uuid;
  v_accepted_at timestamp with time zone;
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

  if p_role in ('viewer', 'editor') then
    v_role := p_role;
  else
    raise exception 'Invalid role';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is not null then
    insert into public.project_members (project_id, user_id, role)
    values (p_project_id, v_user_id, v_role)
    on conflict (project_id, user_id)
    do update set role = excluded.role;
    v_accepted_at := now();
  else
    v_accepted_at := null;
  end if;

  insert into public.project_invites (project_id, email, role, invited_by, accepted_user_id, accepted_at)
  values (p_project_id, v_email, v_role, auth.uid(), v_user_id, v_accepted_at)
  on conflict (project_id, lower(email))
  do update set
    role = excluded.role,
    invited_by = auth.uid(),
    accepted_user_id = excluded.accepted_user_id,
    accepted_at = excluded.accepted_at
  returning id into v_invite_id;

  return query select v_invite_id, v_user_id, v_role, v_user_id is not null;
end;
$$;

create or replace function public.rt_update_project_member_role_v1(
  p_project_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Invalid role';
  end if;
  if exists (
    select 1 from public.projects p where p.id = p_project_id and p.owner_user_id = p_user_id
  ) then
    raise exception 'Cannot modify owner role';
  end if;

  update public.project_members
  set role = p_role
  where project_id = p_project_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.rt_remove_project_member_v1(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;
  if exists (
    select 1 from public.projects p where p.id = p_project_id and p.owner_user_id = p_user_id
  ) then
    raise exception 'Cannot remove project owner';
  end if;

  delete from public.project_members
  where project_id = p_project_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.rt_remove_project_invite_v1(
  p_project_id uuid,
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;

  delete from public.project_invites
  where project_id = p_project_id
    and id = p_invite_id;
end;
$$;

create or replace function public.rt_update_project_invite_role_v1(
  p_project_id uuid,
  p_invite_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_owner(p_project_id) then
    raise exception 'Not authorized';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'Invalid role';
  end if;

  update public.project_invites
  set role = p_role
  where project_id = p_project_id
    and id = p_invite_id;
end;
$$;

create or replace function public.rt_accept_project_invites_v1()
returns table (
  project_id uuid,
  role text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or v_email = '' then
    return;
  end if;

  return query
  with matching as (
    select id, project_id, role
    from public.project_invites
    where lower(email) = v_email
      and (accepted_user_id is null or accepted_user_id = auth.uid())
  ), upserts as (
    insert into public.project_members (project_id, user_id, role)
    select project_id, auth.uid(), role
    from matching
    on conflict (project_id, user_id)
    do update set role = excluded.role
    returning project_id, role
  ), updated as (
    update public.project_invites pi
    set accepted_user_id = auth.uid(),
        accepted_at = now()
    from matching
    where pi.id = matching.id
    returning pi.project_id, pi.role
  )
  select project_id, role from updated;
end;
$$;

create or replace function public.rt_list_ref_leases_v1(
  p_project_id uuid
)
returns table (
  ref_id uuid,
  holder_user_id uuid,
  holder_session_id text,
  expires_at timestamp with time zone
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
  select rl.ref_id, rl.holder_user_id, rl.holder_session_id, rl.expires_at
  from public.ref_leases rl
  where rl.project_id = p_project_id
    and rl.expires_at > now();
end;
$$;

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
  from public.ref_leases
  where project_id = p_project_id
    and ref_id = p_ref_id
  for update;

  if not found then
    insert into public.ref_leases (project_id, ref_id, holder_user_id, holder_session_id, expires_at, updated_at)
    values (p_project_id, p_ref_id, auth.uid(), v_session, v_expires_at, v_now);
    return query select p_ref_id, auth.uid(), v_session, v_expires_at, true;
    return;
  end if;

  if v_existing.expires_at <= v_now or v_existing.holder_user_id = auth.uid() then
    update public.ref_leases
    set holder_user_id = auth.uid(),
        holder_session_id = v_session,
        expires_at = v_expires_at,
        updated_at = v_now
    where project_id = p_project_id
      and ref_id = p_ref_id;
    return query select p_ref_id, auth.uid(), v_session, v_expires_at, true;
    return;
  end if;

  return query select v_existing.ref_id, v_existing.holder_user_id, v_existing.holder_session_id, v_existing.expires_at, false;
end;
$$;

create or replace function public.rt_release_ref_lease_v1(
  p_project_id uuid,
  p_ref_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session text;
  v_deleted boolean := false;
  v_deleted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_session := coalesce(trim(p_session_id), '');
  if v_session = '' then
    raise exception 'Lease session required';
  end if;

  delete from public.ref_leases
  where project_id = p_project_id
    and ref_id = p_ref_id
    and holder_user_id = auth.uid()
    and holder_session_id = v_session;

  get diagnostics v_deleted_count = row_count;
  v_deleted := v_deleted_count > 0;
  return v_deleted;
end;
$$;

create policy "project_members_select_owner"
  on public.project_members
  as permissive
  for select
  to public
  using (public.rt_is_project_owner(project_id));

create policy "project_members_insert_owner"
  on public.project_members
  as permissive
  for insert
  to public
  with check (public.rt_is_project_owner(project_id));

create policy "project_members_update_owner"
  on public.project_members
  as permissive
  for update
  to public
  using (public.rt_is_project_owner(project_id))
  with check (public.rt_is_project_owner(project_id));

create policy "project_members_delete_owner"
  on public.project_members
  as permissive
  for delete
  to public
  using (public.rt_is_project_owner(project_id));

create policy "project_invites_owner_access"
  on public.project_invites
  as permissive
  for all
  to public
  using (public.rt_is_project_owner(project_id))
  with check (public.rt_is_project_owner(project_id));

create policy "ref_leases_select_member"
  on public.ref_leases
  as permissive
  for select
  to public
  using (public.rt_is_project_member(project_id));

grant select, insert, update, delete on table public.project_invites to authenticated;
grant select, insert, update, delete on table public.project_invites to service_role;

grant select, insert, update, delete on table public.ref_leases to authenticated;
grant select, insert, update, delete on table public.ref_leases to service_role;

drop function if exists public.rt_list_refs_v2(uuid);

create function public.rt_list_refs_v2(
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
  lease_user_id uuid,
  lease_session_id text,
  lease_expires_at timestamp with time zone
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
    rl.holder_user_id as lease_user_id,
    rl.holder_session_id as lease_session_id,
    rl.expires_at as lease_expires_at
  from public.refs r
  left join (
    select co.ref_id, max(co.ordinal) as max_ordinal
    from public.commit_order co
    where co.project_id = p_project_id
    group by co.ref_id
  ) mx on mx.ref_id = r.id
  left join public.projects p on p.id = p_project_id
  left join public.ref_leases rl
    on rl.project_id = r.project_id
   and rl.ref_id = r.id
   and rl.expires_at > now()
  where r.project_id = p_project_id
  order by (r.id = p.pinned_ref_id) desc, (r.name = 'main') desc, r.updated_at desc, r.name asc;
end;
$$;

revoke all on function public.rt_list_refs_v2(uuid) from public;
grant execute on function public.rt_list_refs_v2(uuid) to authenticated;

revoke all on function public.rt_list_project_members_v1(uuid) from public;
grant execute on function public.rt_list_project_members_v1(uuid) to authenticated;

revoke all on function public.rt_list_project_invites_v1(uuid) from public;
grant execute on function public.rt_list_project_invites_v1(uuid) to authenticated;

revoke all on function public.rt_get_project_member_role_v1(uuid) from public;
grant execute on function public.rt_get_project_member_role_v1(uuid) to authenticated;

revoke all on function public.rt_share_project_by_email_v1(uuid, text, text) from public;
grant execute on function public.rt_share_project_by_email_v1(uuid, text, text) to authenticated;

revoke all on function public.rt_update_project_member_role_v1(uuid, uuid, text) from public;
grant execute on function public.rt_update_project_member_role_v1(uuid, uuid, text) to authenticated;

revoke all on function public.rt_remove_project_member_v1(uuid, uuid) from public;
grant execute on function public.rt_remove_project_member_v1(uuid, uuid) to authenticated;

revoke all on function public.rt_remove_project_invite_v1(uuid, uuid) from public;
grant execute on function public.rt_remove_project_invite_v1(uuid, uuid) to authenticated;

revoke all on function public.rt_update_project_invite_role_v1(uuid, uuid, text) from public;
grant execute on function public.rt_update_project_invite_role_v1(uuid, uuid, text) to authenticated;

revoke all on function public.rt_accept_project_invites_v1() from public;
grant execute on function public.rt_accept_project_invites_v1() to authenticated;

revoke all on function public.rt_list_ref_leases_v1(uuid) from public;
grant execute on function public.rt_list_ref_leases_v1(uuid) to authenticated;

revoke all on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) from public;
grant execute on function public.rt_acquire_ref_lease_v1(uuid, uuid, text, integer) to authenticated;

revoke all on function public.rt_release_ref_lease_v1(uuid, uuid, text) from public;
grant execute on function public.rt_release_ref_lease_v1(uuid, uuid, text) to authenticated;
