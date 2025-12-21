# PG vs Git Regression Audit Plan

## Goal

Determine whether the Git-backed implementation is:

- **Regressed** vs a known “last good” Git baseline (previously-working behavior now broken/changed unexpectedly), and/or
- **Left behind** vs the now-default Postgres-backed implementation (feature parity drift after PG became default),

with **reproducible evidence** and a **prioritized remediation backlog**.

## Phase 1 — Define Scope and Success Criteria

- Clarify the backends:
  - What exactly is **Git mode** (local repo, remote origin, libgit2, shelling out to `git`, etc.)?
  - What exactly is **PG mode** (services/tables, migrations, what is the source of truth)?
- Identify how mode is selected:
  - Config flags / env vars / tenant settings / runtime routing logic.
- Define “regression” vs “left behind”:
  - **Regression**: Git behavior differs from its historical baseline unexpectedly.
  - **Left behind**: PG provides capabilities/behavior Git does not (or parity drift occurred).
- Set success criteria:
  - Required parity for GA (e.g., “P0 flows identical, P1 diffs documented and approved, P2 backlog”).
  - Conformance requirements for error semantics, ordering, pagination, permissions, and performance envelopes.
- Choose comparison baselines:
  - Time-based baseline: last release where Git was primary/default.
  - Commit-based baseline: last known-good Git tag/commit + current main.
  - Product baseline: “PG is reference” for current expected behavior.

## Phase 2 — Inventory Features and User Flows

Create a catalog of user-facing flows and their expected outcomes (adapt to your app’s product areas), such as:

- Create/update/delete core entities
- Read/detail/list views
- Search/filter/sort
- History/audit/versioning
- Diff/compare
- Branching/merging/conflict resolution (if applicable)
- Sync/publish/import/export (if applicable)
- Permissions/sharing and boundary cases
- Offline/online transitions (if applicable)

Also inventory the technical surface area:

- API endpoints/resolvers/handlers/CLI commands that touch persistence/versioning
- Background jobs/queues that write data or derive state
- Webhooks/integrations dependent on Git semantics (commit SHAs, refs) vs PG semantics (ids, timestamps)

**Output artifact:** a “Parity Matrix” table with columns:

- Flow/feature
- Expected behavior
- PG behavior
- Git behavior
- Parity (Y/N)
- Severity (P0/P1/P2)
- Evidence links (logs/screenshots/recorded responses)
- Owner
- Fix idea

## Phase 3 — Map Git vs PG Code Paths (Static Audit)

Identify and document the abstraction boundary and routing:

- Find the interface(s)/service(s) where both backends are implemented (or should be).
- Map the routing logic:
  - Where the decision “use Git vs use PG” happens (middleware/service locator/feature flag).
  - Identify any **mixed-mode** paths (e.g., read from PG, write to Git).

For each flow in the parity matrix, trace both call chains:

- Controller/handler → domain service → repository/DAO → backend-specific implementation

Look for parity drift signals:

- PG has additional methods not implemented in Git
- Git backend has TODOs, deprecated code paths, stale types, or feature flags defaulting off
- Inconsistent error mapping (typed domain errors vs generic errors)
- Different ordering/pagination semantics (cursor vs offset; stable sorting guarantees)

**Output artifact:** a lightweight diagram/notes doc linking each flow to exact modules/files/functions for PG and Git implementations.

## Phase 4 — Build a Contract Parity Test Matrix

For each operation category, define **observable contracts** that clients depend on:

- Data invariants: uniqueness, referential integrity, nullability defaults
- Ordering guarantees: e.g., “most recent first”, stability under ties
- Pagination: cursor/offset behavior, boundary conditions, stable paging under concurrent writes
- Error semantics: codes/messages, retryability, partial failure behavior
- Idempotency and concurrency: duplicate requests, simultaneous edits, conflict detection
- Authorization: identical permission checks and “not found vs forbidden” behavior

Explicitly decide which differences are:

- **Must match** (bugs if not),
- **Allowed differences** (documented, normalized in comparisons), or
- **Intentional divergence** (product decision; document and communicate).

## Phase 5 — Run Differential Tests and Analyze

