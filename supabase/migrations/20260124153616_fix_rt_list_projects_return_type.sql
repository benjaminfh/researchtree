-- Fix return type change by recreating rt_list_projects_v1 with owner metadata.

drop function if exists public.rt_list_projects_v1();

create or replace function public.rt_list_projects_v1()
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  owner_user_id uuid,
  owner_email text
)
language sql
stable
as $$
  select
    p.id,
    p.name,
    p.description,
    p.created_at,
    p.updated_at,
    p.owner_user_id,
    u.email
  from public.projects p
  left join auth.users u on u.id = p.owner_user_id
  where public.rt_is_project_member(p.id)
  order by p.updated_at desc
$$;

alter function public.rt_list_projects_v1() set search_path = public;

revoke all on function public.rt_list_projects_v1() from public;
grant execute on function public.rt_list_projects_v1() to authenticated;
