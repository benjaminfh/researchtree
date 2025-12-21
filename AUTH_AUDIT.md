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
- Service-role usage (RLS-bypassing): present and limited to (a) waitlist/admin flows and (b) server-only plaintext LLM key reads (`SUPABASE_SERVICE_ROLE_KEY`).
  - `middleware.ts` calls Supabase REST directly with the service role to check `email_allowlist` during waitlist enforcement.
  - `src/server/waitlist.ts` uses `createSupabaseAdminClient()` (service role) to manage allowlist/waitlist tables.
  - `src/store/pg/userLlmKeys.ts` uses `createSupabaseAdminClient()` (service role) to call `rt_get_user_llm_key_server_v1` (server-only plaintext key retrieval).
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
- `public.user_llm_keys` (RLS: yes) — `select` `user_id = auth.uid()`; direct `insert/update` removed (writes via RPC only).
- `public.email_allowlist` (RLS: yes) — no policies defined (effectively deny-by-default for anon/authenticated).
- `public.waitlist_requests` (RLS: yes) — no policies defined (effectively deny-by-default for anon/authenticated).

### Step 5 — Trace all data access paths (completed)
Observed Supabase access patterns in application code:
- End-user context (RLS-enforced): `createSupabaseServerClient()` is used across API routes/server components to read `projects`, `refs`, `nodes`, and `project_members`, and to call most RPCs.
- Service role (RLS-bypassing): used for (a) waitlist/admin flows (`src/server/waitlist.ts`), (b) server-only plaintext LLM key retrieval (`src/store/pg/userLlmKeys.ts`), and (c) `middleware.ts` direct REST allowlist checks (`SUPABASE_SERVICE_ROLE_KEY`).

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
- [x] Fix waitlist gate fail-open in `middleware.ts` (fail closed on allowlist lookup failure/timeout).
- [x] Verify waitlist gate behavior in a live deploy: non-allowlisted emails cannot create an account (operator-confirmed). (Still pending: simulate allowlist lookup failure and confirm fail-closed.)
- [x] Verify `/admin/waitlist` access control: only users in `RT_ADMIN_USER_IDS` can access (operator-confirmed).
- [x] Confirm no other service-role usage exists beyond documented call sites (code search: `createSupabaseAdminClient()` / `SUPABASE_SERVICE_ROLE_KEY`).
- [x] Evaluate admin identity trust: `RT_ADMIN_USER_IDS` gates only `/admin/waitlist` app access (does not elevate DB role/RLS); residual risk accepted under “Vercel prod compromise ⇒ total compromise” assumption.
- [x] Remove direct INSERT/UPDATE surface on `public.user_llm_keys` (force writes through RPCs; reduces PF-2 blast radius).
- [x] Confirm production store selection risk is not applicable: Vercel production cannot use Git-backed store for message content; Postgres-backed store is effectively required.
- [x] PF-1 confirmed: `public.rt_vault_decrypt_secret_compat_v1(uuid)` allows arbitrary Vault secret decryption by any authenticated user.
- [x] Apply mitigation migration `supabase/migrations/2025-12-21_0006_rt_vault_decrypt_helper_lockdown.sql` in Supabase and verify `authenticated` can no longer execute it.
- [x] Apply follow-up: revoke client plaintext key reader (`supabase/migrations/2025-12-21_0008_rt_user_llm_keys_revoke_client_plaintext_reader.sql`) and use service-role-only server reader (`supabase/migrations/2025-12-21_0007_rt_user_llm_keys_server_reader_v1.sql`).
- [x] Require project membership for `public.artefact_drafts` policies (prevents cross-project draft insertion).
- [x] Verify `public.artefact_drafts` membership enforcement in live DB after applying migrations (policy predicates confirmed via `pg_policies`).

# Preliminary Findings (Static)
These are based on repo/migrations review (not yet validated against a live DB).

## High / Critical
- **Potential vault-wide secret disclosure via helper RPC**: `public.rt_vault_decrypt_secret_compat_v1(uuid)` is `SECURITY DEFINER`, granted to `authenticated`, and appears to attempt multiple Vault read APIs for an arbitrary secret UUID without enforcing ownership in the wrapper. If Vault ownership is enforced only by RLS/privileges that the definer bypasses, this could allow any authenticated user to decrypt secrets outside their account.
- **Secret UUID capability risk (mitigated; pending verification)**: previously, if direct updates were permitted, a user could set `public.user_llm_keys.*_secret_id` to an arbitrary UUID and then use `rt_get_user_llm_key_v1(...)` to decrypt it. Direct table INSERT/UPDATE for `authenticated` is now removed via migration; remaining risk depends primarily on PF-1.

