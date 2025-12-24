-- Reduce attack surface: prevent direct client writes to user_llm_keys.
-- Writes should occur only via vetted RPCs (rt_set_user_llm_key_v1, etc.).

alter table public.user_llm_keys enable row level security;

-- Keep read access limited to the row owner (policy defined in 2025-12-20_0001_rt_user_llm_keys_v1.sql).
-- Remove direct INSERT/UPDATE surfaces for authenticated users.
drop policy if exists user_llm_keys_insert_self on public.user_llm_keys;
drop policy if exists user_llm_keys_update_self on public.user_llm_keys;

-- Defense in depth: revoke table write privileges for common API roles.
revoke insert, update, delete on table public.user_llm_keys from anon;
revoke insert, update, delete on table public.user_llm_keys from authenticated;

