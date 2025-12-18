# Migration Plan: Git-on-disk ➜ Postgres-backed Provenance Store (Supabase)

Owner: engineer currently maintaining `src/git/*` + `app/api/projects/*`
Goal: replace git repos on disk with a Postgres-native store that preserves the MVP semantics: immutable provenance, branching, merge commits as DAG structure, and per-ref concurrency safety.

This doc is intentionally explicit: schema, transaction shapes, backfill, rollout, and what code to delete/replace.

---

## 0. What stays the same (product semantics)

We preserve these MVP behaviors:

1. **Project = isolated history + branches**
2. **Branch = a named ref pointing to a tip**
3. **Append node = atomic “one user action”**
4. **History reads are snapshot-consistent per ref**
5. **Merge = keep target content, but record merge structure + merge node payload**
6. **Per-ref concurrency safety**: prevent clobbering concurrent writers on the same ref

We explicitly *drop* the need for:

* working-tree sync (`checkout -f`, `reset --hard`, `clean -fd`)
* git plumbing (`hash-object`, `mktree`, `commit-tree`, `update-ref`)
* reflog hacks for branch create time

---

## 1. Target architecture (Postgres primitives)

We implement a “git-ish spine” with 3 core concepts:

* **refs**: branch pointers with CAS updates (like `update-ref <new> <old>`)
* **commits**: immutable DAG nodes (0–2 parents)
* **events**: your `nodes` as rows (replaces `nodes.jsonl`)

Artefacts (canvas markdown) also become rows (versioned by commit).

Optionally we add `commit_order` (recommended) to avoid recursive traversal for hot-path “history page” and “node index → commit” mapping.

---

## 2. Proposed Postgres schema (Supabase migrations)

### 2.1 Extensions / helpers

```sql
-- optional, but nice for gen_random_uuid()
create extension if not exists pgcrypto;
```

### 2.2 Tables

#### `projects`

If you already have one, keep it. Otherwise:

```sql
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null, -- references auth.users(id) logically
  name text not null,
  created_at timestamptz not null default now()
);
```

#### `project_members`

For multi-user later; for MVP you can just enforce `owner_user_id`.

```sql
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
```

#### `refs` (branches)

```sql
create table if not exists refs (
  project_id uuid not null references projects(id) on delete cascade,
  name text not null, -- 'main', 'edit/<...>', etc
  tip_commit_id uuid null, -- null for empty repo, but you can seed genesis commit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, name)
);

create index if not exists refs_tip_idx on refs(project_id, tip_commit_id);
```

#### `commits` (immutable)

```sql
create table if not exists commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent1_commit_id uuid null references commits(id),
  parent2_commit_id uuid null references commits(id),
  message text not null,
  author_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists commits_project_created_idx on commits(project_id, created_at);
create index if not exists commits_parent1_idx on commits(parent1_commit_id);
create index if not exists commits_parent2_idx on commits(parent2_commit_id);
```

#### `nodes` (event log rows)

Store your existing node shape; recommend `content_json` for flexibility.

```sql
create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  commit_id uuid not null references commits(id) on delete cascade,
  kind text not null, -- 'user_message', 'assistant_message', 'merge', 'state', etc
  role text not null, -- 'user'|'assistant'|'system' etc (optional redundancy)
  content_json jsonb not null, -- full node payload
  created_at timestamptz not null default now()
);

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

create index if not exists artefacts_project_commit_idx on artefacts(project_id, commit_id);
create index if not exists artefacts_project_kind_created_idx on artefacts(project_id, kind, created_at);
```

#### `stars` (trunk-only)

```sql
create table if not exists stars (
  project_id uuid not null references projects(id) on delete cascade,
  node_id uuid not null references nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, node_id)
);

create index if not exists stars_project_idx on stars(project_id);
```

#### `commit_order` (recommended)

This replaces `rev-list --reverse` and makes history reads cheap and deterministic per ref.

```sql
create table if not exists commit_order (
  project_id uuid not null references projects(id) on delete cascade,
  ref_name text not null,
  ordinal bigint not null,
  commit_id uuid not null references commits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, ref_name, ordinal),
  unique (project_id, ref_name, commit_id)
);

create index if not exists commit_order_commit_idx on commit_order(project_id, commit_id);
```

---

## 3. Supabase RLS policies (minimum viable)

Assumption: membership in `project_members` grants access.

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
```

### Policies (pattern)

Define a helper view or inline `exists(...)` checks. Example for `refs`:

```sql
create policy "refs_select_member"
on refs for select
using (
  exists (
    select 1 from project_members pm
    where pm.project_id = refs.project_id
      and pm.user_id = auth.uid()
  )
);

