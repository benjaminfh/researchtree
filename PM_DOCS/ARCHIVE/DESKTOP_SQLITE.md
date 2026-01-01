# Desktop SQLite Feasibility Study

## Goal
Assess the feasibility of running the app against SQLite (local, file-based) to enable easy desktop macOS deployment.

## Current Backend Pattern Summary
- Postgres via Supabase.
- DB logic centralized in SQL functions and exposed through `supabase.rpc(...)`.
- RLS and server-side auth are integrated with Supabase.
- Migrations are SQL-first and live in `supabase/migrations`.
- App code in `src/store/pg` wraps RPC calls and returns shaped data.

## SQLite Feasibility: High-Level Verdict
- **Feasible for a local, single-user desktop mode**, but not drop-in.
- **Requires a dedicated data access module** to replace Supabase RPC + RLS.
- **Moderate-to-high effort** due to Postgres-specific SQL and server-side features.

## What Translates Well
- Core data model: tables + append-only history are compatible with SQLite.
- Transactional workflows: SQLite supports transactions and foreign keys.
- Local deployment: SQLite is ideal for packaging and offline-first use.

## Major Gaps vs Supabase/Postgres
- **RPC functions**: need to be reimplemented in the app layer (or rewritten as SQLite triggers/views). Most current logic lives in Postgres functions.
- **Postgres-specific SQL**: JSONB operators, `uuid`, array types, and advanced queries may need rewriting.
- **Realtime**: Supabase realtime is not present. Desktop mode would be single-user unless you build sync.

## Compatibility Strategy Options

### Option A: SQLite Mode with a Dedicated Data Adapter (Recommended)
Create an interface layer that abstracts data operations used by `src/store/pg`.
- Implement each RPC as a TypeScript function against SQLite.
- Use a query builder (Kysely/Drizzle) or raw SQL.
- Keep SQL migrations for SQLite in a new `sqlite/migrations` folder.

Pros:
- Clear separation of concerns.
- Allows us to keep Postgres/Supabase for hosted mode.

Cons:
- Two migration tracks.
- Requires ongoing parity between Postgres functions and SQLite adapters.

### Option B: Replace RPC with App Logic Everywhere
Move logic out of Postgres and into the app, even for hosted mode.
- Postgres becomes mostly storage.
- App code enforces invariants.

Pros:
- Single logic layer.
- Easier to run against SQLite or Postgres.

Cons:
- Larger refactor.
- Loses some DB-level integrity benefits.

### Option C: Local Postgres for Desktop
Not SQLite, but a faster path to desktop using local Postgres. This can target technical users and keep the existing Supabase/RPC stack intact.

Implementation paths (macOS):
- **Postgres.app**: user installs a GUI app that runs Postgres and exposes a local port.
- **Homebrew**: `brew install postgresql` and run as a service.
- **Bundled runtime**: ship a managed Postgres instance inside the desktop app (heavier but most turnkey).

Pros:
- Minimal rewrite; keeps existing migrations and RPC intact.
- Fastest path to a working desktop build.
- Leverages mature Postgres tooling.

Cons:
- Heavier footprint than SQLite.
- Requires local DB installation or bundling.
- Still not SQLite-native; limits “drop-in offline” story for non-technical users.

When it is attractive:
- Target audience is technical and comfortable installing Postgres.
- We want to minimize engineering effort and avoid dual migrations.
- We prioritize feature parity with hosted Supabase over installation simplicity.

## Data Access Surface (Scope Estimate)
Primary RPC entrypoints in `src/store/pg`:
- `rt_append_node_to_ref_v1`
- `rt_create_project`
- `rt_create_ref_from_*`
- `rt_get_history_v1`
- `rt_get_canvas_v1`
- `rt_list_refs_v1`
- `rt_get_starred_node_ids_v1`
- `rt_set_ref_previous_response_id_v1`
- `rt_get_ref_previous_response_id_v1`
- `rt_save_artefact_draft`
- `rt_update_artefact_on_ref`
- `rt_get_user_llm_key_*`
- `rt_set_user_llm_key_v1`
- `rt_merge_ours_v1`

These would need SQLite equivalents.

## Migration Complexity
- Existing migrations contain Postgres-specific features and RPC definitions.
- A SQLite migration set would need:
  - schema creation,
  - indexes,
  - triggers (optional),
  - any data normalization previously done in SQL functions.

Expectation: **rewrite most migrations**, not reuse.

## Auth & Identity
- Desktop mode is single-user and **does not require auth or RLS**.
- Any identity concerns are limited to local profile and key storage.

## Feature Parity Risks
- **RLS enforcement** moves from DB to app. Risk of regressions in hosted mode if logic diverges.
- **Function semantics** may differ between SQLite and Postgres.
- **Data consistency**: without DB-level constraints, more app-level testing needed.

## Testing Strategy
- Add a SQLite test suite that runs against an in-memory or temp file DB.
- Create parity tests for each RPC-equivalent function.
- Golden tests for core graph operations (append, branch, merge).

## Rough Effort Estimate
- **Prototype SQLite adapter**: 1-2 weeks.
- **Full parity for current RPC surface**: 3-6 weeks.
- **Desktop packaging + UX**: 2-4 weeks.

These assume a small team and existing knowledge of the data model.

## Recommendation
- Proceed with a **spike** that implements 2-3 core workflows (create project, append node, list history) using SQLite.
- If parity is acceptable, build a formal adapter layer and plan a migration path.

## Open Questions
- Desktop mode is strictly local (no multi-user sync).
- Supabase remains the primary online mode; SQLite is a local-only alternative.
- Dual migrations are not ideal, but remain on the table if needed.
- SQLite starts clean per install; existing projects are not imported initially.
