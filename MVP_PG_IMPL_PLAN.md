# MVP Migration Plan: Git-on-disk ➜ Postgres-backed Provenance Store (Supabase)

Owner: engineer currently maintaining `src/git/*` + `app/api/projects/*`
Goal: replace git repos on disk (`data/projects/*`) with a Supabase-compatible Postgres store that preserves MVP semantics: immutable provenance, branching, merges as DAG structure, per-ref concurrency safety, and strict node/message ordering.

This doc is implementation-oriented: schema, RLS, RPC (transaction) shapes, backfill, rollout, and what code to delete/replace.

---

## 0. What stays the same (product semantics)

We preserve:

1. **Project = isolated history + branches**
2. **Branch = a named ref pointing to a tip**
3. **Append node = atomic “one user action”** (1 commit per appended node)
4. **History reads are snapshot-consistent per ref**
5. **Merge = keep target content, but record merge structure + merge node payload**
6. **Per-ref concurrency safety**: prevent clobbering concurrent writers on the same ref
7. **Strict ordering is essential**: no interleaving of nodes on a ref during streaming

We drop:

* working-tree sync (`checkout -f`, `reset --hard`, `clean -fd`)
* git plumbing (`hash-object`, `mktree`, `commit-tree`, `update-ref`)
* reflog hacks for branch create time

---

## 1. Decisions + assumptions (from review)

### 1.1 Decisions

1. **Supabase + Postgres stays; write ops are RPC**: every write path is a single Postgres transaction via `supabase.rpc(...)`.
2. **Auth is implemented now** using Supabase Auth; RLS is enabled and enforced for user-facing routes.
3. **Stable system IDs + user-facing labels** is the rule:
   * IDs are immutable and referenced everywhere.
   * Names/labels can change later without breaking references.
4. **Current branch is per-user, per-project** (no “git HEAD” analog).
5. **Strict node ordering** is enforced via a **DB-backed per-ref lease** (one active writer session per ref).
6. **Stars are mutable UI state** (not provenance) and should not create commits.
7. **Merge never auto-applies canvas**; merge records structure + diff/summary payload only.

### 1.2 Assumptions (current product)

* Not a collaboration tool yet (effectively one user per project), but **multiple sessions per user** are supported.
* “One session per branch” is enforced (at most one writer session per ref).
* Histories are modest (dozens to hundreds of nodes), but endpoints should still page/limit robustly.

---

## 1.3 Implementation lessons (write these rules down)

These are the “don’t get stuck in a debugging loop” rules we’ve already hit while implementing shadow-writes.

### Supabase RPC + schema cache gotchas

1. **Avoid RPC overloads and signature churn**:
   - Don’t define multiple functions with the same name.
   - Avoid changing parameter names/order after routes ship; PostgREST may keep an old signature cached.
   - Prefer versioned function names (`rt_*_v1`) so you can evolve without cache ambiguity.
2. **Default args rule**: in Postgres, once a parameter has a default, all following parameters must also have defaults. Keep optional params at the end.
3. **After applying migrations, reload PostgREST schema cache**:
   - Run `select pg_notify('pgrst', 'reload schema');`
   - Then wait ~30–60s if needed (Supabase can lag) and retry.
4. **Dev server can run stale compiled route code**:
   - If you’re seeing old behavior after a change, stop `next dev`, delete `.next/`, restart.

### Feature flags (rollout switches)

- `RT_STORE=git|pg`: selects the provenance backend for the deployment (picked at deploy start; no mid-run flipping).

Rule: a deployment runs **exactly one** store. No git↔pg fallback and no dual-write in product routes.

---

## 1.4 Single-store deployments (NO git fallbacks)

Top priority: remove all “Postgres failed → fall back to git” control flows. Deployments will be either git-only or pg-only; never both.

### Contract

1. When `RT_STORE=pg`:
   - No git reads/writes at runtime (no `@git/*` calls).
   - Route failures are surfaced (5xx) instead of silently “falling back”.
