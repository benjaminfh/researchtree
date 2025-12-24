-- Server-only reader for user LLM keys.
-- Purpose: keep secrets "arms-length" from clients by preventing authenticated users from directly retrieving plaintext keys via RPC.
-- This function is intended to be callable only by service_role (server-side).

create or replace function public.rt_get_user_llm_key_server_v1(
  p_user_id uuid,
  p_provider text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_secret text;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if p_provider is null or p_provider not in ('openai', 'gemini', 'anthropic') then
    raise exception 'Invalid provider';
  end if;

  if p_provider = 'openai' then
    select k.openai_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = p_user_id;
  elsif p_provider = 'gemini' then
    select k.gemini_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = p_user_id;
  else
    select k.anthropic_secret_id into v_secret_id
    from public.user_llm_keys k
    where k.user_id = p_user_id;
  end if;

  if v_secret_id is null then
    return null;
  end if;

  select public.rt_vault_decrypt_secret_compat_v1(v_secret_id) into v_secret;
  return v_secret;
end;
$$;

revoke all on function public.rt_get_user_llm_key_server_v1(uuid, text) from public;
revoke all on function public.rt_get_user_llm_key_server_v1(uuid, text) from anon;
revoke all on function public.rt_get_user_llm_key_server_v1(uuid, text) from authenticated;
grant execute on function public.rt_get_user_llm_key_server_v1(uuid, text) to service_role;

