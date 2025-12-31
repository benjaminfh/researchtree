# PG Refs Migration: ref_id Introduction + Cutover

Goal: introduce immutable `refs.id` and migrate all side-car tables and RPCs to use `ref_id`, so ref renames are safe and do not orphan history/drafts/prefs.

Principles:
- Keep data loss at zero.
- Prefer fewer phases, but enforce clear verification gates.
- Cut over RPCs and app call sites to `ref_id` everywhere before cleanup.
- Avoid RPC signature churn pitfalls; use versioned RPCs when in doubt.

## Phase 0: Inventory + Fixture (Prep)

Actions:
- Build an inventory of every schema object and code path that uses `ref_name` or `refs.name`.
  - Tables: `commit_order`, `artefact_drafts`, `artefacts`, `project_user_prefs`, plus any others found by grep.
  - RPCs: all `rt_*` functions that accept or join on `ref_name`.
  - App/server: all `refName` fields in `src/store/pg/*`, API routes, UI state, local adapter, tests.
- Create a dev fixture dataset (one project, multiple refs, multiple nodes per ref).
  - Include at least: drafts, artefacts, current_ref_name, merge nodes.

Inventory (initial, update as you discover more):
- Tables: `public.refs`, `public.commit_order`, `public.artefact_drafts`, `public.artefacts`, `public.project_user_prefs`.
- RPCs (from `src/store/pg/localAdapter.ts`): `rt_get_history_v1`, `rt_get_canvas_v1`, `rt_get_canvas_hashes_v1`,
  `rt_get_canvas_pair_v1`, `rt_append_node_to_ref_v1`, `rt_create_ref_from_node_parent_v1`, `rt_create_ref_from_ref_v1`,
  `rt_get_current_ref_v1`, `rt_set_current_ref_v1`, `rt_get_ref_previous_response_id_v1`,
  `rt_set_ref_previous_response_id_v1`, `rt_update_artefact_on_ref`, `rt_save_artefact_draft`, `rt_merge_ours_v1`.
- App/server files:
  - Store/PG: `src/store/pg/branches.ts`, `src/store/pg/reads.ts`, `src/store/pg/nodes.ts`, `src/store/pg/artefacts.ts`,
    `src/store/pg/drafts.ts`, `src/store/pg/refs.ts`, `src/store/pg/merge.ts`, `src/store/pg/localAdapter.ts`.
  - Server: `src/server/context.ts`, `src/server/llm.ts`, `src/server/llmState.ts`, `src/server/canvasTools.ts`,
    `src/server/schemas.ts`.
  - API routes: `app/api/projects/[id]/branches/route.ts`, `app/api/projects/[id]/history/route.ts`,
    `app/api/projects/[id]/graph/route.ts`, `app/api/projects/[id]/artefact/route.ts`,
    `app/api/projects/[id]/merge/route.ts`, `app/api/projects/[id]/merge/pin-canvas-diff/route.ts`,
    `app/api/projects/[id]/chat/route.ts`, `app/api/projects/[id]/edit/route.ts`.
  - UI: `app/projects/[id]/page.tsx`, `app/page.tsx`.
- Tests: `tests/store/pg/local-adapter.test.ts`, `tests/store/pg/local-adapter.integration.test.ts`,
  `tests/store/pg/pg-store.test.ts`, `tests/server/*.test.ts`.
- Supabase migrations (current, non-legacy):
  - `supabase/migrations/20251224075742_remote_schema.sql`
  - `supabase/migrations/20251224141610_002_rt_refs_llm_config.sql`
  - `supabase/migrations/20251225606420_001_rt_refs_previous_response_id.sql`
  - `supabase/migrations/20251227080848_canvas_hash_compare.sql`
  - `supabase/migrations/20251229035316_rt_get_history_strip_raw_response.sql`
- Legacy migrations (still reference `ref_name`):
  - `supabase/migrations_legacy/2025-12-19_*.sql` (search for `ref_name`).
- Hit list (Phase 0 output): `PM_DOCS/ref_name_hits.txt` (keep this file updated if new hits appear).

