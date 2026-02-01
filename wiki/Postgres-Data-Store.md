# Postgres Data Store

## Summary
The web app uses RPC-style Postgres functions for reads/writes. Access is routed through a single adapter that supports Supabase or local PG.

## Key layers
- `src/store/pg/adapter.ts`: Chooses Supabase vs local PG adapter (`RT_PG_ADAPTER`).
- `src/store/pg/localAdapter.ts`: Emulates Supabase RPC calls directly against local PG (SQL call builder).
- `src/store/pg/*`: Thin RPC wrappers for projects, branches, nodes, artefacts, merges, leases, and tokens.

## Local PG support
- `src/server/localPgBootstrap.ts`: Bootstraps local DB and runs migrations from `supabase/migrations`.
- `src/server/localPgConfig.ts`: Builds connection strings + local user ID.
- `src/server/pgMode.ts`: Guards against mixing local PG with Supabase env vars.

## Data identity conventions
- **Ref names** are the default identifier for display and flow logic.
- **Ref IDs** are only used for stable joins and FKs.

## RPC wrapper highlights
- **Projects**: `rt_create_project`, `rt_list_projects_v1`, `rt_get_project_v1`.
- **Branches**: list, create from ref/node, rename, pin, hide.
- **Nodes**: append messages/merges/state, read node content.
- **Canvas**: draft (`rt_save_artefact_draft_v2`) and committed artefacts (`rt_update_artefact_on_ref_v2`).
- **Leases**: acquire/release `rt_acquire_ref_lease_v1` for editing locks.
- **Tokens**: `rt_get_user_llm_key_status_v1`, `rt_set_user_llm_key_v1`, `rt_get_user_llm_key_server_v1`.

## Operational notes
- Local PG bootstrap can be disabled with `RT_PG_BOOTSTRAP=0`.
- Health checks read `local_migrations` to confirm migrations are applied.
