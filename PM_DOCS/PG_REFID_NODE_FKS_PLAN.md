# PG Ref-ID Node FKs Plan

## Problem Statement
Branch identity in PG mode is canonicalized via `refs.id`, but node JSON still stores branch names
(`createdOnBranch`, `mergeFrom`). These strings function as soft FKs to `refs.name` and break on rename.
Git mode relied on name-based refs, so the JSON payloads were never refactored to stable IDs.

Goal: make branch identity first-class in both PG and Git modes while keeping UI labels stable.

## Impact Inventory (Current Code Paths)

### Node JSON fields (soft FKs today)
- `createdOnBranch` (node origin branch)
- `mergeFrom` (merge source branch)

### Server/API writes (PG + git)
- `app/api/projects/[id]/chat/route.ts` (createdOnBranch)
- `app/api/projects/[id]/edit/route.ts` (createdOnBranch)
- `app/api/projects/[id]/edit-stream/route.ts` (createdOnBranch)
- `app/api/projects/[id]/merge/route.ts` (createdOnBranch, mergeFrom)
- `app/api/projects/[id]/merge/pin-canvas-diff/route.ts` (createdOnBranch)
- `src/git/nodes.ts` (createdOnBranch)
- `src/git/branches.ts` (mergeFrom)

### UI/graph reads
- `src/components/workspace/WorkspaceClient.tsx`
- `src/components/workspace/WorkspaceGraph.tsx`
- `src/server/context.ts`

### Other ref.name usages that must be normalized to ref.id
- `src/server/llmState.ts` (git mode branch config map keys; rename-sensitive)
- `app/page.tsx` (project list nodeCount lookup by `ref.name === 'main'`)

### Name-derived identifiers used for lookups/keys (must move to ref.id)
#### Server/API (PG + git)
- `src/server/pgRefs.ts` (resolve by name; entry point for name->id lookups)
- `app/api/projects/[id]/history/route.ts` (query param `ref` resolves by name; git reads by name)
- `app/api/projects/[id]/graph/route.ts` (branch maps keyed by name; uses name for grouping)
- `app/api/projects/[id]/branches/route.ts` (base branch selection + switch by name; name-based existence checks)
- `app/api/projects/[id]/branches/[refId]/route.ts` (git rename treats `refId` param as name)
- `app/api/projects/[id]/branches/[refId]/pin/route.ts` (git pin uses name; `setPinnedBranchName`)
- `app/api/projects/[id]/branches/[refId]/visibility/route.ts` (git hidden flag uses name)
- `app/api/projects/[id]/branch-question/route.ts` (base branch selection + lookups by name)
- `app/api/projects/[id]/chat/route.ts` (resolve target ref by name)
- `app/api/projects/[id]/edit/route.ts` (resolve target ref by name)
- `app/api/projects/[id]/edit-stream/route.ts` (resolve target ref by name)
- `app/api/projects/[id]/merge/route.ts` (source/target branch resolution by name)
- `app/api/projects/[id]/merge/pin-canvas-diff/route.ts` (target branch resolution by name)
- `app/api/projects/[id]/artefact/route.ts` (resolve target ref by name)

#### Server state/config
- `src/server/context.ts` (branchConfigMap keyed by name; `createdOnBranch` comparisons)
- `src/server/branchConfig.ts` (maps keyed by `branch.name`; returns name-keyed config)
- `src/git/branchConfig.ts` (config file maps keyed by branch name)
- `src/server/llmState.ts` (git map keyed by `ref.name`)
- `src/git/projects.ts` (pinned branch stored by name)
- `src/git/branches.ts` (branch existence/switch uses name-only identifiers)

#### Client/UI (identifier state + caches keyed by name)
- `src/components/workspace/WorkspaceClient.tsx` (active branch state, map keys, caches, API calls)
- `src/components/workspace/WorkspaceGraph.tsx` (branch grouping + graph layout keyed by name)
- `src/components/workspace/branchColors.ts` (color mapping keyed by name)
- `app/projects/[id]/page.tsx` (default `refName: 'main'` and branchName usage)