Build a deterministic scenario suite that can run against both backends:

- Seed identical state → perform actions → capture outputs (API responses, derived views, history logs)
- Include edge cases: empty states, large datasets, special characters, deletes, rename/move, conflict cases, rollback/undo (if applicable)

Compare outputs mechanically:

- Snapshot/golden outputs for each backend, or treat **PG as the reference** and Git must match
- Normalize benign differences (timestamps/ids) so diffs are meaningful

Add targeted probes for known-risk areas:

- History/audit trails, diff generation, branching/merging, search/indexing, permission boundaries

**Output artifact:** a runnable checklist (or automated harness) mapping scenarios to parity matrix rows with exact expected results.

## Phase 6 — Write Report and Remediation Backlog

Classify each gap:

- **Regression** (must fix), **Feature lag** (implement or deprecate), **Intentional divergence** (document), **Unclear** (needs decision)

Produce a prioritized backlog:

- **P0**: blocks core workflows / data loss / auth bugs
- **P1**: incorrect behavior but workable
- **P2**: missing features/niceties / perf improvements

For each item, capture:

- Repro steps + evidence
- Root cause hypothesis
- Suggested fix location
- Test to add to prevent recurrence
- Risk/impact
- Rough effort estimate

**Deliverables:**

- Parity Matrix (single source of truth)
- Evidence bundle (repro steps + diffs)
- Recommendation: “Git supported” vs “Git deprecated” vs “Git parity project” with timeline

## Tailoring Questions (to tighten the audit quickly)

- How do you enable Git mode vs PG mode today (env var/flag/tenant setting)?
- What are the top 5 user flows where Git historically mattered most?
- Do you have a known “last good” release/commit/tag for Git mode?
- Is Git mode still used by any customers, or only local/dev?

# AUDIT TODOs

Use this checklist to execute the audit end-to-end and leave behind durable documentation and guardrails.

### 0) Audit Setup (inputs, ownership, and ground rules)

- [ ] Identify an audit owner and reviewers (backend + product).
- [ ] Decide the “reference behavior” for comparisons:
  - [ ] **PG is reference** for current expected behavior, or
  - [ ] **Git last-good baseline** is reference (specify tag/commit).
- [ ] Record scope decisions:
  - [ ] Which app areas are **in scope** for parity (list them).
  - [ ] Which areas are **explicitly out of scope** (and why).
- [ ] Define severity rubric (P0/P1/P2) and “allowed differences” rules.
- [ ] Create an evidence location and naming convention (e.g., a folder, doc, or issue label).

### 1) Determine Mode Selection and How to Run Both Backends

- [x] Document how to run the app in **PG mode** locally (env vars, services needed).
- [x] Document how to run the app in **Git mode** locally (repo location, required setup, auth).
- [x] Identify runtime routing:
  - [x] Where the selection happens (feature flag, config, DI container, middleware).
  - [x] Whether mixed-mode paths exist (read PG/write Git, etc.).
- [ ] Confirm you can run the *same* request/flow against each backend deterministically.
- [x] Capture the exact configs used for the audit (copy/paste into the evidence bundle).

### 2) Choose Baselines (to detect regressions, not just parity gaps)

- [ ] Identify the “last known-good” Git commit/tag (if available).
- [ ] Identify the current target commit/branch under audit (e.g., `main` at SHA).
- [ ] If last-good is unknown:
  - [ ] Pick a time-boxed window to locate it (release notes, CI runs, `git bisect` plan).
  - [ ] Document the chosen fallback baseline and risks.

### 3) Build the Parity Matrix (single source of truth)

- [ ] Create the parity matrix table (can live in this file or a dedicated doc) with columns:
  - [ ] Flow/feature, expected behavior, PG behavior, Git behavior, parity, severity, evidence, owner, fix idea.
- [ ] Populate the flow list:
  - [ ] Start from the product’s primary workflows (top 10–20).
  - [ ] Add known “Git-specific” historical workflows (history/diff/branch/merge/sync).
  - [ ] Add system workflows (background jobs, imports, exports, webhooks).
- [ ] For each row, define:
  - [ ] Preconditions/seed data required.
  - [ ] Exact steps (API calls/UI steps) to reproduce.
  - [ ] Concrete “pass” criteria (outputs, side effects, invariants).

