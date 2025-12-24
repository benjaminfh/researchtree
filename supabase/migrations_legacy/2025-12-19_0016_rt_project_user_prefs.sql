-- Per-user current branch (ref) preference per project.

create table if not exists public.project_user_prefs (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  current_ref_name text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_user_prefs_user_idx on public.project_user_prefs(user_id);
create index if not exists project_user_prefs_project_idx on public.project_user_prefs(project_id);

alter table public.project_user_prefs enable row level security;

drop policy if exists project_user_prefs_select_own on public.project_user_prefs;
create policy project_user_prefs_select_own
on public.project_user_prefs for select
using (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
);

drop policy if exists project_user_prefs_upsert_own on public.project_user_prefs;
create policy project_user_prefs_upsert_own
on public.project_user_prefs for insert
with check (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
);

drop policy if exists project_user_prefs_update_own on public.project_user_prefs;
create policy project_user_prefs_update_own
on public.project_user_prefs for update
using (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
)
with check (
  user_id = auth.uid()
  and public.rt_is_project_member(project_id)
);

-- RPC: get current ref for a user+project (defaults to 'main' if unset)
create or replace function public.rt_get_current_ref_v1(
  p_project_id uuid,
  p_default_ref_name text default 'main'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  select pup.current_ref_name
    into v_ref
  from public.project_user_prefs pup
  where pup.project_id = p_project_id and pup.user_id = auth.uid();

  return coalesce(v_ref, p_default_ref_name, 'main');
end;
$$;

revoke all on function public.rt_get_current_ref_v1(uuid, text) from public;
grant execute on function public.rt_get_current_ref_v1(uuid, text) to authenticated;

-- RPC: set current ref for a user+project (ensures the ref exists in public.refs)
create or replace function public.rt_set_current_ref_v1(
  p_project_id uuid,
  p_ref_name text,
  p_lock_timeout_ms integer default 3000
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
  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  if p_ref_name is null or btrim(p_ref_name) = '' then
    raise exception 'ref name is required';
  end if;

  perform set_config('lock_timeout', concat(p_lock_timeout_ms, 'ms'), true);

  insert into public.refs (project_id, name, tip_commit_id)
  values (p_project_id, btrim(p_ref_name), null)
  on conflict do nothing;

  insert into public.project_user_prefs (project_id, user_id, current_ref_name, updated_at)
  values (p_project_id, auth.uid(), btrim(p_ref_name), now())
  on conflict (project_id, user_id)
  do update set
    current_ref_name = excluded.current_ref_name,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.rt_set_current_ref_v1(uuid, text, integer) from public;
grant execute on function public.rt_set_current_ref_v1(uuid, text, integer) to authenticated;

