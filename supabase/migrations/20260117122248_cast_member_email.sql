-- Cast member email to text to match function return signature.
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
         u.email::text,
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