### Tests using name-only fields
- `tests/client/WorkspaceClient.test.tsx`
- `tests/client/WorkspaceGraph.*.test.tsx`
- `tests/server/merge-route.test.ts`
- `tests/server/merge-pin-canvas-diff-route.test.ts`
- `tests/server/context.test.ts`
- `tests/git/branches.test.ts`
- `tests/git/nodes.test.ts`

### Supabase nodes storage
- `public.nodes.content_json` is the authoritative payload returned by:
  - `rt_get_history_v2` (and similar read RPCs)
  - `rt_append_node_to_ref_v2` (and write RPCs)

## Desired End State

### PG mode
- `public.nodes` has explicit FK columns:
  - `created_on_ref_id uuid null references public.refs(id)`
  - `merge_from_ref_id uuid null references public.refs(id)`
- JSON may continue to carry names for display, but graph/history logic should prefer ref IDs and resolve labels from `public.refs` (never from stale JSON).
- Rename updates `refs.name` only, and all node linkage remains valid via ref IDs.

### Git mode
- Node payloads include both IDs and names:
  - `createdOnRefId`, `mergeFromRefId` (new)
  - `createdOnBranch`, `mergeFrom` (existing)
- On rename, only update name fields (ID is stable).
- Graph/history uses IDs when present; falls back to names.

### Global requirement (all modes)
- `ref.id` is the sole normalized identifier for joins, lookups, and storage keys.
- `ref.name` is UI-only; no logic should depend on name equality for correctness.

## Migration / Refactor Plan

### Phase 1: Schema + Backfill (PG)
1) Migration: add `created_on_ref_id` + `merge_from_ref_id` to `public.nodes`.
2) Backfill:
   - Join `refs` by `project_id` + `refs.name` against `content_json->>'createdOnBranch'`.
   - Same for `mergeFrom`.
   - Note: If a branch has already been renamed, historical node JSON may not match `refs.name`.
     We accept that those backfills may remain null (best-effort only).
3) Add indexes for `(project_id, created_on_ref_id)` and `(project_id, merge_from_ref_id)` if useful for reads.

### Phase 2: Write Path Updates (PG)
1) Update RPCs (`rt_append_node_to_ref_v2`, merge RPCs) to populate new FK columns.
2) Preserve JSON fields for compatibility, but treat them as display-only.

### Phase 3: Read Path Updates (PG + UI)
1) Update history/graph endpoints to return IDs alongside names.
2) Update UI logic to resolve branch identity by ref ID first:
   - Node grouping (graph lanes, branch splits)
   - Merge labeling and branch color assignment
3) When only names exist (legacy data), fall back to name-based resolution.

### Phase 4: Git Mode Refactor
1) Extend node model to include `createdOnRefId` / `mergeFromRefId`.
2) When writing nodes:
   - Resolve branch ID from local metadata (new map file or existing store).
   - Persist both ID + name.
3) Rename flow:
   - Update name in metadata and in node JSON (optional), keep IDs stable.

### Phase 5: Cleanup + Guardrails
1) Add runtime checks in PG mode to reject node writes missing ref IDs once cutover is complete.
2) Optional: phase out name-based comparisons where IDs exist.

## Validation / Tests
- Add regression test: rename branch with existing nodes, graph/history still renders in PG mode.
- Add migration fixture check: node JSON names can drift, IDs keep linkage stable.
- Git-mode test: rename branch updates labels, IDs keep node attribution stable.

## Open Questions
- Where to store branch ID mapping in Git mode (new metadata file vs existing config)?
- Should JSON name fields be updated on rename for PG mode (cosmetic), or left stale and resolved by ID?

## Callsite Discovery (Quick Searches)
Use these to locate usage quickly without line-level inventory.

```bash
# Node JSON fields
rg -n "createdOnBranch|mergeFrom|createdOnRefId|mergeFromRefId" src app tests -S

# Name-based ref lookups/keys
rg -n "refName|ref_name|branchName|refs\\.name" src app -S

# PG RPC touchpoints for nodes + history
rg -n "rt_get_history_v2|rt_append_node_to_ref_v2|content_json" supabase/migrations src -S
```
