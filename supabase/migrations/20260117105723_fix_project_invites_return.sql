-- Ensure invite list function signature matches returned columns.
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