### 4) Static Code Audit: Map PG vs Git Implementations

- [ ] Identify backend abstraction boundaries:
  - [ ] Repository/DAO interfaces.
  - [ ] Domain services that wrap persistence/versioning.
  - [ ] Shared validation/authorization layers.
- [ ] For each parity-matrix flow, document call chains:
  - [ ] Entry point (route/handler/resolver/command).
  - [ ] Domain service method(s).
  - [ ] Backend-specific implementation for PG.
  - [ ] Backend-specific implementation for Git.
- [ ] Record drift signals (turn into backlog items):
  - [ ] PG-only methods/fields/behaviors.
  - [ ] Git TODOs/stubs/dead code paths.
  - [ ] Divergent error handling or missing error mapping.
  - [ ] Differences in ordering/pagination semantics.
  - [ ] Authorization inconsistencies.

### 5) Define Contract Parity Rules (what must match)

- [ ] For each operation category, specify contract requirements:
  - [ ] Data invariants (defaults, uniqueness, referential integrity expectations).
  - [ ] Ordering guarantees and tie-breaking.
  - [ ] Pagination and stability under concurrent writes.
  - [ ] Error semantics (codes/messages, retryability, partial failures).
  - [ ] Idempotency expectations.
  - [ ] Concurrency/conflict semantics.
  - [ ] Authorization expectations (including “404 vs 403” decisions).
- [ ] List “allowed differences” and normalization rules (timestamps, ids, internal metadata).

### 6) Differential Scenario Suite (manual first, automate where it pays off)

- [ ] Create a deterministic seed dataset plan:
  - [ ] Minimal seed for core flows.
  - [ ] Seed for edge cases (large lists, special chars, deep nesting, etc.).
- [ ] For each parity-matrix row, define a scenario:
  - [ ] Seed → actions → expected outputs → expected side effects.
  - [ ] How to capture outputs (API response JSON, DB query results, git log/diff output).
- [ ] Establish comparison approach:
  - [ ] “PG is reference” diffs, or side-by-side goldens.
  - [ ] Normalization step to remove benign differences.
- [ ] Decide what to automate now:
  - [ ] P0 flows automated.
  - [ ] P1 flows time permitting.
  - [ ] P2 flows documented/manual.

### 7) Execute Differential Runs and Record Evidence

- [ ] Run the scenario suite in **PG mode** and capture outputs.
- [ ] Run the same scenario suite in **Git mode** and capture outputs.
- [ ] For each observed mismatch:
  - [ ] Attach raw outputs (before normalization when possible).
  - [ ] Summarize the user-visible behavior difference.
  - [ ] Assign severity (P0/P1/P2).
  - [ ] Identify whether it’s regression vs feature lag vs intentional divergence.
- [ ] For suspected regressions:
  - [ ] Re-run on last-good Git baseline (if available) to confirm regression.
  - [ ] If needed, outline a bisect plan (time-boxed) and record results.

### 8) Non-Functional Checks (quick but high yield)

- [ ] Performance sanity checks on P0 endpoints/flows:
  - [ ] Compare latency distribution (cold vs warm).
  - [ ] Identify obvious scaling traps (O(n) loops, repeated git operations, N+1 queries).
- [ ] Reliability/failure modes:
  - [ ] Partial failure behavior (mid-operation crash).
  - [ ] Retry behavior and idempotency.
  - [ ] Locking/concurrency issues in Git mode vs PG transactions.
- [ ] Observability parity:
  - [ ] Confirm both modes emit sufficient logs/metrics/traces to debug mismatches.

### 9) Report Out and Create a Remediation Backlog

- [ ] Write an audit summary:
  - [ ] Current parity status (P0/P1/P2 counts).
  - [ ] Top user-impact issues.
  - [ ] Recommendation: support vs deprecate vs invest in parity.
- [ ] Create backlog items for each mismatch with:
  - [ ] Repro steps, evidence, expected vs actual behavior.
  - [ ] Likely root cause and fix location(s).
  - [ ] Test to add (parity guard).
  - [ ] Risk assessment.
