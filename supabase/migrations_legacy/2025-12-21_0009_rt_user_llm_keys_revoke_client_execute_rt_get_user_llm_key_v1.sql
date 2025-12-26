-- Lock down client access to plaintext LLM keys.
-- This function is SECURITY DEFINER and must never be executable by anon/authenticated.

revoke execute on function public.rt_get_user_llm_key_v1(text) from public, anon, authenticated;
grant execute on function public.rt_get_user_llm_key_v1(text) to service_role;

