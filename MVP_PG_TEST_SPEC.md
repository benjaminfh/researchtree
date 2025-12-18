# PG Migration Test Specification (Supabase Postgres Provenance Store)

Test-driven roadmap for replacing the on-disk git store (`src/git/*`, `data/projects/*`) with a Supabase-compatible Postgres store (`src/store/*`) as defined in `MVP_PG_IMPL_PLAN.md`.

This spec mirrors the migration plan’s core concerns: Supabase Auth + RLS, RPC-atomic writes, strict per-ref ordering (no interleaving), per-user current branch, ordinal-based pagination, and backfill from git repos.

---

## Testing Toolkit

| Layer | Tooling | Notes |
| --- | --- | --- |
| Route handlers / server modules | **Vitest** + `next-test-api-route-handler` | Mock store + auth helpers; run in Node |
| Store wrappers (TS) | **Vitest** | Mock `supabase.rpc`/query calls; verify payloads + error handling |
| DB / RPC correctness (optional integration) | Supabase local stack (`supabase start`) + **Vitest** | Runs real migrations + RPC + RLS; gated/optional in CI |
| Client hooks/components | **Vitest** + React Testing Library | Focus on “branch busy” UX + sessionId handling |
| Migration script | **Vitest** | Unit tests with fake git repos; optional integration to real DB |

Test locations (recommended):
- `tests/server/` — Next route handlers and server helpers.
- `tests/store/` — store wrapper unit tests (RPC payloads, paging queries).
- `tests/db/` — optional integration tests against local Supabase.
- `tests/migration/` — git ➜ pg backfill tests (unit + optional integration).

---

## 1) DB + RPC (Integration Tests, Optional but Strongly Recommended)

Goal: verify that the database layer enforces the invariants we rely on (atomicity, RLS, ordering, leases) without trusting application code.

Prereqs:
- Local Supabase stack with migrations applied (tables + RLS + RPC functions from `MVP_PG_IMPL_PLAN.md`).
- Two test users (`userA`, `userB`) created via Supabase Auth.

### 1.1 RLS: Membership gates everything (`tests/db/rls.test.ts`)

1. **Non-member cannot read project data**
   - Arrange: `userA` creates project; `userB` is not added to `project_members`.
   - Assert as `userB`: selects from `projects/refs/nodes/artefacts/commit_order/stars` return 0 rows or permission error (depending on client behavior).

2. **Member can read project data**
   - Assert as `userA`: can select project row, list refs, read nodes, read artefacts.

3. **`project_user_prefs` is self-only**
   - Arrange: insert prefs for `userA`.
   - Assert as `userB`: cannot select/update `userA` prefs row even if `userB` is later added as member (future-proofing).

### 1.2 Ref lease lifecycle (`tests/db/ref-leases.test.ts`)

1. **Acquire lease succeeds when empty**
   - Call `rt_acquire_ref_lease_v1` as `userA` with `sessionId=A1`.
   - Assert `ok=true` and `expires_at > now()`.

2. **Acquire returns busy for a different session**
   - Call acquire again as `userA` with `sessionId=A2`.
   - Assert `ok=false` with `busy_*` fields populated.

3. **Refresh extends expiry only for holder**
   - Refresh as `sessionId=A1` → expiry increases.
   - Refresh as `sessionId=A2` → fails.

4. **Expired lease can be re-acquired**
   - Force expiry (short TTL + wait, or direct update in test-only mode).
   - Acquire as `sessionId=A2` → succeeds.

5. **Release clears lease**
   - Release as holder session → subsequent acquire by another session succeeds immediately.

### 1.3 Append node atomicity + ordering (`tests/db/append-node.test.ts`)

1. **Append requires a valid lease**
   - Without lease: `rt_append_node_v1` fails (permission/validation).

2. **Append creates exactly one commit + one node + one commit_order row**
   - With lease held: call append once.
   - Assert:
     - 1 new row in `commits` with `author_user_id = auth.uid()`
     - 1 row in `nodes` with provided `node_id`
     - 1 row in `commit_order` with `ordinal = 0`
     - `refs.tip_ordinal = 0` and `refs.tip_commit_id = new_commit_id`

3. **Sequential appends increment ordinals deterministically**
   - Append twice under same lease/session.
   - Assert ordinals are `0,1` and history order by ordinal matches append order.

4. **Wrong session cannot append**
   - Hold lease with `sessionId=A1`.
   - Call append with `sessionId=A2` → fail.

5. **No interleaving across sessions**
   - Hold lease with `sessionId=A1`.
   - Attempt append with `sessionId=A2` in parallel → fails (or blocks at app level; DB should reject).