create policy "refs_write_member"
on refs for insert with check (
  exists (
    select 1 from project_members pm
    where pm.project_id = refs.project_id
      and pm.user_id = auth.uid()
  )
);

create policy "refs_update_member"
on refs for update
using (
  exists (
    select 1 from project_members pm
    where pm.project_id = refs.project_id
      and pm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from project_members pm
    where pm.project_id = refs.project_id
      and pm.user_id = auth.uid()
  )
);
```

Apply the same pattern to `commits/nodes/artefacts/stars/commit_order`.

**Important:** if server routes use the **service role key**, RLS is bypassed. That’s fine for MVP, but still keep policies for future client-side access.

---

## 4. Transaction shapes (the critical part)

Everything hinges on reproducing `appendNodeToRefNoCheckout` semantics:

* read tip
* create new commit (parent = old tip)
* insert node (and maybe artefact row)
* update ref tip with CAS (`WHERE tip = expected`)
* on conflict: retry

### 4.1 Append node to ref (hot path for chat streaming)

**TS function signature (recommended)**

```ts
appendNode({
  projectId,
  refName,
  nodeKind,
  role,
  contentJson,
  commitMessage,
  authorUserId,
}): Promise<{ newCommitId; nodeId; }>
```

**SQL inside a transaction**

1. Read current tip + last ordinal:

```sql
select tip_commit_id
from refs
where project_id = $1 and name = $2
for update; -- optional; see note below
```

If using `commit_order`:

```sql
select coalesce(max(ordinal), 0) as last_ordinal
from commit_order
where project_id = $1 and ref_name = $2;
```

2. Create commit:

```sql
insert into commits (project_id, parent1_commit_id, parent2_commit_id, message, author_user_id)
values ($pid, $oldTip, null, $msg, $author)
returning id;
```

3. Insert node:

```sql
insert into nodes (project_id, commit_id, kind, role, content_json)
values ($pid, $newCommit, $kind, $role, $contentJson)
returning id;
```

4. Insert commit_order row (recommended):

```sql
insert into commit_order (project_id, ref_name, ordinal, commit_id)
values ($pid, $ref, $lastOrdinal + 1, $newCommit);
```

5. CAS advance ref:

```sql
update refs
set tip_commit_id = $newCommit, updated_at = now()
where project_id = $pid and name = $ref and tip_commit_id is not distinct from $oldTip;
-- rowcount must be 1
```

**Retry logic**
If rowcount = 0, another writer advanced the ref. Rollback and retry (bounded attempts; jitter backoff).

**Locking note**

* If you do `FOR UPDATE` on the refs row, you serialize writers and may not need CAS retries.
* If you want “git-like” optimistic behavior, avoid `FOR UPDATE` and rely on CAS.
* For MVP simplicity, either is fine. I’d keep **CAS + retry** (closest to current mental model) and optionally add `pg_advisory_xact_lock(hash(projectId, refName))` if you want strict ordering for streaming.

### 4.2 Update artefact (canvas) on a ref

In git MVP this was “working-tree lane” + commit and blob snapshot. In Postgres it’s the same as append node, but also insert an artefact row.

Transaction steps:

* read `refs.tip_commit_id` as parent
* create commit
* insert artefact row with `content`, `content_hash = sha256(content)`
* optionally insert a “state” node recording artefact snapshot metadata (if you currently do that)
* CAS update ref
* insert commit_order row

### 4.3 Create branch (ref) from commit (edit flow)

Equivalent to `checkout -f <commit>; checkout -b <new>`.

```sql
insert into refs (project_id, name, tip_commit_id)
values ($pid, $newRef, $baseCommit)
on conflict do nothing; -- or error if already exists
```

Also seed `commit_order` for the new ref if you use it:

* simplest: set ordinal=0 with baseCommit (or copy ordering up to baseCommit if you need index mapping).
* for MVP: ordinal starts at 0 at branch creation; subsequent appends increment.

### 4.4 Merge “ours” semantics

Current git behavior: merge commit exists, tree stays target, and app-layer merge node stores summary/diff.

Postgres equivalent:

* base = target tip
* source = source tip
* create commit with parent1=base, parent2=source
* insert merge node content_json { mergeSummary, mergedAssistantContent, canvasDiff, ... }
* CAS update target ref to new merge commit
* commit_order increment on target ref

No need to modify artefact unless merge explicitly chooses to.

---

## 5. API route mapping (what to rewrite)

Replace internal `src/git/*` calls with `src/store/*` (or similar) using Supabase client on server.

### 5.1 Existing routes

#### `POST /api/projects`

* Today: init git repo + initial commit + seed files
* New:

  * create `projects` row
  * create membership row for current user
  * create initial “genesis” commit (no parents)
  * create `refs(main)` pointing to genesis
  * optionally insert initial artefact content (empty) on genesis commit

#### `GET /api/projects/[id]/history`

* Today: `git show <ref>:nodes.jsonl` then parse
* New:

  * given `ref` (or default main), use `commit_order` to fetch commits + nodes:

    * `select commit_id from commit_order where project_id=? and ref_name=? order by ordinal`
    * `select * from nodes where project_id=? and commit_id in (...) order by created_at` (or join)
  * pagination: use ordinal ranges

#### `POST /api/projects/[id]/chat`

* Today: no-checkout append node twice (user + assistant) on a ref
* New:

  * call `appendNode` for user message (CAS)
  * build context (see 6)
  * stream assistant; at end call `appendNode` for assistant message
  * keep your existing abort controller logic

#### `GET /api/projects/[id]/artefact`

* Today: `git show <ref>:artefact.md`
* New:

  * find artefact at/upto ref tip:

    * easiest: store artefact row per commit when changed; query latest artefact where commit is on the ref history.
  * With `commit_order`, it’s easy:

    1. get list of commit_ids for ref up to tip (or last N)
    2. `select * from artefacts where project_id=? and commit_id in (...) and kind='canvas_md' order by created_at desc limit 1`

#### `PUT/PATCH /api/projects/[id]/artefact`

* Today: force checkout + hash-object snapshot + commit nodes.jsonl + artefact.md
* New:

  * create commit + artefact row + optional state node + CAS update ref

#### `GET/POST /api/projects/[id]/stars`

* Today: `stars.json` in main only
* New:

  * `GET`: `select node_id from stars where project_id=?`
  * `POST toggle`: insert/delete (stars table)

#### `GET/POST/PATCH /api/projects/[id]/branches`

* Today: list branches, reflog created time, nodeCount from show
* New:

  * list: from `refs` (created_at/updated_at are real now)
  * nodeCount: `select count(*)` join commit_order/nodes per ref, or maintain a `refs.node_count` denormalized counter (optional)

#### `POST /api/projects/[id]/edit`

* Today: `rev-list --reverse` index -> commit hash; create branch from that commit; append edited message
* New:

  * translate node index -> commit using `commit_order` ordinal
  * create new ref pointing at that commit
  * append edited node to new ref

#### `POST /api/projects/[id]/merge`

* Today: merge -s ours and commit merge node
* New:

  * merge transaction (4.4)

#### `POST /api/projects/[id]/merge/pin-canvas-diff`

* Today: read nodes + append message node on ref
* New:

  * just append a node with the diff payload onto the target ref

---

## 6. Context assembly changes (`src/server/context.ts`)

Today context assembly reads:

* nodes.jsonl snapshot at ref
* artefact.md snapshot at ref

New context assembly reads:

* nodes from ref history (likely last N)
* latest artefact for the ref (or last artefact change in history)

Recommended shape with `commit_order`:

1. Determine ref tip ordinal (max ordinal).
2. Fetch last `K` commits via `commit_order` with `ordinal > max-K`.
3. Fetch nodes for those commits, ordered by commit ordinal then node created_at.
4. Fetch latest artefact among those commits (or do a second query scanning further back if none present; or maintain `refs.latest_artefact_commit_id`).

You’ll want to keep context deterministic:

* use `commit_order.ordinal` as the primary ordering
* nodes within the same commit can be ordered by `created_at` (or add `node_seq` integer if you ever store multiple nodes per commit)

---

## 7. Backfill / migration from on-disk git repos

We need a one-time migration that:

* reads each project repo
* enumerates branches and their commit histories
* recreates commits, refs, nodes, artefacts, stars

### 7.1 Strategy: “replay commits” (recommended)

For each git repo:

1. Create `projects` row with same projectId (if your IDs are stable UUIDs, reuse them).
2. Create `refs` rows for each branch.
3. For each branch:

   * run `git rev-list --reverse <branch>` to get commit hashes in order
   * for each commit hash:

     * parse node added in that commit (because MVP is “1 commit per appended node”)
     * create a Postgres `commit` row (store original git hash in `content_json.meta.gitCommitHash` or add a `git_commit_hash` column)
     * create a node row linked to that new commit
     * if the commit includes an artefact update: create artefact row
     * insert commit_order ordinal row
   * set refs.tip_commit_id to last commit in that ref

### 7.2 How to extract nodes/artefacts from git

Given your current format:

* `nodes.jsonl` at each commit contains the full history. But you only want the *delta* per commit.
* Easiest delta extraction:

  * for each commit `c` in rev-list order:

    * `git show c:nodes.jsonl` get full jsonl, take last line as “node added at c”
  * same for artefact:

    * `git show c:artefact.md`
    * compare with previous artefact content; if changed, insert artefact version row at this commit

Stars:

* `git show main:stars.json` parse and insert into `stars` table (these will reference node IDs; keep node IDs stable if they are already in node JSON)

Branch created time:

* ignore reflog; use migration time as created_at, or set created_at = first commit time (from `git show -s --format=%ct`)

### 7.3 Data consistency constraints during migration

* The node JSON should already contain its node id. Prefer to **preserve node ids**:

  * set `nodes.id = <existing nodeId>` rather than generating new
* If you preserve node ids, stars migration is trivial.

Commits:

* you can generate new UUIDs for commit ids; keep original git hash in metadata.

### 7.4 Migration tooling

Implement a Node script `scripts/migrate_git_to_pg.ts`:

* scans `data/projects/*`
* uses `simple-git` or shell `git` commands
* writes via Supabase service role client (server-side only)

Make migration idempotent:

* skip projects already migrated (store `projects.migrated_at`, or a `migration_versions` table)
* upsert refs, commits, nodes by stable ids where possible

---

## 8. Rollout plan (safe + reversible)

### Phase 0: Add Postgres store in parallel (no prod switch)

* Add schema + RLS
* Implement `src/store/*` with the transaction shapes above
* Add feature flag: `USE_PG_STORE=true/false`

### Phase 1: Dual-write (optional, if you want maximum safety)

* During chat append:

  * write to Postgres first (or second)
  * still write to git
* Reads remain from git for UI stability
* Add an integrity checker endpoint that compares:

  * branch counts
  * node counts per branch
  * latest artefact hash per branch

### Phase 2: Read-from-Postgres, write-to-both

* Flip reads (history, artefact, branches, graph) to Postgres
* Keep git writes as “backup” briefly

### Phase 3: Postgres only

* Stop writing git
* Deprecate `data/projects/*` storage

---

## 9. What to delete / keep in code

### Delete/replace

* `src/git/*` becomes `src/store/*`
* routes should no longer call git plumbing or working tree helpers
* remove:

  * `forceCheckoutRef`
  * `appendNodeToRefNoCheckout`
  * reflog usage
  * git identity config

### Keep conceptually

* Your node shape, merge node schema, context builder logic (rewired to SQL)
* Branch graph UI semantics (still uses commits/parents; now from `commits` table)

---

## 10. Graph endpoint replacement (`/graph`)

Today graph is inferred by listing branches and reading nodes.

New approach:

* list refs for project
* for each ref tip, you can build a DAG view by fetching commits reachable from tips.
  Two options:

1. **Shallow graph** (MVP):

   * only show tips and parent pointers for recent commits (last N ordinals per ref)
2. **Full graph**:

   * recursive CTE from all tips backwards until genesis

With `commit_order`, a cheap MVP graph is:

* for each ref, fetch last ~200 commits from commit_order
* build a unique set of commit_ids and fetch their parents from `commits`
* render edges parent→child

---

## 11. Performance notes (so you don’t get surprised)

* Hot path is `appendNode` during streaming: keep it as **one transaction**.
* `commit_order` is the key to avoiding recursive graph traversal for basic history.
* Indexes you definitely need:

  * `commit_order(project_id, ref_name, ordinal)`
  * `nodes(project_id, commit_id)`
  * `artefacts(project_id, commit_id)`

If history gets large, add paging by ordinal rather than offset-based pagination.

---

## 12. Acceptance tests (must pass before switching)

For a migrated project with branches and merges:

1. **Branch tips**

* Postgres ref tip matches git ref tip node count and last node id.

2. **History**

* For each branch, last 50 nodes match by id + content.

3. **Artefact**

* Latest artefact content matches git `show <tip>:artefact.md`

4. **Edit flow**

* “Edit node index i” targets the same original node as git version.

5. **Merge**

* Merge creates a commit with 2 parents and appends merge node; target content stays unchanged unless explicitly updated.

6. **Concurrency**

* Simulate two concurrent appends to same ref; one must retry and both nodes appear in order (no lost updates).

---

## 13. Implementation checklist (engineer action items)

1. Land DB migrations for tables + indexes + RLS.
2. Implement `src/store/refs.ts`, `commits.ts`, `nodes.ts`, `artefacts.ts` with the transaction APIs.
3. Replace route handlers one by one (start with read-only endpoints: branches/history/artefact).
4. Implement migration script from `data/projects/*` git repos.
5. Add feature flag and integrity checker.
6. Flip reads to Postgres; validate; then flip writes.