2. When `RT_STORE=git`:
   - No Postgres provenance reads/writes at runtime (no `rt_get_*`, `rt_append_*`, etc).
   - Supabase may still be used for auth + membership checks (this is not a provenance fallback).
3. Remove all “soft fallback / ignore errors” patterns:
   - No `try { pg } catch { git }`
   - No `console.error(...)` then returning success anyway

### Inventory (what must be deleted)

We delete every instance of these patterns:

1. Explicit fallbacks:
   - `console.error('[pg-read] ... falling back to git')`
   - `catch { return <git result> }` in a pg-mode branch
2. Soft fallbacks:
   - “PG op failed, but we still return success” (creates orphaned/half-migrated state)
   - “If Supabase not configured, return on-disk data” for endpoints that should be RLS-protected

Recommended grep queries:

- `rg -n "falling back to git|fallback to git|\\[pg-read\\]" app src tests -S`
- `rg -n "shadowWriteToPg|RT_SHADOW_WRITE" app src tests -S`
- `rg -n "@git/" app/api src/server -S` (ensure none execute in `RT_STORE=pg`)

### Refactor approach (mechanical + safe)

1. **Simplify store config**
   - `getStoreConfig()` should expose only `mode: 'git' | 'pg'`.
   - Delete all dual-store flags (ex: `RT_SHADOW_WRITE`) and any “readFromPg/usePgPrefs” derived booleans that hide fallback logic.
2. **Mode-gate every route**
   - Structure: `if (store.mode === 'pg') { /* pg-only */ return } else { /* git-only */ return }`
   - Never `try pg; catch git`.
3. **Remove git existence checks from pg paths**
   - In pg-mode, validate project existence/authorization via `projects`/RLS (or `requireProjectAccess`).
   - Do not call `@git/projects.getProject()` just to confirm the project exists.
4. **Remove git imports from pg bundles**
   - In routes/components that need both implementations, use dynamic imports inside the `if (store.mode === '...')` branch so the other side doesn’t load.
5. **Update tests**
   - Delete tests that assert fallback behavior.
   - Add tests that in `RT_STORE=pg`, a failing PG read returns error (not a git response), and that git functions are not called.

### Rollout sequence (minimize breakage)

1. Remove fallback from **read** endpoints first: history/artefact/graph/context.
2. Remove fallback from **write** endpoints: chat/edit/merge/branches/stars/artefact draft.
3. Remove `RT_SHADOW_WRITE` and delete all dual-write codepaths.
4. Update/replace tests accordingly.

### SECURITY DEFINER + extensions

1. **SECURITY DEFINER functions must be explicit about search path**:
   - Always add `security definer set search_path = public` to RPCs.
2. **Schema-qualify `pgcrypto` helpers in Supabase**:
   - Supabase commonly installs `pgcrypto` into the `extensions` schema.
   - Use `extensions.digest(convert_to(text,'utf8'), 'sha256'::text)` (not bare `digest(...)`).

### RLS and server-side calling pattern

1. **Do not rely on service-role in product routes**:
   - Product API routes should run as the signed-in user so RLS and `auth.uid()` checks behave like production.
   - Reserve the service role for one-time migration/backfill scripts.
2. **Even with SECURITY DEFINER, enforce auth + membership inside the function**:
   - All RPCs should `raise` if `auth.uid()` is null or the user is not a project member.

### Shadow-write safety (important)

1. **Shadow-write should be idempotent when possible**:
   - Prefer “sync whole set” RPCs (`rt_sync_stars`) over “toggle” RPCs when cache/signature mismatch risk exists.
2. **Do not FK shadow data to not-yet-migrated tables**:
   - Example: `stars.node_id` cannot FK to `nodes.id` until nodes are written to Postgres.
   - In shadow mode, drop that FK (we do this for stars), then re-introduce it once `nodes` is migrated.

### Canvas saves must not spam provenance/chat

1. **Canvas autosaves are drafts (mutable)**:
   - Store them in a draft table (`artefact_drafts`) keyed by `(project_id, ref_name, user_id)` (upsert).
