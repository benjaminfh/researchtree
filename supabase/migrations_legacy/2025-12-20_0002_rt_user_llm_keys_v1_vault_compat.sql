-- Vault compatibility fix: some Supabase Vault installs do not expose vault.delete_secret(uuid).
-- Make rt_set_user_llm_key_v1 resilient by best-effort deleting/updating secrets.

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

    if v_trimmed is null then
      update public.user_llm_keys
      set openai_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      begin
        if v_existing_secret_id is not null then
          perform vault.delete_secret(v_existing_secret_id);
        end if;
      exception when undefined_function then
        -- ignore; not all vault installs support deletion
      end;
      return;
    end if;

    if v_existing_secret_id is not null then
      begin
        perform vault.update_secret(v_existing_secret_id, v_trimmed);
        update public.user_llm_keys
        set updated_at = now()
        where user_id = auth.uid();
        return;
      exception when undefined_function then
        -- fall through to create a new secret
      end;
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

    if v_trimmed is null then
      update public.user_llm_keys
      set gemini_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      begin
        if v_existing_secret_id is not null then
          perform vault.delete_secret(v_existing_secret_id);
        end if;
      exception when undefined_function then
      end;
      return;
    end if;

    if v_existing_secret_id is not null then
      begin
        perform vault.update_secret(v_existing_secret_id, v_trimmed);
        update public.user_llm_keys
        set updated_at = now()
        where user_id = auth.uid();
        return;
      exception when undefined_function then
      end;
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

    if v_trimmed is null then
      update public.user_llm_keys
      set anthropic_secret_id = null, updated_at = now()
      where user_id = auth.uid();
      begin
        if v_existing_secret_id is not null then
          perform vault.delete_secret(v_existing_secret_id);
        end if;
      exception when undefined_function then
      end;
      return;
    end if;

    if v_existing_secret_id is not null then
      begin
        perform vault.update_secret(v_existing_secret_id, v_trimmed);
        update public.user_llm_keys
        set updated_at = now()
        where user_id = auth.uid();
        return;
      exception when undefined_function then
      end;
    end if;

    v_new_secret_id := vault.create_secret(v_trimmed);
    update public.user_llm_keys
    set anthropic_secret_id = v_new_secret_id, updated_at = now()
    where user_id = auth.uid();
    return;
  end if;
end;
$$;

