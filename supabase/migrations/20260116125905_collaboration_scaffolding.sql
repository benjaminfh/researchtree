-- Add collaboration scaffolding for members, invites, and ref leases.

create table if not exists public.project_invites (
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'viewer'::text,
  invited_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, email)
);

create index if not exists project_invites_project_id_idx on public.project_invites(project_id);
create index if not exists project_invites_email_idx on public.project_invites(email);

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

alter table public.project_invites enable row level security;
alter table public.ref_leases enable row level security;

create policy "project_invites_select_owner"
  on public.project_invites
  for select
  to public
  using (public.rt_is_project_owner(project_id));

create policy "project_invites_insert_owner"
  on public.project_invites
  for insert
  to public
  with check (public.rt_is_project_owner(project_id));

create policy "project_invites_update_owner"
  on public.project_invites
  for update
  to public
  using (public.rt_is_project_owner(project_id))
  with check (public.rt_is_project_owner(project_id));

create policy "project_invites_delete_owner"
  on public.project_invites
  for delete
  to public
  using (public.rt_is_project_owner(project_id));

create policy "ref_leases_select_member"
  on public.ref_leases
  for select
  to public
  using (public.rt_is_project_member(project_id));

create policy "ref_leases_insert_holder"
  on public.ref_leases
  for insert
  to public
  with check ((holder_user_id = auth.uid()) and public.rt_is_project_member(project_id));

create policy "ref_leases_update_holder"
  on public.ref_leases
  for update
  to public
  using ((holder_user_id = auth.uid()) and public.rt_is_project_member(project_id))
  with check ((holder_user_id = auth.uid()) and public.rt_is_project_member(project_id));

create policy "ref_leases_delete_holder"
  on public.ref_leases
  for delete
  to public
  using ((holder_user_id = auth.uid()) and public.rt_is_project_member(project_id));

create or replace function public.rt_list_project_members_v1(
  p_project_id uuid
)
returns table (
  user_id uuid,
  role text,
  created_at timestamptz
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
  select pm.user_id,
         pm.role,
         pm.created_at
  from public.project_members pm
  where pm.project_id = p_project_id
  order by pm.created_at asc;
end;
$$;

revoke all on function public.rt_list_project_members_v1(uuid) from public;
grant execute on function public.rt_list_project_members_v1(uuid) to authenticated;

create or replace function public.rt_list_project_invites_v1(
  p_project_id uuid
)
returns table (
  email text,
  role text,
  invited_by_user_id uuid,
  created_at timestamptz
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
  select i.email,
         i.role,
         i.invited_by_user_id,
         i.created_at
  from public.project_invites i
  where i.project_id = p_project_id
  order by i.created_at asc;
end;
$$;

revoke all on function public.rt_list_project_invites_v1(uuid) from public;
grant execute on function public.rt_list_project_invites_v1(uuid) to authenticated;

create or replace function public.rt_list_ref_leases_v1(
  p_project_id uuid
)
returns table (
  ref_id uuid,
  holder_user_id uuid,
  holder_session_id text,
  expires_at timestamptz,
  updated_at timestamptz
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
  select rl.ref_id,
         rl.holder_user_id,
         rl.holder_session_id,
         rl.expires_at,
         rl.updated_at
  from public.ref_leases rl
  where rl.project_id = p_project_id
  order by rl.updated_at desc;
end;
$$;

revoke all on function public.rt_list_ref_leases_v1(uuid) from public;
grant execute on function public.rt_list_ref_leases_v1(uuid) to authenticated;