## Medium
- **Waitlist auth gate fail-open (fixed in repo; pending deploy verification)**: `middleware.ts` allowlist check used to return `true` on non-OK response (network/permission errors), bypassing enforced waitlist gating.
- **Cross-project artefact draft insertion**: `public.artefact_drafts` policies do not enforce project membership, allowing inserts for any existing `project_id` if known (integrity/DoS/side-channel risk).

## Low / Informational
- **No persisted token ledger observed**: token budgeting appears computed in-app; confirm whether future requirements include persistent LLM usage accounting (and if so, ensure RLS is applied).

## Finding Details (Static)
### PF-1 — Vault decrypt helper RPC may be over-broad (Critical, if exploitable)
What it is
- `supabase/migrations/2025-12-21_0003_rt_user_llm_keys_v1_read_vault_compat.sql` adds `public.rt_vault_decrypt_secret_compat_v1(p_secret_id uuid) returns text` as `SECURITY DEFINER` and grants `execute` to `authenticated`.
- The function takes an arbitrary UUID and attempts several Vault “read/decrypt” APIs until one works, then returns plaintext.

Why it matters
- A generic “decrypt-by-UUID” capability is extremely high risk if the underlying Vault API calls do not enforce caller ownership/authorization in a way that is not bypassed by `SECURITY DEFINER`.

Exploit sketch (if Vault doesn’t enforce ownership independently)
- Attacker (any authenticated user) obtains a victim’s secret UUID (from logs, error messages, accidental exposure, backups, etc.).
- Attacker calls `rt_vault_decrypt_secret_compat_v1(<victim_uuid>)` and receives plaintext secret.

What must be verified to confirm/refute
- Whether each Vault access path used by the helper enforces per-secret authorization independently (not merely via table/view RLS that a definer might bypass).
- Function owner/definer and privilege model in the actual Supabase project (who owns this function after migration apply).

Recommended direction (even if “not exploitable”)
- Remove/avoid granting a generic decrypt-by-UUID function to `authenticated`; keep decryption bound to the current user and to a secret reference that the caller cannot arbitrarily set.

Status (confirmed)
- Confirmed exploitable in live Supabase: `public.rt_vault_decrypt_secret_compat_v1(uuid)` is `SECURITY DEFINER`, owned by `postgres`, and executable by `anon`/`authenticated`; any authenticated user can decrypt arbitrary Vault secrets by UUID (plaintext returned).
- Immediate mitigation added in repo: `supabase/migrations/2025-12-21_0006_rt_vault_decrypt_helper_lockdown.sql` revokes `EXECUTE` from `public/anon/authenticated` (keeps `service_role`).
- Follow-up hardening added in repo: secrets are now “server arms-length” by revoking client `EXECUTE` on plaintext reader `rt_get_user_llm_key_v1(text)` and adding a service-role-only reader `rt_get_user_llm_key_server_v1(uuid,text)`; app server code uses the service role to fetch plaintext keys.
- Mitigations applied to Supabase (operator-confirmed): `0006` + `0007` + `0008`.

### PF-2 — `user_llm_keys` secret-id swapping (High, defense-in-depth)
What it is
- `public.user_llm_keys` has RLS that allows `update` where `user_id = auth.uid()`; RLS does not restrict which columns can be updated.
- This means the caller may be able to set `openai_secret_id/gemini_secret_id/anthropic_secret_id` to an arbitrary UUID (depending on table/column privileges in the live DB).

Why it matters
- If a user can set their `*_secret_id` to some other user’s secret UUID, any “read my secret” function becomes a potential confused-deputy.
- Risk amplifies if PF-1 is exploitable (or if any other decrypt-by-UUID path exists).

Verification steps
- Confirm actual table privileges for `authenticated` on `public.user_llm_keys` (especially UPDATE).
- Attempt the swap+read scenario described in Step 6 test plan in a non-prod environment.

Status
- Mitigation added in repo: `supabase/migrations/2025-12-21_0005_rt_user_llm_keys_remove_direct_write_policies.sql` drops direct INSERT/UPDATE RLS policies and revokes table write privileges for `anon`/`authenticated` (forces writes through RPCs).
- Migration applied to Supabase (operator-confirmed).