2. **Only snapshot drafts into immutable artefacts at turn boundaries**:
   - On “send message” (user turn) and on merge (if needed).
3. **Never render canvas save nodes in chat**:
   - If legacy git writes still produce `state` nodes, filter them out at the history endpoint while migrating.

### Testing + local dev stability

1. **Keep tests offline**:
   - Tests should not hit Supabase/PostgREST. Force `RT_STORE=git` and `RT_SHADOW_WRITE=false` in `tests/setup.ts`.
2. **Avoid importing Next server-only modules at module scope in route handlers**:
   - Importing Supabase server clients often pulls in `next/headers` (`cookies()`), which can cause Vitest worker teardown hangs.
   - Use dynamic imports inside the `RT_PG_*` branches in API routes.

---

## 2. Target architecture (Postgres primitives)

We implement a “git-ish spine” with:

* **refs**: branches pointing to a tip commit + a per-ref “tip ordinal”
* **commits**: immutable DAG nodes (0–2 parents)
* **nodes**: the application event rows (replaces `nodes.jsonl`)
* **artefacts**: versioned canvas markdown (replaces `artefact.md`)
* **commit_order**: per-ref linear ordering (replaces `rev-list --reverse` and enables pagination + edit mapping)
* **ref_leases**: per-ref session lock (prevents streaming interleaving across tabs/instances)
* **project_user_prefs**: per-user “current branch”

---

## 3. Proposed Postgres schema (Supabase migrations)

### 3.1 Extensions / helpers

```sql
create extension if not exists pgcrypto;
```

### 3.2 Tables

#### `projects`

```sql
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null, -- auth.users(id) logically
  name text not null,
  description text null,
  created_at timestamptz not null default now()
);
```

#### `project_members`

Membership exists even for the owner so RLS can be membership-based.

```sql
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
```

#### `refs` (branches: stable id + user-facing name)

```sql
create table if not exists refs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null, -- user-facing label; unique within project
  tip_commit_id uuid null, -- seed with genesis commit id
  tip_ordinal bigint not null default -1, -- ordinal of tip *node*; -1 means "no nodes yet"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists refs_project_name_idx on refs(project_id, name);
create index if not exists refs_tip_idx on refs(project_id, tip_commit_id);
create index if not exists refs_updated_idx on refs(project_id, updated_at desc);
```

#### `commits` (immutable DAG)

```sql
create table if not exists commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent1_commit_id uuid null references commits(id),
  parent2_commit_id uuid null references commits(id),
  message text not null,
  author_user_id uuid not null,
  git_commit_hash text null, -- optional: set during migration/backfill
  created_at timestamptz not null default now()
);

create index if not exists commits_project_created_idx on commits(project_id, created_at);
create index if not exists commits_parent1_idx on commits(parent1_commit_id);
create index if not exists commits_parent2_idx on commits(parent2_commit_id);
```

Integrity note: parent commits must belong to the same `project_id`. Enforce in RPC functions (and optionally via a trigger).

#### `nodes` (event log rows; keep node ids stable)

Matches current `src/git/types.ts` node shapes:
`type` is `'message' | 'state' | 'merge'`, and `role` is only for message nodes.

```sql
create table if not exists nodes (
  id uuid primary key, -- supplied by app/migration; keep stable
  project_id uuid not null references projects(id) on delete cascade,
  commit_id uuid not null references commits(id) on delete cascade,
  type text not null,
  role text null,
  timestamp_ms bigint not null,
  content_json jsonb not null, -- full NodeRecord payload (source of truth)
  created_at timestamptz not null default now()
);

create unique index if not exists nodes_unique_commit_idx on nodes(project_id, commit_id);
create index if not exists nodes_project_commit_idx on nodes(project_id, commit_id);
create index if not exists nodes_project_created_idx on nodes(project_id, created_at);
```

#### `artefacts` (versioned canvas markdown)

