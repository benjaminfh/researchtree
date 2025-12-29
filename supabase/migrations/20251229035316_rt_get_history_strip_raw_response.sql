-- Default history reads omit rawResponse unless explicitly requested.

drop function if exists public.rt_get_history_v1(uuid, text, integer, bigint);

create or replace function public.rt_get_history_v1(
  p_project_id uuid,
  p_ref_name text,
  p_limit integer default 200,
  p_before_ordinal bigint default null,
  p_include_raw_response boolean default false
)
returns table(ordinal bigint, node_json jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not public.rt_is_project_member(p_project_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select t.ordinal, t.node_json
  from (
    select
      co.ordinal,
      case
        when p_include_raw_response then n.content_json
        else ((coalesce(n.content_json, '{}'::jsonb) - 'rawResponse') #- '{thinking,raw}')
      end as node_json
    from public.commit_order co
    join public.nodes n
      on n.project_id = co.project_id
     and n.commit_id = co.commit_id
    where co.project_id = p_project_id
      and co.ref_name = p_ref_name
      and (p_before_ordinal is null or co.ordinal < p_before_ordinal)
    order by co.ordinal desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) t
  order by t.ordinal asc;
end;
$function$;

revoke all on function public.rt_get_history_v1(uuid, text, integer, bigint, boolean) from public;
grant execute on function public.rt_get_history_v1(uuid, text, integer, bigint, boolean) to authenticated;
