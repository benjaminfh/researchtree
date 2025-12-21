-- Vault compatibility fix: some Supabase Vault installs do not expose vault.decrypt_secret(uuid).
-- Provide a best-effort reader and update rt_get_user_llm_key_v1 to use it.

create or replace function public.rt_vault_decrypt_secret_compat_v1(p_secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if p_secret_id is null then
    return null;
  end if;

  -- Newer Vault API.
  begin
    execute 'select vault.decrypt_secret($1)' into v_secret using p_secret_id;
    return v_secret;
  exception when undefined_function then
    null;
  end;

  -- Some installs expose a decrypted_secrets view.
  begin
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where id = $1' into v_secret using p_secret_id;
      return v_secret;
    exception when undefined_column then
      execute 'select secret from vault.decrypted_secrets where id = $1' into v_secret using p_secret_id;
      return v_secret;
    end;
  exception when undefined_table then
    null;
  end;

  -- Some installs expose a read_secret() function.
  begin
    execute 'select vault.read_secret($1)' into v_secret using p_secret_id;
    return v_secret;
  exception when undefined_function then
    null;
  end;

  -- Some installs expose a read_secret() function returning JSON.
  begin
    execute 'select (vault.read_secret($1))::jsonb ->> ''secret''' into v_secret using p_secret_id;
    if v_secret is not null then
      return v_secret;
    end if;
  exception when undefined_function or cannot_coerce or invalid_text_representation then
    null;
  end;

  -- Some installs expose a get_secret() function returning JSON.
  begin
    execute 'select (vault.get_secret($1))::jsonb ->> ''secret''' into v_secret using p_secret_id;
    if v_secret is not null then
      return v_secret;
    end if;
  exception when undefined_function or cannot_coerce or invalid_text_representation then
    null;
  end;

  -- Some installs expose a get_secret() function returning a record with a "secret" field.
  begin
    execute 'select (vault.get_secret($1)).secret' into v_secret using p_secret_id;
    return v_secret;
  exception when undefined_function or undefined_column then
    null;
  end;

  raise exception 'Vault secret read is not supported by this Supabase Vault install';
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

  select public.rt_vault_decrypt_secret_compat_v1(v_secret_id) into v_secret;
  return v_secret;
end;
$$;

revoke all on function public.rt_vault_decrypt_secret_compat_v1(uuid) from public;
grant execute on function public.rt_vault_decrypt_secret_compat_v1(uuid) to authenticated;