```sql
create table if not exists artefacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  commit_id uuid not null references commits(id) on delete cascade,
  kind text not null, -- 'canvas_md'
  content text not null,
  content_hash text not null, -- sha256 hex
  created_at timestamptz not null default now()
);

create unique index if not exists artefacts_unique_commit_kind_idx on artefacts(project_id, commit_id, kind);
create index if not exists artefacts_project_commit_idx on artefacts(project_id, commit_id);
create index if not exists artefacts_project_kind_created_idx on artefacts(project_id, kind, created_at);
```

#### `stars` (mutable UI state; no commits)

```sql
create table if not exists stars (
  project_id uuid not null references projects(id) on delete cascade,
  node_id uuid not null references nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, node_id)
);

create index if not exists stars_project_idx on stars(project_id);
```

#### `commit_order` (required; per-ref linear ordering)

This is the stable “node index” for a ref:

* `ordinal = 0` is the first node on that ref
* ordinals increase by 1 per appended node
* genesis commit is not in `commit_order`

```sql
create table if not exists commit_order (
  project_id uuid not null references projects(id) on delete cascade,
  ref_id uuid not null references refs(id) on delete cascade,
  ordinal bigint not null,
  commit_id uuid not null references commits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, ref_id, ordinal),
  unique (project_id, ref_id, commit_id)
);

create index if not exists commit_order_ref_ordinal_idx on commit_order(project_id, ref_id, ordinal desc);
create index if not exists commit_order_commit_idx on commit_order(project_id, commit_id);
```

#### `project_user_prefs` (per-user current branch)

```sql
create table if not exists project_user_prefs (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  current_ref_id uuid null references refs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_user_prefs_user_idx on project_user_prefs(user_id);
```

#### `ref_leases` (per-ref session lock)

Prevents multi-session interleaving during streaming. TTL-based with refresh.

```sql
create table if not exists ref_leases (
  project_id uuid not null references projects(id) on delete cascade,
  ref_id uuid not null references refs(id) on delete cascade,
  holder_user_id uuid not null,
  holder_session_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, ref_id)
);

create index if not exists ref_leases_expires_idx on ref_leases(expires_at);
create index if not exists ref_leases_holder_idx on ref_leases(holder_user_id);
```

---

## 4. Supabase Auth + RLS policies (minimum viable)

User-facing routes must use authenticated sessions so RLS applies. The service role key is reserved for migration tooling only.

### Enable RLS

```sql
alter table projects enable row level security;
alter table project_members enable row level security;
alter table refs enable row level security;
alter table commits enable row level security;
alter table nodes enable row level security;
alter table artefacts enable row level security;
alter table stars enable row level security;
alter table commit_order enable row level security;
alter table project_user_prefs enable row level security;
alter table ref_leases enable row level security;
```

### Policies (pattern)

Membership helper pattern (inline):

```sql
exists (
  select 1 from project_members pm
  where pm.project_id = <table>.project_id
    and pm.user_id = auth.uid()
)
```

Apply to `refs/commits/nodes/artefacts/stars/commit_order` for `select/insert/update`.

For `project_user_prefs`:

* allow `select/insert/update` only when `project_user_prefs.user_id = auth.uid()` and the user is a member of the project.

For `ref_leases`:

* allow read to project members
* allow insert/update only when `holder_user_id = auth.uid()` and the user is a member of the project

---

## 5. RPC transaction shapes (the critical part)

Why RPC: Supabase’s normal insert/update calls are separate HTTP requests and don’t provide multi-step atomicity. All writes below must happen in one DB transaction, so they live behind Postgres functions called via `supabase.rpc(...)`.

### 5.1 Ref lease RPCs (prevents interleaving)

**Session identity**

* Browser generates a per-tab `sessionId` (UUID) and stores it in `localStorage`.
* Server routes include it in every write call (`holder_session_id`).

**Acquire behavior**

* If no lease exists or it is expired: take it.
* If a valid lease exists for another session: return “busy” info.
* App behavior: wait up to `RT_REF_LEASE_WAIT_MS` (default 3000) by polling acquire; then fail with a clear message.

Recommended RPCs:

