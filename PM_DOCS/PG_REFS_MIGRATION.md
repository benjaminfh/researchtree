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