### 1.4 Artefact update RPC invariants (`tests/db/artefact.test.ts`)

1. **Update inserts artefact row + state node + commit + commit_order**
   - With lease held: call `rt_update_artefact_v1`.
   - Assert:
     - new commit created
     - `artefacts(kind='canvas_md')` inserted with expected hash
     - a `state` node exists whose `content_json.artefactSnapshot` equals `content_hash`
     - ref tip updated and ordinal incremented

2. **Latest artefact by ordinal returns correct content**
   - Create multiple artefact updates; query latest by join `commit_order → artefacts` (or via read RPC).
   - Assert latest equals last update content.

### 1.5 Branch-from-base copies prefix ordering (`tests/db/branches.test.ts`)

1. **New ref inherits history prefix**
   - On source ref, append N nodes (ordinals 0..N-1).
   - Create new ref from base ordinal `k`.
   - Assert:
     - new ref `tip_ordinal = k`
     - new ref `commit_order` contains ordinals `0..k` with same commit_ids as source

2. **Appending to new ref continues ordinal sequence**
   - Append a node on new ref.
   - Assert new ordinal is `k+1` and original prefix unchanged.

### 1.6 Merge “ours” creates a 2-parent commit + merge node (`tests/db/merge.test.ts`)

1. **Merge produces 2-parent commit and advances target**
   - Arrange: target ref has history; source ref has divergent history.
   - Acquire target lease; call `rt_merge_ours_v1`.
   - Assert:
     - new commit has `parent1 = old target tip`, `parent2 = source_commit_id`
     - merge node row exists (type `merge`) with payload fields populated
     - target ref tip advanced and ordinal incremented
     - no artefact row inserted by merge

---

## 2) Store Wrapper Unit Tests (TS)

Goal: verify our `src/store/*` code calls the right RPCs/queries, passes session id, handles retries/timeouts, and returns stable shapes to routes.

### 2.1 Lease acquisition helper (`tests/store/leases.test.ts`)

1. **Waits up to `RT_REF_LEASE_WAIT_MS` then fails**
   - Mock acquire RPC to always return busy.
   - Assert helper polls (with backoff) and rejects after configured wait.

2. **Succeeds when lease becomes available**
   - Mock busy for first N polls, then ok.
   - Assert resolves and returns expiry info.

3. **Does not treat sessionId as auth**
   - Ensure helper always passes both auth context (supabase client) and `holder_session_id`.

### 2.2 Append wrapper (`tests/store/append-node.test.ts`)

1. **Calls `rt_append_node_v1` with required fields**
   - Assert includes `project_id/ref_id/holder_session_id/node_id/timestamp_ms/content_json/commit_message`.

2. **Surfaces “lease invalid/busy” as a typed error**
   - Mock RPC error; ensure caller can render “branch busy” UX.

### 2.3 Read helpers: history paging (`tests/store/history.test.ts`)

1. **Fetch newest page by ordinal desc**
   - Ensure query shape is keyset-based (no offsets).

2. **Fetch older page uses `beforeOrdinal`**
   - Ensure `ordinal < beforeOrdinal` and order desc.

3. **Returns nodes in ordinal asc for timeline display**
   - Store can normalize ordering for consumers (optional but recommended).

---

## 3) Route Handlers (Server)

Goal: preserve existing endpoint contracts while swapping implementation from `@git/*` to `@store/*`, and introduce auth + per-user current branch semantics.

Notes:
- Tests should treat auth as mandatory for write endpoints (and likely for reads once RLS-backed).
- Prefer mocking `src/store/*` wrappers in server tests; keep DB integration tests separate (Section 1).

### 3.1 Auth gate (shared) (`tests/server/auth-required.test.ts`)

1. **Unauthenticated request rejected**
   - For each write route (`/chat`, `/artefact PUT`, `/merge`, `/edit`, `/stars POST`, `/branches PATCH/POST`), request without session → expect `401`.

### 3.2 `/api/projects` (`tests/server/projects-route.test.ts`)

1. **POST creates project + initializes main ref + prefs**
   - Mock store `createProject` to return `{ project, mainRefId }`.
   - Assert `201` and returned project metadata.

2. **GET lists only projects for current user**
   - Ensure store query is membership-based (matches RLS intent).

### 3.3 `/api/projects/[id]/branches` (`tests/server/branches-route.test.ts`)

1. **GET returns branches + currentBranch**
   - `currentBranch` should come from per-user prefs.

2. **PATCH switches current branch**
   - Assert store call updates `project_user_prefs.current_ref_id`.