* `rt_acquire_ref_lease_v1(project_id, ref_id, holder_session_id, ttl_ms) -> { ok, expires_at, busy_expires_at, busy_holder_session_id }`
* `rt_refresh_ref_lease_v1(project_id, ref_id, holder_session_id, ttl_ms) -> { ok, expires_at }`
* `rt_release_ref_lease_v1(project_id, ref_id, holder_session_id) -> { ok }`

### 5.2 Append node to ref (hot path for chat streaming)

This replaces `src/git/nodes.ts:appendNodeToRefNoCheckout` and must preserve strict ordering.

Recommended RPC signature:

```ts
rt_append_node_v1({
  project_id,
  ref_id,
  holder_session_id,
  node_id,
  node_type,
  node_role,
  timestamp_ms,
  content_json,
  commit_message
}): Promise<{ new_commit_id; new_ordinal; }>;
```

Behavior (inside one function/transaction):

1. Validate lease: ensure `ref_leases` exists, is not expired, matches `auth.uid()` and `holder_session_id`.
2. Lock ref row: `select ... from refs ... for update`.
3. Insert commit with `parent1 = refs.tip_commit_id`.
4. Insert node row (id supplied by app).
5. Compute `new_ordinal = refs.tip_ordinal + 1`.
6. Insert `commit_order` row at `new_ordinal`.
7. Update `refs.tip_commit_id`, `refs.tip_ordinal`, `updated_at`.

**Canvas draft snapshot (important)**:

- Canvas autosaves are stored in `artefact_drafts` (mutable) and must not create chat-visible nodes or separate commits.
- At the user turn boundary, the append-node RPC may optionally snapshot the caller’s current draft into `artefacts` on the **same commit** as the message node (so node↔ordinal mapping stays 1:1), but only when the draft hash differs from the latest immutable artefact hash on that ref.

### 5.3 Update artefact (canvas) on a ref

This replaces `src/git/artefact.ts:updateArtefact`. It must:

* create a commit
* insert an artefact version row
* insert a `state` node for parity with existing UI
* advance ref + commit_order

Recommended RPC:

`rt_update_artefact_v1(project_id, ref_id, holder_session_id, content, content_hash, state_node_id, timestamp_ms) -> { new_commit_id; new_ordinal }`

In the state node payload, set `artefactSnapshot = content_hash` (replaces git blob hash).

### 5.4 Create branch (ref) from a base point (edit flow)

Key “same behavior as today” requirement: a new branch inherits shared prefix history.

How to compute the edit base (from the existing git behavior):

* locate the commit that introduced the target `nodeId` (`nodes.commit_id`)
* locate that commit’s ordinal on the source ref (`commit_order.ordinal` where `commit_id = nodes.commit_id`)
* base commit is `commits.parent1_commit_id` of that commit (genesis if null)
* base ordinal is `commit_order.ordinal - 1` (or `-1` if editing the first node)

Recommended RPC:

`rt_create_ref_from_base_v1(project_id, new_ref_name, source_ref_id, base_commit_id, base_ordinal) -> { new_ref_id }`

Steps:

1. Create a new `refs` row (`id` stable, `name` user label).
2. Copy `commit_order` rows from `source_ref_id` where `ordinal <= base_ordinal` into the new ref (same ordinals, same commit_ids).
3. Set `refs.tip_commit_id = base_commit_id` and `refs.tip_ordinal = base_ordinal` (or `-1` for “no nodes”).

### 5.5 Merge “ours” semantics

This replaces `src/git/branches.ts:mergeBranch` behavior:

* record merge structure (2 parents)
* keep target content unchanged
* record merge node payload (summary/diff + optional merged assistant content)
* never auto-apply canvas

Recommended approach:

1. Server route acquires target ref lease (and optionally shows a 2-step warning UI if the ref is busy).
2. Server route reads target tip + chosen source commit (typically source ref tip at request time).
3. Server route computes `canvasDiff` and chooses `mergedAssistantContent` (same logic as today; based on nodes unique to source branch).
4. RPC writes a merge commit + merge node + advances target ref + commit_order in one transaction.

