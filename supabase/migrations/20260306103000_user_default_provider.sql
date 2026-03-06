-- Add profile-level default provider preference and RPCs.

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
  default_provider text,
  system_prompt text,
  system_prompt_mode text,
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

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  return query
  select
    (k.openai_secret_id is not null) as has_openai,
    (k.gemini_secret_id is not null) as has_gemini,
    (k.anthropic_secret_id is not null) as has_anthropic,
    nullif(btrim(k.default_provider), '') as default_provider,
    nullif(btrim(coalesce(k.system_prompt, '')), '') as system_prompt,
    coalesce(nullif(btrim(k.system_prompt_mode), ''), 'append') as system_prompt_mode,
    k.updated_at
  from public.user_llm_keys k
  where k.user_id = auth.uid();
end;
$$;

revoke all on function public.rt_get_user_llm_key_status_v1() from public;
grant execute on function public.rt_get_user_llm_key_status_v1() to authenticated;

create or replace function public.rt_set_user_default_provider_v1(p_provider text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_provider := nullif(btrim(coalesce(p_provider, '')), '');
  if v_provider is not null and v_provider not in ('openai', 'openai_responses', 'gemini', 'anthropic', 'mock') then
    raise exception 'Invalid provider';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  update public.user_llm_keys
  set
    default_provider = v_provider,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke all on function public.rt_set_user_default_provider_v1(text) from public;
grant execute on function public.rt_set_user_default_provider_v1(text) to authenticated;
