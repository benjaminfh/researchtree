# Desktop Postgres Implementation Plan

## Goal
Enable a local-only desktop mode that uses Postgres on macOS while preserving the existing Supabase/Postgres architecture for the hosted app.

## Guiding Principles
- **Reuse the current Postgres/RPC logic** as much as possible.
- **Keep local mode modular** to avoid polluting hosted code paths.
- **Minimize divergence** between local and hosted behavior.
- **Target technical users** comfortable installing local Postgres.

## Changes Required in the Codebase

### 1) Database Adapter Layer
Introduce a storage adapter interface that abstracts the DB client and RPC calls.
- Create a module such as `src/store/db/adapter.ts` that exposes:
  - `rpc(name, params)`
  - `query(table, filters)` where needed
  - `admin` access for privileged reads/writes
- Implement two adapters:
  - `SupabaseAdapter` using `@supabase/ssr` / `@supabase/supabase-js`
  - `LocalPostgresAdapter` using a direct Postgres client (e.g., `pg`)

### 2) Refactor `src/store/pg` to Use the Adapter
- Replace direct `createSupabaseServerClient()` usage with the adapter API.
- Each function becomes adapter-agnostic (same inputs/outputs).
- The RPC names and arguments remain unchanged.

### 3) Local Postgres RPC Support
- Run the same SQL migrations against local Postgres.
- Ensure RPC functions exist in local Postgres with the same names/signatures.
- Maintain a single migration path (Supabase migrations applied locally).

### 4) Environment Routing
- Add an environment flag (e.g., `APP_DB_MODE=local|supabase`).
- Resolve the adapter based on this flag in a single place.
- Keep the rest of the app unaware of the backend mode.

## How This Inherits from Existing PG / RPC Logic
- All RPC functions remain in SQL and are reused as-is.
- No changes to function names, parameters, or return shapes.
- Local Postgres runs the same migrations so RPC logic stays authoritative.
- The adapter layer only changes *how* we call RPC, not *what* is called.

## Keeping Local Code Modular and Separate
- All local-mode code lives under a `src/server/local/` (or similar) namespace.
- The only shared touchpoints:
  - Adapter interface
  - Migrations
  - Environment config
- Any local-only concerns (e.g., file-based secrets, local settings) stay isolated.

## Maintaining Both Hosted and Local Modes
- Hosted mode continues to use Supabase unchanged.
- Local mode uses Postgres + direct RPC calls.
- CI can run a small suite in both modes (optional for MVP):
  - Hosted mode: existing tests
  - Local mode: run migrations against a local Postgres instance and exercise a subset of RPCs
- Documented setup paths for both modes to avoid confusion.

## Install Flow (High-Level)
- User installs Postgres via Postgres.app or Homebrew.
- We bundle the Next.js server + client into a macOS desktop app.
- On first run:
  - App prompts for local Postgres connection (default port 5432)
  - Runs migrations to initialize schema/RPC
  - Creates a local project space

(Install details will be expanded later.)

## Risks & Mitigations
- **Local Postgres mismatch**: ensure migrations are the single source of truth.
- **Adapter drift**: keep a thin adapter and avoid branching logic in stores.
- **Install friction**: target technical users first; provide a clear setup guide.

## Milestones (Draft)
1) Adapter interface + Supabase adapter (no behavior change)
2) Local Postgres adapter + connection config
3) Local migrations bootstrap
4) Desktop mode toggle + smoke test
