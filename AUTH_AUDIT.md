# Auth/AuthZ + RLS AppSec Audit

## Objective
Verify that row-level security (RLS) is correctly and comprehensively enforced for *all* user data, with special focus on:
- Message content (prompts, responses, chat/history)
- LLM token accounting/usage (billing, quotas, metering)
- User secrets (API keys, OAuth tokens, credentials, encrypted blobs)

## Scope
This audit covers:
- Postgres schemas/tables/views/functions/triggers related to user data
- AuthN/AuthZ mechanisms that determine DB role/claims/tenant context
- All application code paths that read/write user data (server routes, edge functions, background jobs)
- Any “service role” paths that could bypass RLS

## Plan (Execution Steps)
1. **Map auth model and roles**
   - Identify identity model (user/org/team) and how tenant scoping is represented.
   - Enumerate DB roles and runtime credentials used by each component.
2. **Inventory user-data tables/fields**
   - Enumerate all tables/views/materialized views holding user data.
   - Classify sensitive fields: message content, LLM prompts/responses, token ledgers, secrets.
3. **Verify RLS enabled everywhere**
   - For each in-scope table, confirm RLS is enabled (and forced where appropriate).
   - Identify any security-definer functions/views that could re-expose data.
4. **Review policies per table**
   - Audit policies for SELECT/INSERT/UPDATE/DELETE by role.
   - Confirm strict tenant scoping and least-privilege; scrutinize admin/service exceptions.
5. **Trace all data access paths**
   - Trace all code paths accessing sensitive tables.
   - Confirm requests run under end-user context when intended; ensure service-role access has explicit tenant checks.
6. **Probe with cross-tenant tests**
   - Attempt cross-tenant reads/writes for each sensitive surface (direct + indirect/list/search/export).
   - Validate error modes don’t leak data via side channels (counts, timing, error messages).
7. **Write findings and remediation**
   - Produce table-by-table coverage report, severity, exploit narratives, and concrete fixes.
   - Re-test checklist for validating remediations.

## Audit Notes (Live)
### Step 1 — Auth model and roles (completed)
- Auth provider: Supabase Auth (`@supabase/ssr`, `@supabase/supabase-js`).
- Primary end-user DB context: cookie-backed Supabase session via anon key (`createSupabaseServerClient()`), so requests operate as `authenticated` role and should be constrained by RLS.
- Service-role usage (RLS-bypassing): present and appears confined to waitlist/admin flows (`SUPABASE_SERVICE_ROLE_KEY`).
  - `middleware.ts` calls Supabase REST directly with the service role to check `email_allowlist` during waitlist enforcement.
  - `src/server/waitlist.ts` uses `createSupabaseAdminClient()` (service role) to manage allowlist/waitlist tables.
- Tenant model (so far): per-project membership (`projects.owner_user_id`, `project_members.user_id`) and RLS predicates built on `auth.uid()`. No org/team layer observed yet.

### Step 2 — Inventory user-data tables/fields (completed)
Tables created in Supabase migrations (public schema), with sensitivity tags:
- `public.projects` (tenant container; `owner_user_id`, metadata)
- `public.project_members` (membership / authz state)
- `public.refs` (branch metadata)
- `public.commits` (**message content**: `message`; attribution: `author_user_id`)
- `public.nodes` (**message content**: `content_json`; also includes `role`, `kind`)
- `public.artefacts` (derived content / user work product)
- `public.artefact_drafts` (draft content; per-user)
- `public.stars` (user interaction signal)
- `public.commit_order` (ordering metadata)
- `public.project_user_prefs` (per-user preferences)
- `public.user_llm_keys` (**user secrets metadata**: stores vault secret UUID references)
- `vault` schema via `supabase_vault` extension (**user secrets** stored/managed by Vault)
- `public.email_allowlist` (emails; allowlist for auth gate)
- `public.waitlist_requests` (emails + status; auth gate workflow)

Not yet observed in DB schema (needs confirmation):
- Dedicated LLM token accounting/ledger tables (token usage appears handled in-app, not persisted in DB so far).