Fixture dataset:
- `supabase/fixtures/pg_refs_fixture.sql` (project with 3 refs, multi-node histories, drafts, prefs, artefacts).

Verification:
- `rg -n "ref_name|refName|refs\\.name" src supabase -S` inventory is complete.
- Fixture queries return expected counts per ref.

Risks:
- Missing a call site or SQL function leads to mixed ref_name/ref_id usage.
- RPC schema cache can hide signature updates in Supabase.

## Phase 1: Add ref_id (Schema + Backfill, Non-Breaking)

Actions (single migration):
1) Add `refs.id uuid` (nullable for now) and backfill:
   - `update public.refs set id = gen_random_uuid() where id is null;`
2) Add `ref_id uuid` columns to side-car tables:
   - `commit_order`, `artefact_drafts`, `artefacts`, `project_user_prefs`, and any others from Phase 0.
3) Backfill side-cars:
   - `update <table> t set ref_id = r.id from public.refs r where t.project_id = r.project_id and t.ref_name = r.name;`
4) Add indexes for `(project_id, ref_id, ...)` where they mirror existing `(project_id, ref_name, ...)` indexes.

Verification:
- `select count(*) from refs where id is null` -> 0
- For each side-car table:
  - `select count(*) from <table> where ref_id is null and ref_name is not null` -> 0
  - Row counts per ref remain unchanged.

Risks:
- Backfill join mismatch (e.g., missing refs) results in null `ref_id`.
- Concurrency: new writes during migration must be blocked or performed after migration completes.

## Phase 2: RPC + App Cutover (Dual-Read/Write, Then Flip)

Actions:
1) Update RPCs to accept `ref_id` (versioned RPCs recommended):
   - Add `rt_*_v2` with `p_ref_id` params.
   - Internally use `ref_id` joins for all lookups and writes.
   - For writes, set both `ref_id` and legacy `ref_name` during the transition.
2) Update app/store code to call the `*_v2` RPCs and pass `ref_id`.
   - `src/store/pg/*` and `src/store/pg/localAdapter.ts`.
   - Any API routes or UI state that still use `refName`.
3) Update data payloads returned to clients to include `ref_id`.
4) Add a guardrail check in the backend to reject writes missing `ref_id` once cutover is complete.

Verification:
- All RPC calls in app use `ref_id`.
- `rg -n "p_ref_name|refName|ref_name" src -S` returns only legacy helpers or migration code.
- End-to-end flows pass: create branch, append, merge, drafts, current ref.

Risks:
- RPC cache: ensure PostgREST schema reload (`select pg_notify('pgrst','reload schema');`).
- Mixed writes: some paths still using legacy `ref_name`.

## Phase 3: Cleanup (ref_name Removal + Canonical ref_id)

Actions (migration):
1) Drop legacy `ref_name` columns from side-car tables.
2) Drop or rename legacy indexes/constraints; promote `(project_id, ref_id, ...)` as primary/unique keys.
3) Make `refs.id` `NOT NULL` and primary key (or unique with `(project_id, id)`).
4) Keep `refs.name` as the mutable label; all joins use `ref_id`.
5) Add `projects.pinned_ref_id uuid` with FK to `(project_id, refs.id)`.

Verification:
- Schema has no `ref_name` columns in side-cars.
- All queries and RPCs rely on `ref_id`.
- Pinning works via `pinned_ref_id`.

Risks:
- Dropping columns too early breaks any remaining legacy clients.
- Missing FK/index updates can cause regressions in query performance.

## Rollout Safety Strategy (Key Practices)

- Use versioned RPCs (`*_v2`) to avoid cache ambiguity and permit rollback.
- Block write traffic during schema migrations, or run migrations in a window.
- Add explicit runtime checks: reject missing `ref_id` once cutover is complete.
- Keep `refs.name` as display label; do not rely on it for joins after cutover.
- Verify with fixture dataset after each phase.

## Cutover Checklist (Must Pass Before Phase 3)

- All RPC calls use `ref_id` and `*_v2` endpoints.
- `rg -n "ref_name|refName" src app -S` shows no production paths.
- Side-car tables show zero null `ref_id`.
- Create/merge/draft/current-ref flows pass in dev.

