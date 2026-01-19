# PG Ref-ID Node FK Minimal Plan (Git-First)

## Tenets (Git-First)
- Ref names are mutable pointers to commits; we rely on name-based refs by default.
- Immutable `ref.id` exists only to support non-git joins (e.g., artefact/lease tracking, DB joins).
- `ref.name` is never treated as a foreign key; UI labels must resolve from refs when needed.

## Overreach Note (Cautionary Tale)
We previously pushed ref IDs into general UI keys, cache keys, and graph/history flows.
That overstepped the git-first model and would force IDs into places that should stay name-based.
This plan rolls that back and keeps IDs only where required for stable joins.

## Bug Definition (Crisp)
Any behavior that relies on name-based fields stored in node JSON (e.g., `createdOnBranch`, `mergeFrom`)
breaks after rename because those fields go stale.

## Scope (Minimal Fix)
- Keep name-based branch identity everywhere by default (both git + PG modes).
- Use `ref.id` only for stable join points (PG tables, artefact/lease workflows).
- Remove functional reliance on `createdOnBranch`/`mergeFrom` for logic; use them only as display hints. NOTE: I think we should stop writing these values out in the JSON blob since they will likely go stale. Better to normalize than to add "keep fresh" routes.

## Surface Area (Name vs ID)
### A) Name-native (git semantics)
Use ref names directly; source-of-truth is the ref name itself.
- Branch operations: create/switch/rename/merge (payloads and UI state)
- Branch selection and navigation (current branch, active branch, target branch labels)
- Git-only storage (refs pointing to commits)

### B) Name-native with authoritative lookup
Use ref names in the client, but resolve labels from the refs list (never from node JSON).
- Graph lanes and labels
- History display and merge labels
- UI branch labels in PG mode

### C) ID-required (non-git joins)
Use immutable `ref.id` where a stable FK is required.
- Postgres node FK columns (`created_on_ref_id`, `merge_from_ref_id`)
- Artefact + draft storage joins
- Lease/lock tracking

## Plan
1) DB + RPCs (PG only)
   - Ensure nodes have `created_on_ref_id` and `merge_from_ref_id` populated on write.
   - Keep JSON name fields only for legacy compatibility; never use them for display or logic.
   - TODO: remove name fields from PG JSON once all readers stop relying on them.

2) Read-time name resolution (PG + git)
   - On history/graph reads, resolve display names from refs by ID when possible. NOTE: we should do it always and throw+log a clear polite error when not.
   - Never use node JSON names for branching/grouping logic. 

3) UI/Graph behavior
   - Continue to key branches and UI state by ref name (git-first).
   - Use ref IDs only for artefact/lease requests in PG mode.

4) Regression coverage
   - Rename branch after nodes exist; history/graph still resolve labels correctly.
   - Rename branch; artefact/lease flows continue to work (PG).

5) Git-mode rename maintenance (option 1)
   - Git nodes remain JSON-backed; keep `createdOnBranch`/`mergeFrom` fresh on rename.
   - Rename routes must rewrite node JSON fields that store branch names.

## Out of Scope (Explicit)
- Ref-ID as default identifier in UI caches or graph lanes.
- Removing name-based API parameters entirely.

## Quick Discovery
```bash
rg -n "createdOnBranch|mergeFrom|createdOnRefId|mergeFromRefId" src app tests -S
rg -n "refId" app src -S
```