### Step 3 — Verify RLS enabled everywhere (completed)
RLS enablement observed in migrations for all `public` tables created by this repo:
- Provenance: `projects`, `project_members`, `refs`, `commits`, `nodes`, `artefacts`, `stars`, `commit_order`
- User-scoped: `artefact_drafts`, `project_user_prefs`, `user_llm_keys`
- Auth gate: `email_allowlist`, `waitlist_requests`

Notes:
- No `disable row level security` found in migrations.
- No `force row level security` found in migrations (meaning table owners / SECURITY DEFINER functions may bypass RLS and must enforce tenant checks internally).
- No SQL views/materialized views found in migrations (reduces one common RLS footgun).

### Step 4 — Review policies per table (completed)
High-level policy model observed:
- Provenance tables are tenant-scoped by `project_id` via `public.rt_is_project_member(project_id)` checks.
- User-scoped tables use `user_id = auth.uid()` (and sometimes membership checks too, e.g. `project_user_prefs`).

Areas requiring deeper review/tests:
- `public.user_llm_keys` allows `update` on the caller’s row without restricting which columns can change (see findings below for secret UUID capability concerns).
- Supabase Vault access: repo adds a generic Vault decrypt compatibility helper RPC (see findings below).

Policy snapshot (from migrations; needs DB confirmation that migrations are applied):
- `public.projects` (RLS: yes) — `select` member; `insert/update` owner.
- `public.project_members` (RLS: yes) — `select` self; `insert` owner-self only.
- `public.refs` (RLS: yes) — `select/insert/update` member.
- `public.commits` (RLS: yes) — `select/insert` member.
- `public.nodes` (RLS: yes) — `select/insert` member.
- `public.artefacts` (RLS: yes) — `select/insert` member.
- `public.stars` (RLS: yes) — `select/insert/delete` member.
- `public.commit_order` (RLS: yes) — `select/insert` member.
- `public.artefact_drafts` (RLS: yes) — `select/insert/update` `user_id = auth.uid()` (no membership check).
- `public.project_user_prefs` (RLS: yes) — `select/insert/update` `user_id = auth.uid()` AND `rt_is_project_member(project_id)`.
- `public.user_llm_keys` (RLS: yes) — `select/insert/update` `user_id = auth.uid()` (see secret UUID concerns).
- `public.email_allowlist` (RLS: yes) — no policies defined (effectively deny-by-default for anon/authenticated).
- `public.waitlist_requests` (RLS: yes) — no policies defined (effectively deny-by-default for anon/authenticated).

### Step 5 — Trace all data access paths (completed)
Observed Supabase access patterns in application code:
- End-user context (RLS-enforced): `createSupabaseServerClient()` is used across API routes/server components to read `projects`, `refs`, `nodes`, and `project_members`, and to call most RPCs.
- Service role (RLS-bypassing): `createSupabaseAdminClient()` is used only in waitlist/admin flows (`src/server/waitlist.ts`), plus `middleware.ts` uses a direct REST call with `SUPABASE_SERVICE_ROLE_KEY` for allowlist checks.

RPC inventory (called from app code via end-user Supabase client):
- Provenance writes: `rt_create_project`, `rt_append_node_to_ref_v1`, `rt_create_ref_from_node_parent_v1`, `rt_create_ref_from_ref_v1`, `rt_merge_ours_v1`, `rt_toggle_star_v1`, `rt_update_artefact_on_ref`, `rt_save_artefact_draft`, `rt_get_current_ref_v1`, `rt_set_current_ref_v1`
- Provenance reads: `rt_get_history_v1`, `rt_get_canvas_v1`, `rt_list_refs_v1`, `rt_get_starred_node_ids_v1`
- User secrets: `rt_get_user_llm_key_status_v1`, `rt_set_user_llm_key_v1`, `rt_get_user_llm_key_v1`

Message content surfaces and access:
- Stored in `public.nodes.content_json` and `public.commits.message`; read primarily via SECURITY DEFINER read RPCs (`rt_get_history_v1`, `rt_get_canvas_v1`) plus one direct table read in `app/api/projects/[id]/edit/route.ts` (`from('nodes').select('content_json')`), relying on RLS and `requireProjectAccess`.

