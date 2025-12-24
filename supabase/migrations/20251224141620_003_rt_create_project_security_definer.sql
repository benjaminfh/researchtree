-- Ensure rt_create_project bypasses RLS (needed for authenticated project creation).

drop function if exists public.rt_create_project(text, text, uuid, text, text);

create or replace function public.rt_create_project(
  p_name text,
  p_description text default null,
  p_project_id uuid default null,
  p_provider text default null,
  p_model text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_project_id := coalesce(p_project_id, gen_random_uuid());

  insert into public.projects (id, owner_user_id, name, description)
  values (v_project_id, auth.uid(), p_name, p_description)
  on conflict (id) do nothing;

  insert into public.project_members (project_id, user_id, role)
  values (v_project_id, auth.uid(), 'owner')
  on conflict do nothing;

  insert into public.refs (project_id, name, tip_commit_id, provider, model)
  values (
    v_project_id,
    'main',
    null,
    nullif(btrim(p_provider), ''),
    nullif(btrim(p_model), '')
  )
  on conflict do nothing;

  return v_project_id;
end;
$$;

revoke all on function public.rt_create_project(text, text, uuid, text, text) from public;
grant execute on function public.rt_create_project(text, text, uuid, text, text) to authenticated;