RPC:

`rt_merge_ours_v1(project_id, target_ref_id, holder_session_id, expected_target_tip_commit_id, source_commit_id, merge_node_id, merge_payload_json, commit_message) -> { new_commit_id; new_ordinal }`

---

## 6. Read patterns + pagination (lightweight + robust)

Even with “hundreds of nodes max”, we still avoid “fetch everything always” and rely on ordinal-based paging for correctness and simplicity.

### 6.1 History paging by ordinal (recommended)

Keyset paging (no offsets):

* newest page: `order by ordinal desc limit N`
* older page: `where ordinal < $before order by ordinal desc limit N`

### 6.2 Draft-first canvas reads (MVP)

When `RT_STORE=pg`, the canvas endpoint should return:

1. the current user’s draft for `(project_id, ref_name)` if present (fast autosave UX), else
2. the latest immutable artefact on the ref history (join `commit_order` → `artefacts`), else
3. empty.

---

## 14. Route-by-route migration checklist (how we apply the lessons)

We keep the same HTTP routes, but progressively move their internals from `src/git/*` to RPC-backed Postgres.

### Cross-cutting rules for every route

- Every route calls `requireUser()` and uses the cookie-authenticated Supabase client (no service role).
- Every write path uses a single RPC (one transaction).
- Every shadow-write path is wrapped in `try/catch` and logs `[pg-shadow-write] ...` without breaking the user flow.
- After any migration/RPC change in Supabase: run `select pg_notify('pgrst', 'reload schema');` before debugging.

### `/api/projects/[id]/stars`

- Git remains source of truth until nodes migrate.
- Shadow-write uses `rt_sync_stars(project_id, node_ids[])` (idempotent).
- Ensure `stars.node_id` has no FK while nodes are not in PG (drop FK now; add back later).

### `/api/projects/[id]/artefact`

- Git remains source of truth for the visible canvas until we switch reads.
- Shadow-write writes drafts only (`rt_save_artefact_draft`).
- Do not create provenance nodes/commits for autosaves; only snapshot at turn boundary.
- When reads flip, use “draft-first” logic (draft → latest immutable artefact → empty), with git fallback during rollout.

### `/api/projects/[id]/chat`

- Add shadow-write of:
  - user message node → `rt_append_node_to_ref_v1(...)` with `attachDraft=true` (snapshots draft onto the same commit if changed)
  - assistant message node → `rt_append_node_to_ref_v1(...)` with `attachDraft=false`
- Preserve node IDs (app generates today); store them as `nodes.id`.
- Strict ordering: ensure a per-ref lock/lease is held for the duration of streaming, or use DB row locks + short lock timeout with clear UX.

### `/api/projects/[id]/history`

- Until reads flip, keep git reads but filter out any non-chat nodes (`type='state'`).
- When reads flip:
  - use `commit_order` to page deterministically
  - join `nodes` to fetch node payloads in ordinal order
  - keep a git fallback on errors while rollout is in progress

### `/api/projects/[id]/merge` (+ `/merge/pin-canvas-diff`)

- Shadow-write merge commit (2 parents) and merge node payload.
- Never auto-apply canvas; merge records diff/summary only.

### `/api/projects/[id]/branches` + `/edit` + `/graph`

- Defer until commits/nodes/commit_order writes exist (chat shadow-write).
- Then implement:
  - branches: `refs` list
  - edit mapping: `nodeId -> commit_id -> ordinal` (via `commit_order`)
  - graph: last N commits per ref + parent pointers from `commits`

This preserves strict ordering deterministically and makes “node index i” a real, stable concept on a ref.

### 6.2 Chat context reads

Chat context does not need “the entire lineage in one response”. It needs “enough recent history to build a prompt” and can remain bounded (similar to current `DEFAULT_HISTORY_LIMIT` in `src/server/context.ts`).

Recommended:

* fetch last `K` nodes by ordinal (e.g. 200–500)
* feed into existing token-budget trimming logic