## Notes

- This intentionally deviates from Git: Git refs are mutable names; there is no immutable ref ID.
- The benefit is a stable link between provenance (nodes/commits) and side-car data (drafts/prefs).

# Appendix: Implement Branch Rename + Pinned Branch (One-Phase PR)

Goal: ship both features in one PR: safe branch rename (mutable label) + per-project pinned branch (separate from current/HEAD).

Behavior requirements:
- Pinned branch sorts to the top of the branch list.
- Current branch stays in its natural order and is highlighted with a label/icon (no reordering).
- Renames must be safe and must not break history/drafts/prefs (use `ref_id` everywhere).
- One pinned branch per project (nullable).

## A) Supabase Migration (RPCs + list refs)

Create one migration file that:
1) Adds RPCs:
   - `rt_rename_ref_v2(p_project_id uuid, p_ref_id uuid, p_new_name text, p_lock_timeout_ms integer default 3000)`
     - Validate auth + membership.
     - Ensure `p_new_name` is non-empty, trimmed, and unique per project.
     - Update `public.refs` set `name = p_new_name`, `updated_at = now()` where `id = p_ref_id and project_id = p_project_id`.
     - Return the updated `id`, `name`.
   - `rt_set_pinned_ref_v2(p_project_id uuid, p_ref_id uuid)`
     - Validate auth + membership.
     - Ensure ref belongs to project.
     - Update `public.projects` set `pinned_ref_id = p_ref_id`.
   - `rt_clear_pinned_ref_v2(p_project_id uuid)`
     - Validate auth + membership.
     - Update `public.projects` set `pinned_ref_id = null`.
   - `rt_get_pinned_ref_v2(p_project_id uuid)`
     - Return `ref_id`, `ref_name` (left join `refs`).
2) Extend `rt_list_refs_v2` to include `is_pinned boolean`.
   - Join `projects.pinned_ref_id` and compute `is_pinned`.
3) Grant execute for new RPCs to `authenticated`.

## B) Store Layer (PG)

Add wrappers in `src/store/pg`:
- `rtRenameRefShadowV2`
- `rtSetPinnedRefShadowV2`
- `rtClearPinnedRefShadowV2`
- `rtGetPinnedRefShadowV2`
- Update `rtListRefsShadowV2` return type to include `isPinned`.

## C) API Routes

Add endpoints (PG + Git mode paths for parity):
- Rename:
  - `PATCH /api/projects/{id}/branches/{refId}` (body: `{ name: string }`)
  - PG: call `rt_rename_ref_v2`, return updated branches + current branch.
  - Git: use `git branch -m` (or equivalent helper) + update branch config map.
- Pin:
  - `POST /api/projects/{id}/branches/{refId}/pin` -> set pinned
  - `DELETE /api/projects/{id}/branches/pin` -> clear pinned
  - PG: set/clear via new RPCs.
  - Git: store pinned ref in per-project metadata (add file or extend existing metadata if needed).

## D) UI (WorkspaceClient)

Branch list changes:
- Sort: pinned branch first, then trunk, then existing order.
- Add a "Pinned" badge/icon next to the pinned branch.
- Add a "Current" badge/icon on the active branch (do not change its order).
- Add actions in the branch list row (e.g., menu or inline buttons):
  - Rename branch
  - Pin/unpin branch

Rename flow:
- Inline edit or modal (re-use existing branch name input styles).
- Validate non-empty, max length; show conflicts (duplicate name).

Pin flow:
- Single pinned branch per project.
- Toggling pinned state updates list and persists.

## E) Tests + Verification (Run in review)

Add tests:
- RPC contract tests for new functions and `rt_list_refs_v2` fields.
- API tests for rename/pin routes.
- UI tests if available for branch list ordering and pin/rename behavior.

Manual smoke (PG mode):
- Rename current branch; verify history/artefact/drafts still load.
- Pin a branch; refresh; pinned badge persists.
- Switch current branch; verify pinned stays fixed and current label updates.