User secrets surfaces and access:
- Stored as Vault secret UUIDs in `public.user_llm_keys`; decrypted via SECURITY DEFINER RPC `rt_get_user_llm_key_v1` (used by `/api/profile/llm-keys` and by LLM request handlers via `requireUserApiKeyForProvider()`).

### Step 6 — Cross-tenant test plan (in progress)
Goal: confirm that user A’s data is not readable/mutable by user B under any supported access path (direct table reads, RPC reads/writes, and Vault secret access).

Setup
- Create two test users: A and B (non-admin), in a non-production Supabase project.
- As A: create one project; generate at least 1 user message and 1 assistant message; save a canvas artefact/draft; configure one provider key via Profile (so a Vault secret exists).

RLS / data isolation checks (as B)
- Projects: `select` on `public.projects` with A’s `project_id` should return no rows (and `requireProjectAccess`-style checks should fail).
- Message content:
  - Direct: `select content_json from public.nodes where project_id = <A> ...` should return no rows.
  - RPC: `rt_get_history_v1(<A project_id>, 'main', ...)` should error `Not authorized` (or return nothing) and must not leak node JSON.
  - RPC: `rt_get_canvas_v1(<A project_id>, 'main', ...)` should error `Not authorized` (or return empty) and must not leak artefact content.
- Drafts/prefs: verify `artefact_drafts` and `project_user_prefs` do not leak A’s content (and inserts into A’s project are rejected if that is the intended policy).

Secrets / Vault isolation checks (as B)
- `rt_get_user_llm_key_v1('openai'|'gemini'|'anthropic')` should return only B’s own secret (null if unset).
- Attempt to call `rt_vault_decrypt_secret_compat_v1(<A secret UUID>)` (if obtainable in test) must fail or return null; if it returns plaintext, this is a critical break.
- Attempt to update B’s `user_llm_keys.*_secret_id` to A’s secret UUID (if direct table updates are permitted) then call `rt_get_user_llm_key_v1(...)`; must not disclose A’s secret.

## Live Verification Needed
- Confirm actual DB state in the deployed Supabase project: migrations applied, RLS enabled, grants/privileges, and presence of `vault` objects (varies by Supabase version).
- Execute the cross-tenant tests above in a non-prod environment to validate the Vault ownership assumptions behind `rt_vault_decrypt_secret_compat_v1` and the `user_llm_keys` update policy.

## AUDIT FINDING TODOs
- [ ] Confirm waitlist enforcement is not bypassable: `middleware.ts` allowlist check currently fails open (`res.ok` false ➜ allow). Decide desired fail-closed vs fail-open behavior and threat model.
- [ ] Verify `/admin/waitlist` access control: ensure only intended admins can invoke service-role operations (server-side authz + no client exposure).
- [ ] Confirm no other service-role usage exists (beyond `middleware.ts` and `src/server/waitlist.ts`), including any hidden runtime config or edge functions.
- [ ] Evaluate admin identity trust: admin gating uses `RT_ADMIN_EMAILS` vs roles/claims; confirm email verification assumptions and threat model for email changes.
- [ ] Validate `public.user_llm_keys` RLS policy safety: `user_llm_keys_update_self` appears to allow setting `*_secret_id` to arbitrary UUIDs on the user’s row; assess whether this could be abused to decrypt other Vault secrets if an attacker obtains/guesses a secret UUID.
- [ ] Confirm production store selection: `RT_STORE=git` stores provenance/messages on disk (not governed by Postgres RLS); ensure prod uses `RT_STORE=pg` if RLS is a requirement for protecting message content.
- [ ] Urgent: assess `public.rt_vault_decrypt_secret_compat_v1(uuid)` (added in `supabase/migrations/2025-12-21_0003_rt_user_llm_keys_v1_read_vault_compat.sql`) — it is `SECURITY DEFINER` and is granted to `authenticated` but appears to accept an arbitrary secret UUID and return decrypted secret; confirm whether Vault enforces per-user ownership internally, and if not, treat as a vault-wide secret disclosure vector.
- [ ] Review `public.artefact_drafts` policies: insert/select/update are gated only by `user_id = auth.uid()` (no `rt_is_project_member(project_id)` check), which may allow cross-project draft insertion if an attacker learns a `project_id` (side-channel/DoS risk).

