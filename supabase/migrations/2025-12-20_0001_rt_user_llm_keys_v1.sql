-- User profile secrets: store per-user LLM provider API keys via Supabase Vault.

-- Vault extension (Supabase-managed). Safe to no-op if already installed.
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.user_llm_keys (
  user_id uuid primary key,
  openai_secret_id uuid null,
  gemini_secret_id uuid null,
  anthropic_secret_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_llm_keys enable row level security;

drop policy if exists user_llm_keys_select_self on public.user_llm_keys;
create policy user_llm_keys_select_self
on public.user_llm_keys for select
using (user_id = auth.uid());

drop policy if exists user_llm_keys_insert_self on public.user_llm_keys;
create policy user_llm_keys_insert_self
on public.user_llm_keys for insert
with check (user_id = auth.uid());

drop policy if exists user_llm_keys_update_self on public.user_llm_keys;
create policy user_llm_keys_update_self
on public.user_llm_keys for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.rt_get_user_llm_key_status_v1()
returns table (
  has_openai boolean,
  has_gemini boolean,
  has_anthropic boolean,
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
    k.updated_at
  from public.user_llm_keys k
  where k.user_id = auth.uid();
end;
$$;

create or replace function public.rt_set_user_llm_key_v1(
  p_provider text,
  p_secret text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_secret_id uuid;
  v_new_secret_id uuid;
  v_trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_provider is null or p_provider not in ('openai', 'gemini', 'anthropic') then
    raise exception 'Invalid provider';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  v_trimmed := nullif(btrim(coalesce(p_secret, '')), '');

  if p_provider = 'openai' then
    select k.openai_secret_id into v_existing_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid()
    for update;

    if v_existing_secret_id is not null then
      perform vault.delete_secret(v_existing_secret_id);
    end if;

    if v_trimmed is null then
      update public.user_llm_keys
      set openai_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      return;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set openai_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;

  if p_provider = 'gemini' then
    select k.gemini_secret_id into v_existing_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid()
    for update;

    if v_existing_secret_id is not null then
      perform vault.delete_secret(v_existing_secret_id);
    end if;

    if v_trimmed is null then
      update public.user_llm_keys
      set gemini_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      return;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set gemini_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;

  if p_provider = 'anthropic' then
    select k.anthropic_secret_id into v_existing_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid()
    for update;

    if v_existing_secret_id is not null then
      perform vault.delete_secret(v_existing_secret_id);
    end if;

    if v_trimmed is null then
      update public.user_llm_keys
      set anthropic_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      return;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set anthropic_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;
end;
$$;

create or replace function public.rt_get_user_llm_key_v1(p_provider text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_provider is null or p_provider not in ('openai', 'gemini', 'anthropic') then
    raise exception 'Invalid provider';
  end if;

  insert into public.user_llm_keys (user_id)
  values (auth.uid())
  on conflict do nothing;

  if p_provider = 'openai' then
    select k.openai_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid();
  elsif p_provider = 'gemini' then
    select k.gemini_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid();
  else
    select k.anthropic_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = auth.uid();
  end if;

  if v_secret_id is null then
    return null;
  end if;

  select vault.decrypt_secret(v_secret_id) into v_secret;
  return v_secret;
end;
$$;

revoke all on function public.rt_get_user_llm_key_status_v1() from public;
revoke all on function public.rt_set_user_llm_key_v1(text, text) from public;
revoke all on function public.rt_get_user_llm_key_v1(text) from public;

grant execute on function public.rt_get_user_llm_key_status_v1() to authenticated;
grant execute on function public.rt_set_user_llm_key_v1(text, text) to authenticated;
grant execute on function public.rt_get_user_llm_key_v1(text) to authenticated;

