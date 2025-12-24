-- Critical fix: remove public access to generic Vault secret decryption helper.
-- `rt_vault_decrypt_secret_compat_v1(uuid)` is SECURITY DEFINER owned by postgres and must not be callable by anon/authenticated.
-- It should only be invoked internally by user-bound RPCs (e.g. rt_get_user_llm_key_v1).

revoke all on function public.rt_vault_decrypt_secret_compat_v1(uuid) from public;
revoke all on function public.rt_vault_decrypt_secret_compat_v1(uuid) from anon;
revoke all on function public.rt_vault_decrypt_secret_compat_v1(uuid) from authenticated;

-- Ensure privileged roles retain access (defensive; function owner already has it).
grant execute on function public.rt_vault_decrypt_secret_compat_v1(uuid) to service_role;