### 3.4 `/api/projects/[id]/chat` (`tests/server/chat-route.test.ts`)

Mock store lease + append + context reads + LLM stream.

1. **Acquires lease before first append**
   - Ensure lease acquisition is invoked before appending the user message.

2. **Persists user node, then streams**
   - Assert user append happens before LLM stream begins.

3. **Persists assistant node at end (adjacent ordering)**
   - Ensure no extra writes occur between the user and assistant append calls in the handler logic.

4. **Busy branch behavior**
   - If lease remains busy for > wait window: expect `409` with clear message payload.

5. **Interrupt path releases lease**
   - If stream is aborted: assistant node persisted with `interrupted=true`, lease is released (or at least refresh stops and TTL expires).

### 3.5 `/api/projects/[id]/history` (`tests/server/history-route.test.ts`)

1. **Defaults to per-user current ref**
   - No `?ref=`: uses prefs; falls back to `main` if unset.

2. **Paginates by ordinal**
   - With `?beforeOrdinal=` and `?limit=`, ensure store called with those values.

### 3.6 `/api/projects/[id]/artefact` (`tests/server/artefact-route.test.ts` + `tests/server/artefact-update-route.test.ts`)

1. **GET returns latest artefact + last state metadata**
2. **PUT requires lease and writes via RPC**
3. **Busy branch returns 409 after wait window**

### 3.7 `/api/projects/[id]/stars` (`tests/server/stars-route.test.ts`)

1. **Toggle is mutable state**
   - Ensure route calls store toggle without appending commits/nodes.

### 3.8 `/api/projects/[id]/edit` (`tests/server/edit-route.test.ts`)

1. **Computes base from node parent semantics**
   - Ensure store is asked to create ref from base (prefix copied) and then append edited node.

2. **Switches per-user current branch to the new edit branch**
   - If UI expects this behavior, ensure route updates prefs (or returns enough info for client to do so).

### 3.9 `/api/projects/[id]/merge` (`tests/server/merge-route.test.ts`)

1. **Defaults target to `main`**
2. **Requires lease on target**
3. **Merge never updates artefact**
   - Ensure route does not call artefact update routines during merge.

### 3.10 `/api/projects/[id]/graph` (`tests/server/graph-route.test.ts`)

1. **Returns bounded histories per ref**
   - Verify cap still applies (e.g. last 500 by ordinal).

---

## 4) Client Tests (Session + Busy UX)

Goal: ensure per-tab sessionId and “branch busy” UX are correct and stable.

### 4.1 SessionId helper (`tests/client/session-id.test.ts`)

1. **Persists a stable per-tab id**
   - Ensure first call generates UUID and stores in `localStorage`, subsequent calls reuse.

2. **Sent on write requests**
   - Chat/artefact/merge/edit requests include `x-rt-session-id` (or chosen field).

### 4.2 Busy branch UX (`tests/client/WorkspaceClient.test.tsx`)

1. **Shows spinner up to wait window**
   - Mock server returning 409 “busy” until timeout; ensure UI shows “Branch is open in another tab” message.

2. **Recovery after busy clears**
   - Mock 409 for a short time, then success; ensure UI retries and completes without duplicated user messages.

---

## 5) Migration Script Tests

### 5.1 Unit: detect node-append commits vs non-node commits (`tests/migration/delta-detection.test.ts`)

1. **Stars commits do not create nodes**
   - Create a temp git repo with:
     - init commit
     - a nodes append commit
     - a stars-only commit
   - Ensure migration logic only produces one node for the nodes append commit.

2. **Artefact changes are versioned**
   - Ensure artefact row inserted only when content changes.

### 5.2 Optional integration: backfill end-to-end (`tests/migration/backfill.integration.test.ts`)

1. **Migrates branches + ordinals + tips**
   - Create sample repo with branch + merge.
   - Run migration against local Supabase DB (service role).
   - Assert:
     - refs exist
     - commit_order ordinals correct and prefixes copied as expected
     - merge commit has 2 parents
     - stars migrated as relations

---

## Success Criteria

1. DB integration suite (if enabled) proves: RLS correctness, lease semantics, atomic append ordering, branch-from-base prefix copy, merge invariants.
2. Server tests prove: auth gating, correct default ref resolution (per-user prefs), busy-branch wait + 409 behavior, and existing endpoint behavior preserved.
3. Client tests prove: sessionId stability and branch-busy UX correctness.
4. Migration tests prove: node delta detection is robust (stars commits do not duplicate nodes) and artefact versioning behaves as expected.
