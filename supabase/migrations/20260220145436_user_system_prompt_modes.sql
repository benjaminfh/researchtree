-- Add user system prompt settings and immutable project prompt snapshots.

alter table public.user_llm_keys
  add column if not exists system_prompt text,
  add column if not exists system_prompt_mode text not null default 'append';

alter table public.user_llm_keys
  drop constraint if exists user_llm_keys_system_prompt_mode_check;

alter table public.user_llm_keys
  add constraint user_llm_keys_system_prompt_mode_check
  check (system_prompt_mode in ('append', 'replace'));

alter table public.projects
  add column if not exists system_prompt text;

create or replace function public.rt_get_user_llm_key_status_v1()
returns table(has_openai boolean, has_gemini boolean, has_anthropic boolean, system_prompt text, system_prompt_mode text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  return query
  select
    (k.openai_secret_id is not null) as has_openai,
    (k.gemini_secret_id is not null) as has_gemini,
    (k.anthropic_secret_id is not null) as has_anthropic,
    nullif(btrim(coalesce(k.system_prompt, '')), '') as system_prompt,
    coalesce(nullif(btrim(k.system_prompt_mode), ''), 'append') as system_prompt_mode,
    k.updated_at
  from public.user_llm_keys k
  where k.user_id = auth.uid();
end;
$$;

create or replace function public.rt_get_user_system_prompt_v1()
returns table(mode text, prompt text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  return query
  select
    coalesce(nullif(btrim(k.system_prompt_mode), ''), 'append') as mode,
    nullif(btrim(coalesce(k.system_prompt, '')), '') as prompt
  from public.user_llm_keys k
  where k.user_id = auth.uid();
end;
$$;

revoke all on function public.rt_get_user_system_prompt_v1() from public;
grant execute on function public.rt_get_user_system_prompt_v1() to authenticated;

create or replace function public.rt_set_user_system_prompt_v1(p_mode text default 'append', p_prompt text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_prompt text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_mode := coalesce(nullif(btrim(coalesce(p_mode, '')), ''), 'append');
  if v_mode not in ('append', 'replace') then
    raise exception 'Invalid mode';
  end if;

  v_prompt := nullif(btrim(coalesce(p_prompt, '')), '');

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  update public.user_llm_keys
  set
    system_prompt_mode = v_mode,
    system_prompt = v_prompt,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke all on function public.rt_set_user_system_prompt_v1(text, text) from public;
grant execute on function public.rt_set_user_system_prompt_v1(text, text) to authenticated;

drop function if exists public.rt_create_project(text, text, uuid, text, text);

create or replace function public.rt_create_project(
  p_name text,
  p_description text default null,
  p_project_id uuid default null,
  p_provider text default null,
  p_model text default null,
  p_system_prompt text default null
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

  insert into public.projects (id, owner_user_id, name, description, system_prompt)
  values (v_project_id, auth.uid(), p_name, p_description, nullif(btrim(coalesce(p_system_prompt, '')), ''))
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

revoke all on function public.rt_create_project(text, text, uuid, text, text, text) from public;
grant execute on function public.rt_create_project(text, text, uuid, text, text, text) to authenticated;

drop function if exists public.rt_get_project_v1(uuid);

create or replace function public.rt_get_project_v1(p_project_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  system_prompt text
)
language sql
stable
as $$
  select p.id, p.name, p.description, p.created_at, p.updated_at, p.system_prompt
  from public.projects p
  where p.id = p_project_id
    and public.rt_is_project_member(p.id)
  limit 1
$$;

revoke all on function public.rt_get_project_v1(uuid) from public;
grant execute on function public.rt_get_project_v1(uuid) to authenticated;
