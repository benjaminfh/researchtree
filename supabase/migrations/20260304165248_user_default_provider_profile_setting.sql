-- Store and expose a per-user default LLM provider selection for workspace and branch creation defaults.

alter table public.user_llm_keys
  add column if not exists default_provider text;

alter table public.user_llm_keys
  drop constraint if exists user_llm_keys_default_provider_check;

alter table public.user_llm_keys
  add constraint user_llm_keys_default_provider_check
  check (default_provider is null or default_provider in ('openai', 'openai_responses', 'gemini', 'anthropic', 'mock'));

drop function if exists public.rt_get_user_llm_key_status_v1();

create or replace function public.rt_get_user_llm_key_status_v1()
returns table(
  has_openai boolean,
  has_gemini boolean,
  has_anthropic boolean,
  system_prompt text,
  system_prompt_mode text,
  default_provider text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    (k.openai_secret_id is not null) as has_openai,
    (k.gemini_secret_id is not null) as has_gemini,
    (k.anthropic_secret_id is not null) as has_anthropic,
    k.system_prompt,
    coalesce(nullif(btrim(k.system_prompt_mode), ''), 'append') as system_prompt_mode,
    nullif(btrim(k.default_provider), '') as default_provider,
    k.updated_at
  from public.user_llm_keys k
  where k.user_id = auth.uid();
$$;

revoke all on function public.rt_get_user_llm_key_status_v1() from public;
grant execute on function public.rt_get_user_llm_key_status_v1() to authenticated;

create or replace function public.rt_get_user_default_provider_v1()
returns table(default_provider text)
language sql
security definer
set search_path = public
as $$
  select nullif(btrim(k.default_provider), '') as default_provider
  from public.user_llm_keys k
  where k.user_id = auth.uid();
$$;

revoke all on function public.rt_get_user_default_provider_v1() from public;
grant execute on function public.rt_get_user_default_provider_v1() to authenticated;

create or replace function public.rt_set_user_default_provider_v1(p_provider text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text := nullif(btrim(p_provider), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_provider is not null and v_provider not in ('openai', 'openai_responses', 'gemini', 'anthropic', 'mock') then
    raise exception 'Unsupported provider %', v_provider;
  end if;

  insert into public.user_llm_keys (user_id, default_provider, updated_at)
  values (v_user_id, v_provider, now())
  on conflict (user_id)
  do update
    set default_provider = excluded.default_provider,
        updated_at = now();
end;
$$;

revoke all on function public.rt_set_user_default_provider_v1(text) from public;
grant execute on function public.rt_set_user_default_provider_v1(text) to authenticated;