- [ ] Decide remediation milestones (e.g., “P0 parity by date”, “P1 parity by date”).

### 10) Prevent Future Drift (optional but recommended)

- [ ] Add a minimal parity gate in CI:
  - [ ] P0 smoke scenarios run in both modes.
  - [ ] Parameterized test harness that can select backend.
- [ ] Establish documentation:
  - [ ] “How to run Git mode” stays up to date.
  - [ ] “Known intentional differences” list stays current.
  - [ ] Ownership for Git parity maintenance is explicit.

# FINDINGS

Audit status: **in progress** (static audit complete for mode selection + core API surfaces; runtime PG verification pending).

## Mode Selection (what routes to Git vs PG)

- Store selection is controlled by `RT_STORE=git|pg` and is enforced at runtime (`src/server/storeConfig.ts`).
- Most API routes explicitly branch on `store.mode` and call either:
  - Git helpers under `src/git/*` via `@git/*` imports, or
  - Supabase-backed RPC wrappers under `src/store/pg/*`.

## How To Run Locally (based on current code paths)

Both modes require `RT_STORE` and, for most interactive flows, Supabase env vars.

- Git mode (Git provenance + Supabase auth/profile):
  - Set in `.env.local`:
    - `RT_STORE=git`
    - `RESEARCHTREE_PROJECTS_ROOT=/absolute/path/to/data/projects` (or rely on default)
    - `NEXT_PUBLIC_SUPABASE_URL=...`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
    - (Optional) `SUPABASE_SERVICE_ROLE_KEY=...` if using waitlist enforcement in `middleware.ts`
  - Run: `npm run dev`
  - Notes:
    - The UI calls `/api/projects/**`, which uses `requireUser()` and will error if Supabase env is missing (`src/server/supabase/env.ts`).
    - LLM providers require user-stored tokens in Supabase Profile (`/api/profile`) unless using `mock`.
- PG mode (Supabase provenance + auth/profile):
  - Set in `.env.local`:
    - `RT_STORE=pg`
    - `NEXT_PUBLIC_SUPABASE_URL=...`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
    - Ensure migrations in `supabase/migrations/**` are applied
  - Run: `npm run dev`
  - Use `SMOKETEST.md` as the current manual E2E checklist.

## Git Mode “Hidden Dependencies” on Postgres/Supabase

Git mode is not “PG-free” in the current app:

- Auth and authz always use Supabase (`src/server/auth.ts`, `src/server/authz.ts`), regardless of `RT_STORE`.
- LLM user tokens are always fetched from Supabase Vault via PG RPC (`src/server/llmUserKeys.ts`, `src/store/pg/userLlmKeys.ts`), regardless of `RT_STORE`.
- `/api/projects` in Git mode lists from Git, but filters allowed projects using `project_members` in Supabase (`app/api/projects/route.ts`).
- Project creation in Git mode creates a Git repo *and* performs a “shadow” create in Postgres; if the PG step fails it deletes the Git repo (`app/api/projects/route.ts`).

Implication: Git mode is best understood as “Git provenance + Supabase auth/profile”, not a standalone backend.

## Confirmed Behavioral Divergences (Git vs PG)

These are user-visible differences that look intentional but should be explicitly accepted/documented as “allowed differences” (or brought into parity).

- Canvas (artefact) persistence model differs:
  - Git mode writes `artefact.md` per-branch and appends `state` nodes on each update (`src/git/artefact.ts`).
  - PG mode saves per-user drafts (`rt_save_artefact_draft`) and returns drafts preferentially; immutable canvas snapshots are attached opportunistically when nodes are appended with `attachDraft=true` (`supabase/migrations/2025-12-19_0015_rt_reads_v1.sql`, `supabase/migrations/2025-12-19_0012_rt_append_node_to_ref_v1.sql`).
  - Result: Git graph/history can show frequent “Canvas updated” events; PG mode typically won’t unless you also emit explicit canvas-save nodes (currently it doesn’t).
