-- Prevent clients from retrieving plaintext LLM keys via direct RPC.
-- Existing apps should use rt_get_user_llm_key_status_v1() for UI state and a server-side pathway for plaintext retrieval.

revoke all on function public.rt_get_user_llm_key_v1(text) from public;
revoke all on function public.rt_get_user_llm_key_v1(text) from anon;
revoke all on function public.rt_get_user_llm_key_v1(text) from authenticated;

-- Allow server-side use (optional; function owner already has rights).
grant execute on function public.rt_get_user_llm_key_v1(text) to service_role;

