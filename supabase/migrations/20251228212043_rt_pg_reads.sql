-- Add RPCs for project and node reads to keep pg access behind the adapter boundary.

create or replace function public.rt_list_projects_v1()
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select p.id, p.name, p.description, p.created_at, p.updated_at
  from public.projects p
  where public.rt_is_project_member(p.id)
  order by p.updated_at desc
$$;

revoke all on function public.rt_list_projects_v1() from public;
grant execute on function public.rt_list_projects_v1() to authenticated;

create or replace function public.rt_get_project_v1(p_project_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
as $$
  select p.id, p.name, p.description, p.created_at, p.updated_at
  from public.projects p
  where p.id = p_project_id
    and public.rt_is_project_member(p.id)
  limit 1
$$;

revoke all on function public.rt_get_project_v1(uuid) from public;
grant execute on function public.rt_get_project_v1(uuid) to authenticated;

create or replace function public.rt_list_project_member_ids_v1(p_user_id uuid)
returns table (project_id uuid)
language plpgsql
stable
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if auth.uid() is null or p_user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
    select pm.project_id
    from public.project_members pm
    where pm.user_id = p_user_id;
end;
$$;

revoke all on function public.rt_list_project_member_ids_v1(uuid) from public;
grant execute on function public.rt_list_project_member_ids_v1(uuid) to authenticated;

create or replace function public.rt_get_project_main_ref_updates_v1(p_project_ids uuid[])
returns table (
  project_id uuid,
  updated_at timestamptz
)
language plpgsql
stable
as $$
begin
  if p_project_ids is null then
    return;
  end if;

  return query
    select r.project_id, r.updated_at
    from public.refs r
    where r.name = 'main'
      and r.project_id = any(p_project_ids)
      and public.rt_is_project_member(r.project_id);
end;
$$;

revoke all on function public.rt_get_project_main_ref_updates_v1(uuid[]) from public;
grant execute on function public.rt_get_project_main_ref_updates_v1(uuid[]) to authenticated;

create or replace function public.rt_get_node_content_json_v1(p_project_id uuid, p_node_id uuid)
returns jsonb
language sql
stable
as $$
  select n.content_json
  from public.nodes n
  where n.project_id = p_project_id
    and n.id = p_node_id
    and public.rt_is_project_member(p_project_id)
  limit 1
$$;

revoke all on function public.rt_get_node_content_json_v1(uuid, uuid) from public;
grant execute on function public.rt_get_node_content_json_v1(uuid, uuid) to authenticated;