- Artefact API metadata differs:
  - Git `/api/projects/[id]/artefact` returns `lastStateNodeId` + `lastUpdatedAt` from latest `state` node.
  - PG `/api/projects/[id]/artefact` returns `lastStateNodeId: null` and uses `updatedAt` from draft/artefact read.
  - Evidence: `app/api/projects/[id]/artefact/route.ts`.
- Current branch semantics differ:
  - PG mode uses per-user “current ref” (`rt_get_current_ref_v1` / `rt_set_current_ref_v1`).
  - Git mode uses the repo HEAD (global for that repo).
  - Evidence: `src/store/pg/prefs.ts`, `src/git/utils.ts#getCurrentBranchName`, and route helpers like `getPreferredBranch(...)`.

## Parity Risks / Likely Bugs (needs decision + potential fixes)

- Hard-coded history window limits can break older merge/pin flows in PG mode:
  - `/api/projects/[id]/merge` in PG mode reads only the most recent 500 nodes from each branch when computing `sourceSpecific`, selecting payload nodes, and computing `sourceNodeIds` (`app/api/projects/[id]/merge/route.ts`).
  - `/api/projects/[id]/merge/pin-canvas-diff` in PG mode reads only the most recent 500 nodes from the target branch when locating the merge node and checking whether it’s already pinned (`app/api/projects/[id]/merge/pin-canvas-diff/route.ts`).
  - Git mode reads full branch histories (nodes file) and should not have this “merge node too old to pin” failure mode.
  - Severity candidate: P1 (becomes P0 if merges are expected on long-running projects).
- Graph “root anchor” may be wrong in PG mode for long histories:
  - Graph endpoint fetches `limit=500` nodes per branch and then treats the first returned node as the “root anchor” (`capNodesForGraph(nodes, MAX_PER_BRANCH)`).
  - Since `rt_get_history_v1` returns only the last N nodes, the “root” may just be the oldest node in the slice, not the true root.
  - Evidence: `app/api/projects/[id]/graph/route.ts`, `supabase/migrations/2025-12-19_0015_rt_reads_v1.sql`.
- History endpoint limit semantics differ (minor but worth locking down):
  - Git mode filters out `state` nodes *before* applying `limit`.
  - PG mode applies the `limit` in RPC and then filters out `state` nodes in the route.
  - This only matters if PG ever starts emitting `state` nodes; if it doesn’t, it’s harmless.
  - Evidence: `app/api/projects/[id]/history/route.ts`.
- Auth gating differences in server-rendered pages (Git mode):
  - `app/page.tsx` and `app/projects/[id]/page.tsx` require auth in PG mode but not in Git mode.
  - API routes still require auth, so Git mode pages may render but then fail on API calls (depending on how middleware/auth is configured).
- Branch/ref name validation can diverge between backends:
  - API schemas accept any non-empty string up to 120 chars for branch/ref names (`src/server/schemas.ts`).
  - Git mode ultimately relies on Git’s ref-name constraints and will error for invalid names.
  - PG mode stores ref names as `text` and may accept names Git would reject unless additional constraints exist in migrations/RPC.

## Surface Map (core flows and their implementations)

Core API surfaces that branch on `RT_STORE`:

- Projects: `app/api/projects/route.ts` (PG: `src/store/pg/projects.ts`; Git: `src/git/projects.ts` + PG shadow/membership)
- Chat: `app/api/projects/[id]/chat/route.ts` (PG: `src/store/pg/nodes.ts`, `src/store/pg/reads.ts`, `src/store/pg/prefs.ts`; Git: `src/git/nodes.ts`, `src/git/utils.ts`)
- History: `app/api/projects/[id]/history/route.ts` (PG: `src/store/pg/reads.ts`; Git: `src/git/utils.ts`)
- Graph: `app/api/projects/[id]/graph/route.ts` (PG: `src/store/pg/reads.ts`, `src/store/pg/prefs.ts`; Git: `src/git/branches.ts`, `src/git/utils.ts`, `src/git/stars.ts`)
- Branches: `app/api/projects/[id]/branches/route.ts` (PG: `src/store/pg/branches.ts`, `src/store/pg/prefs.ts`, `src/store/pg/reads.ts`; Git: `src/git/branches.ts`, `src/git/utils.ts`)
- Edit: `app/api/projects/[id]/edit/route.ts` (PG: `src/store/pg/branches.ts`, `src/store/pg/prefs.ts`, `src/store/pg/nodes.ts`; Git: `src/git/branches.ts`, `src/git/nodes.ts`, `src/git/utils.ts`)
- Merge: `app/api/projects/[id]/merge/route.ts` (PG: `src/store/pg/merge.ts` + reads; Git: `src/git/branches.ts`)
- Pin canvas diff: `app/api/projects/[id]/merge/pin-canvas-diff/route.ts` (PG: `src/store/pg/nodes.ts` + reads; Git: `src/git/nodes.ts` + reads)
- Stars: `app/api/projects/[id]/stars/route.ts` (PG: `src/store/pg/stars.ts`; Git: `src/git/stars.ts`)
- Artefact: `app/api/projects/[id]/artefact/route.ts` (PG: `src/store/pg/drafts.ts` + reads; Git: `src/git/artefact.ts`)
- Interrupt: `app/api/projects/[id]/interrupt/route.ts` (backend-agnostic abort; Git does an existence check via `src/git/projects.ts`)

