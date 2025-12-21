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

## AUDIT TODOs

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

- [ ] Document how to run the app in **PG mode** locally (env vars, services needed).
- [ ] Document how to run the app in **Git mode** locally (repo location, required setup, auth).
- [ ] Identify runtime routing:
  - [ ] Where the selection happens (feature flag, config, DI container, middleware).
  - [ ] Whether mixed-mode paths exist (read PG/write Git, etc.).
- [ ] Confirm you can run the *same* request/flow against each backend deterministically.
- [ ] Capture the exact configs used for the audit (copy/paste into the evidence bundle).

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