Verification checklist (run in Supabase SQL editor)
- Confirm policies no longer include direct insert/update policies:
  - `select policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename = 'user_llm_keys' order by policyname;`
  - Expect only the `SELECT` policy (`user_llm_keys_select_self`).
- Confirm table-level privileges are reduced:
  - `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='user_llm_keys' order by grantee, privilege_type;`
  - Expect `authenticated` does not have INSERT/UPDATE/DELETE on `public.user_llm_keys`.

### PF-3 — Waitlist allowlist check fails open (Medium)
What it is
- `middleware.ts` uses the service role to query `email_allowlist`, but returns allowlisted=true when the HTTP response is non-OK.

Why it matters
- A transient Supabase outage, misconfiguration, or permission issue can convert an “invite-only” gate into “open sign-in” (availability → authz bypass).

Verification steps
- Decide desired behavior (fail-closed for AppSec) and confirm deploy monitoring/alerts for this path.

Status
- Fixed in repo: `middleware.ts` now fails closed on allowlist lookup errors/timeouts and also fails closed when `RT_WAITLIST_ENFORCE=true` but `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` are missing (admins bypass via `RT_ADMIN_USER_IDS`).
- Pending: verify in a live deploy (including behavior under transient Supabase failure).

### PF-4 — `artefact_drafts` policies do not enforce project membership (Medium)
What it is
- `supabase/migrations/2025-12-19_0005_rt_artefact_drafts.sql` gates by `user_id = auth.uid()` only (no `rt_is_project_member(project_id)`).

Why it matters
- Enables writing draft rows into any existing project namespace if `project_id` is known (integrity/DoS/abuse). Likely not a confidentiality issue by itself.

Status
- Fixed in repo via `supabase/migrations/2025-12-21_0004_rt_artefact_drafts_require_membership.sql` (adds `public.rt_is_project_member(project_id)` to select/insert/update policies).
- Migration applied to Supabase (operator-confirmed).
- Pending: verify behavior in the live Supabase project (see verification checklist below).

Verification checklist (run in Supabase SQL editor)
- Confirm policies include membership:
  - `select polname, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'artefact_drafts' order by polname;`
  - Expect `user_id = auth.uid()` AND `public.rt_is_project_member(project_id)` in `qual` / `with_check` for select/insert/update.
- Negative test (user B, not a member of project A):
  - `select set_config('request.jwt.claims', json_build_object('sub','<B_UUID>','role','authenticated')::text, true);`
  - `set local role authenticated;`
  - Attempt insert into A’s project: should be blocked by RLS.
- Positive test (user A, member of project A): same insert should succeed.

Verified (operator evidence)
- `pg_policies` now shows `artefact_drafts_select_owner`, `artefact_drafts_write_owner`, and `artefact_drafts_update_owner` predicates include both `user_id = auth.uid()` and `rt_is_project_member(project_id)`.

### PF-5 — No LLM token ledger tables found (Low/Info)
What it is
- No DB tables found for token usage/metering; token budgeting appears computed in-app.

Why it matters
- If you later add persistent token accounting, it becomes a new sensitive surface that must be RLS-protected.

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
- [x] Identify auth provider and tenant model (user/org/team).
- [x] Identify JWT claims used for authz/RLS decisions.
- [x] Enumerate DB roles (anon/authenticated/service) and where each is used in code.
- [x] List all user-data tables/views/functions; tag message content, token ledgers, secrets.
- [x] For each user-data table: verify RLS enabled; flag any missing/disabled tables.
- [x] For each user-data table: enumerate policies for CRUD and validate tenant scoping.
- [x] Review views/functions/triggers for security-definer/RLS-bypass patterns.
- [x] Trace all app data access paths; confirm they don’t use service role unnecessarily.
- [x] Identify and audit any service-role usages; ensure explicit tenant checks + logging.
- [ ] Run cross-tenant negative tests for messages, token/accounting, secrets, and attachments.
- [x] Document findings with severity + recommended fixes; prepare a re-test checklist.

JWT claims usage summary (static)
- Database/RLS: no usage of `auth.jwt()` or `auth.role()` found in `supabase/migrations/**`; policies and RPCs primarily use `auth.uid()` and membership tables (`project_members`).
- Application authz: uses Supabase session user fields from `supabase.auth.getUser()` (not custom JWT claims):
  - `user.id` for admin allowlist (`RT_ADMIN_USER_IDS`) and for membership filtering.
  - `user.email` used only for UX/display and for the email allowlist gate input (not for admin authz).