### 6.3 Latest artefact on a ref

Query the most recent artefact on that ref’s history using ordinals:

* join `commit_order` to `artefacts` on `commit_id`
* pick the artefact with the maximum `commit_order.ordinal`

---

## 7. API route mapping (what to rewrite)

Replace internal `src/git/*` calls with `src/store/*` wrappers:

* writes: RPC
* reads: normal queries (or read RPCs if joins become awkward)

Also replace “current branch”:

* today: implicit git HEAD
* new: `project_user_prefs.current_ref_id`

### 7.1 Existing routes

#### `POST /api/projects`

* create `projects` row
* create `project_members` row for current user
* create genesis commit (no parents)
* create `refs(main)` pointing to genesis (tip_ordinal = -1)
* upsert `project_user_prefs.current_ref_id = main`

#### `GET /api/projects/[id]/branches`

* list from `refs`
* resolve current branch via `project_user_prefs`
* nodeCount can be derived as `tip_ordinal + 1`

#### `PATCH /api/projects/[id]/branches` (switch branch)

* update `project_user_prefs.current_ref_id`

#### `POST /api/projects/[id]/chat`

* resolve ref: `?ref=` else `project_user_prefs` else `main`
* acquire lease (wait up to `RT_REF_LEASE_WAIT_MS`)
* append user node (RPC)
* build context from last K nodes + latest artefact
* stream assistant; refresh lease during stream; append assistant node at end (RPC); release lease

#### `GET /api/projects/[id]/history`

* resolve ref (per above)
* return nodes with ordinal paging (`beforeOrdinal`, `limit`)

#### `GET/PUT /api/projects/[id]/artefact`

* resolve ref (per above)
* reads: latest artefact on ref + last state node timestamp
* writes: acquire lease then RPC artefact update (commit + artefact + state node)

#### `GET/POST /api/projects/[id]/stars`

* reads: select from `stars`
* writes: toggle relation (no commits)

#### `POST /api/projects/[id]/edit`

Same behavior as today:

* locate the target node on the source ref
* base commit is the parent of that node’s commit
* create a new ref from that base (copy commit_order prefix)
* set `project_user_prefs.current_ref_id` to the new ref
* acquire lease on new ref; append edited message node

#### `POST /api/projects/[id]/merge`

* default target ref = `main`
* acquire target lease (if busy: 2-step warning UI)
* compute merge payload from stable source/target tips
* RPC merge (parents + merge node + advance target ref + commit_order)

#### `POST /api/projects/[id]/merge/pin-canvas-diff`

* acquire target lease
* append message node containing the diff payload

---

## 8. Context assembly changes (`src/server/context.ts`)

Current:

* reads full `nodes.jsonl` and slices
* reads `artefact.md` snapshot

New:

* fetch last `K` nodes for a ref via `commit_order` (ordered by ordinal asc)
* fetch latest artefact on that ref via `commit_order → artefacts`
* preserve deterministic ordering: primary sort is ordinal

---

## 9. Backfill / migration from on-disk git repos

### 9.1 Key migration constraints

* Preserve node IDs: `nodes.id` must match existing JSONL ids (stars depend on that).
* Do **not** assume “1 git commit == 1 node”:
  * `stars.json` commits exist and don’t append nodes.

### 9.2 Strategy: “replay nodes”

For each project repo:

1. Create `projects` row (reuse the project UUID as `projects.id` if possible).
2. Create `project_members` + `project_user_prefs` for the owner user.
3. Create a genesis commit and `refs(main)` (and other branches).
4. For each branch:
   * run `git rev-list --reverse <branch>`
   * for each git commit `c`:
     * read `nodes.jsonl` at `c`; parse last node id
     * if the last node id is unchanged vs previous commit on this branch, skip (not a node-append commit)
     * otherwise:
       * create a Postgres commit row (`git_commit_hash = c`)
       * insert the node row (preserving `nodes.id`, `timestamp`, full `content_json`)
       * insert `commit_order` row (next ordinal)
       * if `artefact.md` changed at `c`: insert artefact row on that commit
   * set `refs.tip_commit_id` and `refs.tip_ordinal` for that branch