## Draft Parity Matrix (core flows)

| Flow | Surface | Git path | PG path | Known diffs / risks | Status | Severity |
|---|---|---|---|---|---|---|
| List projects | `GET /api/projects`, `app/page.tsx` | `src/git/projects.ts#listProjects` (then filtered by PG membership in API) | `projects` table query + `rt_list_refs_v1` for counts | Git mode still depends on PG membership + auth; home page auth gating differs by mode | Risk | P1 |
| Create project | `POST /api/projects` | `src/git/projects.ts#initProject` + `rt_create_project` shadow | `rt_create_project` only | Git creates on-disk repo; PG does not | Divergent by design | P2 |
| List/switch/create branches | `GET/POST/PATCH /api/projects/[id]/branches` | `src/git/branches.ts` + git HEAD | PG RPC: `rt_list_refs_v1`, `rt_create_ref_*`, `rt_set_current_ref_v1` | Per-user current branch (PG) vs repo HEAD (Git); branch naming constraints may differ | Divergent by design | P1 |
| Load history | `GET /api/projects/[id]/history` | `src/git/utils.ts#readNodesFromRef` | `rt_get_history_v1` | Limit semantics differ if PG ever emits `state` nodes; PG supports `before_ordinal` internally but route doesn’t expose it | Risk | P2 |
| Load graph | `GET /api/projects/[id]/graph` | Reads full histories then caps | Reads last 500 nodes/branch via RPC then caps | PG “root anchor” can be wrong for long histories; potential truncation artifacts | Risk | P1 |
| Read canvas | `GET /api/projects/[id]/artefact` | `src/git/artefact.ts#getArtefactFromRef` | `rt_get_canvas_v1` (draft preferred) | Per-user drafts vs shared branch file; metadata differs (`lastStateNodeId`) | Divergent by design | P1 |
| Save canvas | `PUT /api/projects/[id]/artefact` | Writes file + appends `state` node | Saves draft only (`rt_save_artefact_draft`) | Git emits state nodes; PG avoids chat spam by design | Divergent by design | P2 |
| Chat (stream + persist) | `POST /api/projects/[id]/chat` | `src/git/nodes.ts#appendNodeToRefNoCheckout` | `rt_append_node_to_ref_v1` | Both use in-process ref lock; PG has DB-level serialization, Git does not (serverless risk) | Risk | P0/P1 |
| Interrupt stream | `POST /api/projects/[id]/interrupt` | Same (plus project existence check) | Same | Minimal | Parity (static) | P2 |
| Edit message (branch from node) | `POST /api/projects/[id]/edit` | `getCommitHashForNode` + `createBranch` + append node | `rt_create_ref_from_node_parent_v1` + append node | Requires node-to-commit mapping; PG relies on node existing in DB | Parity (static) | P1 |
| Merge branch | `POST /api/projects/[id]/merge` | `src/git/branches.ts#mergeBranch` (full history) | `rt_merge_ours_v1` + reads (last 500 nodes) | PG merge payload selection may fail if relevant nodes are older than 500; Git should not | Risk | P1 |
| Pin canvas diff | `POST /api/projects/[id]/merge/pin-canvas-diff` | Reads full history | Reads last 500 nodes | PG cannot pin if merge node is older than window | Risk | P1 |
| Stars | `GET/POST /api/projects/[id]/stars` | `src/git/stars.ts` (stored on trunk) | `rt_toggle_star_v1` / `rt_get_starred_node_ids_v1` | Semantics may differ across branches (Git pins to trunk file) | Risk | P2 |
| User LLM tokens | `GET/PUT /api/profile` | N/A | PG-only (Vault-backed) | Git mode still depends on this | Divergent by design | P1 |