# Preliminary Findings (Static)
These are based on repo/migrations review (not yet validated against a live DB).

## High / Critical
- **Potential vault-wide secret disclosure via helper RPC**: `public.rt_vault_decrypt_secret_compat_v1(uuid)` is `SECURITY DEFINER`, granted to `authenticated`, and appears to attempt multiple Vault read APIs for an arbitrary secret UUID without enforcing ownership in the wrapper. If Vault ownership is enforced only by RLS/privileges that the definer bypasses, this could allow any authenticated user to decrypt secrets outside their account.
- **Secret UUID capability risk**: `public.user_llm_keys` allows callers to `update` their row; if direct updates are permitted, a user could set `*_secret_id` columns to a UUID they control/obtained and then use `rt_get_user_llm_key_v1(...)` to decrypt it. Impact depends on whether secret UUIDs can be discovered and whether Vault enforces per-user ownership independent of RLS.

## Medium
- **Waitlist auth gate fail-open**: `middleware.ts` allowlist check returns `true` on non-OK response (network/permission errors) which bypasses enforced waitlist gating.
- **Cross-project artefact draft insertion**: `public.artefact_drafts` policies do not enforce project membership, allowing inserts for any existing `project_id` if known (integrity/DoS/side-channel risk).

## Low / Informational
- **No persisted token ledger observed**: token budgeting appears computed in-app; confirm whether future requirements include persistent LLM usage accounting (and if so, ensure RLS is applied).

## Remediation Recommendations
- **Secrets: remove generic decrypt surface**
  - Prefer: do not grant `execute` on `rt_vault_decrypt_secret_compat_v1` to `authenticated` (keep it callable only from inside other SECURITY DEFINER functions, or eliminate it entirely).
  - Ensure any decryption path is bound to `auth.uid()` and to a secret reference that the caller cannot arbitrarily control.
- **Secrets: harden `user_llm_keys` against secret-id swapping**
  - Consider revoking direct `insert/update` access to `public.user_llm_keys` for `authenticated` (and/or removing `user_llm_keys_insert_self` / `user_llm_keys_update_self` policies) so only the vetted RPCs can mutate secret references.
  - Alternatively, add enforcement (trigger/constraint or stricter policy) that prevents setting `*_secret_id` to values not created/owned by the current user (requires understanding Vault schema and guarantees).
- **Drafts: enforce project membership**
  - Update `public.artefact_drafts` policies to include `public.rt_is_project_member(project_id)` (matching `project_user_prefs`) or force all draft writes through the existing RPCs that already check membership.
- **Waitlist gate: fail closed**
  - Make `middleware.ts` allowlist checks fail closed (or degrade to a safe “blocked” state) when Supabase is unreachable or returns non-OK responses.
- **Validation**
  - Add an automated cross-tenant regression test suite (staging-only) for `projects/nodes/artefacts/user_llm_keys` and for the Vault decryption path.

# AUDIT TODO LIST
- [ ] Identify auth provider, JWT claims, and tenant model (user/org/team).
- [ ] Enumerate DB roles (anon/authenticated/service) and where each is used in code.
- [ ] List all user-data tables/views/functions; tag message content, token ledgers, secrets.
- [ ] For each user-data table: verify RLS enabled; flag any missing/disabled tables.
- [ ] For each user-data table: enumerate policies for CRUD and validate tenant scoping.
- [ ] Review views/functions/triggers for security-definer/RLS-bypass patterns.
- [ ] Trace all app data access paths; confirm they don’t use service role unnecessarily.
- [ ] Identify and audit any service-role usages; ensure explicit tenant checks + logging.
- [ ] Run cross-tenant negative tests for messages, token/accounting, secrets, and attachments.
- [ ] Document findings with severity + recommended fixes; prepare a re-test checklist.