5. Stars:
   * read `git show main:stars.json` and upsert rows into `stars`

### 9.3 Tooling

Implement `scripts/migrate_git_to_pg.ts`:

* scans `data/projects/*`
* uses `git show` / `rev-list`
* writes using Supabase **service role** key (bypasses RLS)
* idempotent: record `migration_versions` or `projects.migrated_at` and upsert by stable ids

---

## 10. Rollout plan (safe + reversible)

### Phase 0: Add Supabase + auth + schema (parallel)

* Add Supabase Auth to the app (sessions + login/logout).
* Land DB migrations (tables + indexes + RLS + RPC functions).
* Implement `src/store/*` wrappers.
* Add feature flags:
  * `RT_STORE=git|pg`
  * `RT_SHADOW_WRITE=true/false` (shadow-write to Postgres when `RT_STORE=git`)

### Phase 1: Shadow-write + read flip (safe rollout)

* Keep git as the source of truth.
* Enable `RT_SHADOW_WRITE=true` to populate Postgres for verification.
* Optional: for read verification, set `RT_STORE=pg` in a non-prod deployment.

### Phase 2: Write-to-Postgres (RPC), optionally dual-write briefly

* Flip write paths to RPC.
* Optional: dual-write to git for a short window for safety.

### Phase 3: Postgres only

* Stop writing git
* Deprecate/remove `data/projects/*` storage and `src/git/*`

---

## 11. What to delete / keep in code

### Delete/replace

* replace `src/git/*` with `src/store/*`
* remove working-tree sync and git plumbing usage:
  * `forceCheckoutRef`
  * `appendNodeToRefNoCheckout`
  * reflog usage
  * git identity config

### Keep conceptually

* Node shapes (`message/state/merge`)
* Merge payload semantics (summary/diff/pin-diff)
* Context builder logic (rewired to SQL reads)

---

## 12. Graph endpoint replacement (`/graph`)

MVP approach:

* list refs
* for each ref, fetch last ~N `commit_order` commit_ids
* de-dupe commit_ids and fetch parents from `commits`
* render edges parent→child

---

## 13. Performance notes

* Hot path is append during streaming: keep it a single RPC transaction.
* Leases are lightweight (short TTL + refresh); avoid long-running DB transactions.
* Required indexes:
  * `commit_order(project_id, ref_id, ordinal desc)`
  * `nodes(project_id, commit_id)`
  * `artefacts(project_id, commit_id)`

---

## 14. Acceptance tests (must pass before switching)

For a migrated project with branches and merges:

1. **Branch tips**: ref tip ordinal + last node id match git.
2. **History**: for each branch, last 50 nodes match by id + content.
3. **Artefact**: latest artefact content matches git `show <tip>:artefact.md`.
4. **Edit flow**: editing a node targets the same base point as git version (parent commit semantics).
5. **Merge**: merge creates a 2-parent commit and appends merge node; target content stays unchanged.
6. **Concurrency/ordering**:
   * two sessions targeting the same ref: one is blocked (or fails after wait window)
   * no node interleaving occurs on a ref during streaming

---

## 15. Implementation checklist (engineer action items)

1. Add Supabase deps + env:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY` (server/migration only)
2. Implement Supabase Auth in the product (client + server session handling).
3. Land DB migrations: schema + indexes + RLS + RPC functions (append, artefact update, merge, branch create, stars toggle, leases).
4. Implement `src/store/*` wrappers:
   * writes: `supabase.rpc(...)`
   * reads: select/join queries
5. Update API route handlers to use `src/store/*` and per-user `project_user_prefs` for current branch.
6. Implement per-tab `sessionId` (localStorage) and send it on write requests for leases.
7. Implement migration script `scripts/migrate_git_to_pg.ts` (service role).
8. Add feature flag + integrity checker; flip reads, then writes, then delete git store.