## Test Coverage Snapshot (what is and isn’t exercised today)

- `npm test` passes locally (Vitest) for Git helper suites and server route suites.
- Route tests cover both `RT_STORE=git` and `RT_STORE=pg`, but PG mode is mocked at the `src/store/pg/*` boundary (no live Supabase/PostgREST integration in CI by default).
- There is no automated “run the same scenario against both backends and diff outputs” harness yet; the closest is `SMOKETEST.md` for manual PG E2E.

## Recommended Differential Scenarios (to finish the audit)

Run these in both `RT_STORE=pg` and `RT_STORE=git`, capturing API responses and any server logs:

- Long-history truncation checks (PG risk): create >600 message nodes on a branch, then:
  - Merge a feature branch whose unique assistant payload is older than the last 500 nodes.
  - Attempt “pin canvas diff” on a merge node older than the last 500 nodes.
- Branch name validity: try creating/switching branches with names that Git rejects but `zod` currently allows (e.g., spaces, `..`, `~`, `^`, trailing `.`) and confirm behavior is either consistently rejected or intentionally divergent.
- Canvas semantics: verify “draft persists across refresh” and “no chat spam on autosave” in both modes; confirm whether multi-user visibility of canvas is expected to differ.
- Graph root anchoring: for long histories, verify whether the graph remains navigable/connected in PG mode and whether root anchoring is acceptable when histories are truncated.
- Concurrency sanity: open two tabs and send messages rapidly to the same project/ref; verify no duplicate/missing nodes and that ordering/parents remain valid.

# PAAS TODOs

Items that require you to verify/configure in Supabase/Vercel (or other PaaS) before we can finish the “runtime differential” portion of the audit.

- [ ] Supabase: confirm all migrations under `supabase/migrations/**` are applied (especially Vault / user key read compatibility ones from `2025-12-20_*` and `2025-12-21_*`).
- [ ] Supabase: confirm `rt_get_history_v1`, `rt_get_canvas_v1`, `rt_append_node_to_ref_v1`, `rt_merge_ours_v1`, `rt_create_ref_from_ref_v1`, `rt_create_ref_from_node_parent_v1`, `rt_toggle_star_v1`, `rt_save_artefact_draft` are present and executable by `authenticated`.
- [ ] Supabase: confirm RLS is enabled and policies behave as expected for `projects`, `project_members`, `refs`, `commits`, `nodes`, `commit_order`, `artefacts`, `artefact_drafts`, `stars` (member can read/write only within their projects).
- [ ] Supabase/PostgREST: if you see schema-cache errors (“Could not find the function …”), run `select pg_notify('pgrst', 'reload schema');` and wait for reload (see `SMOKETEST.md` troubleshooting).
- [ ] Vercel (or prod runtime): confirm `RT_STORE` is set to the intended value for each environment (prod/staging/dev).
- [ ] Vercel: confirm `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present for all environments that require auth.
- [ ] Vercel: confirm whether `middleware.ts` runs in an Edge runtime and whether `SUPABASE_SERVICE_ROLE_KEY` is available there (and if not, which allowlist gate behavior you expect).
- [ ] If you ever intend to run Git mode in a serverless deployment: confirm whether the runtime provides persistent writable filesystem + single-writer guarantees; otherwise Git mode will be unsafe/inoperable (locks are in-process only in `src/server/locks.ts`).
- [ ] If running Git mode anywhere other than local dev: document where repos live (`RESEARCHTREE_PROJECTS_ROOT`) and how persistence/backup is handled (volume, snapshots, retention).
