# ResearchTree MVP — Git Storage Architecture (Design Extraction)

This document distills the *native git features* currently used by the MVP implementation, how each feature is used, and where it is exercised (API routes + internal modules). It is derived from `MVP_GIT_ARCH_README.md` plus the concrete code in `src/git/*` and `app/api/projects/*`.

## Scope

- “Native git features” here means **git primitives/porcelain/plumbing commands and object-model concepts** (repos, refs, commits, trees, blobs, merge commits, reflog, etc.).
- Mapping is to:
  - API routes under `app/api/projects/**/route.ts`
  - Implementation modules under `src/git/*` and supporting server code (`src/server/*`) where it affects git usage.

## Quick Model Recap

- Each project is a git repo on disk: `data/projects/<projectId>/`.
- Project state lives in tracked files:
  - `nodes.jsonl` (append-only node log; 1 commit per appended node)
  - `artefact.md` (Canvas markdown)
  - `stars.json` (trunk-only starred node IDs)
  - `project.json`, `README.md`
- Two write “lanes” exist:
  - **Ref-safe / no-checkout**: advances a ref directly via plumbing (safe for concurrent streaming per ref).
  - **Working-tree / checkout**: uses checkout + add/commit (required for non-`nodes.jsonl` updates and current branch/merge operations).

---

## Inventory: Native Git Features We Use (and Where)

### 1) Repository initialization (creating a repo)

- **Git feature**: repository creation + first commit
- **Git commands (via `simple-git`)**:
  - `git init`
  - `git checkout -b <branch>` (via `checkoutLocalBranch`)
  - `git add …`
  - `git commit …`
- **How we use it**:
  - Create a per-project repo with a `main` branch and commit initial empty/seed files.
- **Code**:
  - `src/git/projects.ts:initProject`
- **API routes**:
  - `POST app/api/projects/route.ts`

### 2) Branches and refs (reasoning threads)

- **Git feature**: local branches (`refs/heads/*`), HEAD, branch listing
- **Git commands**:
  - List: `git branch` (via `branchLocal()`)
  - Create: `git checkout -b <new>` (via `checkoutLocalBranch`)
  - Switch: `git checkout <ref>` / forced checkout (see “force sync”)
  - Resolve ref: `git rev-parse <ref>` (via `revparse()`)
  - Identify current: `git rev-parse --abbrev-ref HEAD`
- **How we use it**:
  - `main` is trunk; other branches are exploration threads.
  - Some operations rely on HEAD/working tree being on a given branch (branch ops, merges, working-tree writes).
- **Code**:
  - `src/git/branches.ts:createBranch`
  - `src/git/branches.ts:switchBranch`
  - `src/git/branches.ts:listBranches`
  - `src/git/utils.ts:getCurrentBranchName`
  - `src/git/nodes.ts:appendNodeToRefNoCheckout` (normalizes to `refs/heads/<ref>` for updates)
- **API routes**:
  - `GET/POST/PATCH app/api/projects/[id]/branches/route.ts`
  - `GET app/api/projects/[id]/graph/route.ts` (calls `listBranches`)
  - `POST app/api/projects/[id]/edit/route.ts` (creates an edit branch)
  - `POST app/api/projects/[id]/merge/route.ts` (merges between branches)

### 3) Snapshot reads by ref/commit-ish (content-addressed reads)

- **Git feature**: “read file as of a ref/commit” without touching the working tree
- **Git commands**:
  - `git show <rev>:<path>`
- **How we use it**:
  - History/artefact reads are performed against a specific ref snapshot (or commit hash) for reproducible UI state and branch browsing.
  - `readNodesFromRef(projectId, <commitHash>)` is used as a cheap “read from commit” primitive (commit hashes are valid revs).
- **Code**:
  - `src/git/utils.ts:readNodesFromRef` (`git show <ref>:nodes.jsonl`)
  - `src/git/artefact.ts:getArtefactFromRef` (`git show <ref>:artefact.md`)
  - `src/git/stars.ts:getStarredNodeIds` (`git show main:stars.json`)
- **API routes**:
  - `GET app/api/projects/[id]/history/route.ts`
  - `GET app/api/projects/[id]/artefact/route.ts`
  - `GET app/api/projects/[id]/graph/route.ts`
  - `GET app/api/projects/[id]/stars/route.ts`
  - Indirectly via chat context assembly:
    - `POST app/api/projects/[id]/chat/route.ts` → `src/server/context.ts:buildChatContext`

### 4) Commits as the provenance log (1 commit per appended node)

- **Git feature**: immutable commit history as an append-only log
- **Git commands**:
  - `git add <paths>`
  - `git commit -m <message>`
- **How we use it**:
  - “One commit = one appended node” (or one derived operation) so `git log` aligns with user actions.
  - Commit messages are derived from node content with truncation: `src/git/utils.ts:buildCommitMessage`.
- **Code**:
  - `src/git/nodes.ts:appendNode` (working-tree lane)
  - `src/git/branches.ts:mergeBranch` (commits merge node)
  - `src/git/stars.ts:setStarredNodeIds` (commits `stars.json`)
  - `src/git/projects.ts:initProject` (initial commit)
- **API routes**:
  - `POST app/api/projects/route.ts` (init)
  - `POST app/api/projects/[id]/edit/route.ts` (append edited message; working-tree lane)
  - `PUT/PATCH app/api/projects/[id]/artefact/route.ts` (state node + artefact file commit; working-tree lane)
  - `POST app/api/projects/[id]/stars/route.ts` (stars commit; working-tree lane)
  - `POST app/api/projects/[id]/merge/route.ts` (merge commit + merge node)

### 5) Git object store: blob creation (`hash-object`) used as durable identifiers

- **Git feature**: content-addressed blobs; blob hashes used as stable IDs
- **Git commands**:
  - `git hash-object -w <path>` (write blob from file)
  - `git hash-object -w --stdin` (write blob from in-memory content)
- **How we use it**:
  - Artefact updates record `artefactSnapshot` = blob hash of `artefact.md` at that point in time.
  - No-checkout node appends write the new `nodes.jsonl` content as a blob directly from memory.
- **Code**:
  - `src/git/artefact.ts:updateArtefact` (snapshot via `hash-object -w artefact.md`)
  - `src/git/nodes.ts:appendNodeToRefNoCheckout` (blob via `hash-object -w --stdin`)
- **API routes**:
  - `PUT/PATCH app/api/projects/[id]/artefact/route.ts`
  - `POST app/api/projects/[id]/chat/route.ts` (via no-checkout append)
  - `POST app/api/projects/[id]/merge/pin-canvas-diff/route.ts` (via no-checkout append)

### 6) Git tree manipulation (`ls-tree` + `mktree`) to update one file without checkout

- **Git feature**: direct tree editing (plumbing)
- **Git commands**:
  - `git ls-tree -z <tree>`
  - `git mktree -z` (NUL-delimited input)
- **How we use it**:
  - Read the current commit’s tree, replace (or add) the `nodes.jsonl` entry with the new blob hash, and write a new tree object.
  - Uses `-z` for NUL-delimited parsing/serialization to avoid path edge cases.
- **Code**:
  - `src/git/nodes.ts:appendNodeToRefNoCheckout`
- **API routes**:
  - `POST app/api/projects/[id]/chat/route.ts`
  - `POST app/api/projects/[id]/merge/pin-canvas-diff/route.ts`

### 7) Commit construction (`commit-tree`) without index/working tree

- **Git feature**: create commits directly from a tree object (plumbing)
- **Git commands**:
  - `git commit-tree <tree> -p <parent> -m <message>`
- **How we use it**:
  - Build a commit for the new tree (containing updated `nodes.jsonl`) without touching the working tree or staging index.
  - Author/committer identity is set via env vars (not config) for this path.
- **Code**:
  - `src/git/nodes.ts:appendNodeToRefNoCheckout` (uses `GIT_AUTHOR_*` / `GIT_COMMITTER_*`)
- **API routes**:
  - `POST app/api/projects/[id]/chat/route.ts`
  - `POST app/api/projects/[id]/merge/pin-canvas-diff/route.ts`

### 8) Atomic ref updates (`update-ref` compare-and-swap) for per-ref concurrency safety

- **Git feature**: optimistic concurrency control at the ref level
- **Git commands**:
  - `git update-ref <refName> <newCommit> <expectedOldCommit>`
- **How we use it**:
  - `appendNodeToRefNoCheckout` advances `refs/heads/<ref>` only if it still points at the commit we started from, preventing clobbering concurrent writers.
  - In-process per-`(projectId, ref)` locks (`src/server/locks.ts`) are layered on top for stable ordering and simpler reasoning.
- **Code**:
  - `src/git/nodes.ts:appendNodeToRefNoCheckout`
  - Supporting: `src/server/locks.ts:acquireProjectRefLock`
- **API routes**:
  - `POST app/api/projects/[id]/chat/route.ts`
  - `POST app/api/projects/[id]/merge/pin-canvas-diff/route.ts`

### 9) Merge commits with “keep target content” strategy (`merge -s ours`)

- **Git feature**: merge commits that preserve DAG structure while choosing one side’s tree
- **Git commands**:
  - `git merge -s ours --no-commit <sourceBranch>`
  - `git merge --abort` (error recovery)
- **How we use it (MVP semantics)**:
  - Preserve the branch DAG relationship (a merge commit exists) while keeping target branch file contents unchanged.
  - Reintegration is done at the application layer by appending a `merge` node containing:
    - `mergeSummary` (injected into future context)
    - `mergedAssistantContent` (a chosen assistant payload message)
    - `canvasDiff` (a stored diff string, optionally “pinned” into context as a new assistant message)
- **Code**:
  - `src/git/branches.ts:mergeBranch`
  - `app/api/projects/[id]/merge/pin-canvas-diff/route.ts` (pins the diff by appending a message node)
- **API routes**:
  - `POST app/api/projects/[id]/merge/route.ts`
  - `POST app/api/projects/[id]/merge/pin-canvas-diff/route.ts`

### 10) Forced working-tree synchronization (`checkout -f`, `reset --hard`, `clean -fd`)

- **Git feature**: treating the working tree as disposable when refs advance without checkout
- **Git commands**:
  - `git checkout -f <ref>`
  - On failure recovery:
    - `git reset --hard`
    - `git clean -fd`
- **How we use it**:
  - Any operation that depends on the working tree (branch ops, merges, non-node file writes) force-syncs the working tree to a target ref before doing work, since ref-safe writes can make the working tree stale.
- **Code**:
  - `src/git/utils.ts:forceCheckoutRef`
  - Used by:
    - `src/git/branches.ts:createBranch`, `switchBranch`, `mergeBranch`
    - `src/git/artefact.ts:updateArtefact`
    - `src/git/stars.ts:setStarredNodeIds`
- **API routes**:
  - `POST/PATCH app/api/projects/[id]/branches/route.ts`
  - `POST app/api/projects/[id]/merge/route.ts`
  - `PUT/PATCH app/api/projects/[id]/artefact/route.ts`
  - `POST app/api/projects/[id]/stars/route.ts`
  - `POST app/api/projects/[id]/edit/route.ts` (via `createBranch`)

### 11) Commit-ish resolution and ancestry enumeration (`rev-parse`, `rev-list`)

- **Git feature**: resolving refs/commit-ish; enumerating commit history
- **Git commands**:
  - `git rev-parse <ref>` / `git rev-parse <commit>^{tree}`
  - `git rev-list --reverse <ref>`
- **How we use it**:
  - No-checkout lane resolves:
    - current tip commit of a ref
    - tree hash of a commit
  - Edit flow maps “node index” → “commit hash” by enumerating commits on a ref and indexing into the list.
- **Code**:
  - `src/git/nodes.ts:appendNodeToRefNoCheckout` (via `src/git/gitExec.ts`)
  - `src/git/utils.ts:getCommitHashForNode`
- **API routes**:
  - `POST app/api/projects/[id]/chat/route.ts` (no-checkout lane)
  - `POST app/api/projects/[id]/edit/route.ts` (edit → branch from parent commit)

### 12) Reflog inspection for “branch created time” (`reflog show`)

- **Git feature**: reflog as a timestamp source
- **Git commands**:
  - `git reflog show --date=unix --format=%ct --reverse <branch>`
  - Fallback: `git show -s --format=%ct <ref>`
- **How we use it**:
  - Estimate branch creation time for sorting/UX. If reflog is missing/unavailable, fall back to last-modified.
- **Code**:
  - `src/git/branches.ts:getBranchCreatedTimestamp`
  - `src/git/branches.ts:listBranches`
- **API routes**:
  - `GET app/api/projects/[id]/branches/route.ts`
  - `GET app/api/projects/[id]/graph/route.ts` (calls `listBranches`)

### 13) Per-repo git identity configuration (`config user.name/email`)

- **Git feature**: repo-local identity required for porcelain commits
- **Git commands**:
  - Read: `git config --get user.name` / `git config --get user.email`
  - Write: `git config user.name …` / `git config user.email …` (via `simple-git.addConfig`)
- **How we use it**:
  - Ensure porcelain `git commit` operations have author identity configured.
  - Note: the no-checkout `commit-tree` path sets author/committer via env and does not require repo config.
- **Code**:
  - `src/git/utils.ts:ensureGitUserConfig`
  - Called from:
    - `src/git/projects.ts:initProject`
    - `src/git/nodes.ts:appendNode`
    - `src/git/branches.ts:mergeBranch`
    - `src/git/stars.ts:setStarredNodeIds`
    - `src/git/artefact.ts:updateArtefact` (via `appendNode`)
- **API routes**:
  - Any route that ultimately executes porcelain commits: projects POST, edit POST, merge POST, artefact PUT/PATCH, stars POST.

### 14) Staging index usage (`git add`) (working-tree lane only)

- **Git feature**: index/staging area
- **Git commands**:
  - `git add <paths>`
- **How we use it**:
  - Stage a small, explicit set of files per operation (`nodes.jsonl` plus any updated working-tree files).
  - No-checkout lane does *not* use the index.
- **Code**:
  - `src/git/nodes.ts:appendNode`
  - `src/git/projects.ts:initProject`
  - `src/git/branches.ts:mergeBranch`
  - `src/git/stars.ts:setStarredNodeIds`
- **API routes**:
  - Same set as “Commits as provenance log” for working-tree lane routes.

### 15) Working-tree cleanliness check (`git status`) (present, currently unused)

- **Git feature**: detecting a dirty working tree
- **Git commands**:
  - `git status` (via `simple-git.status()`)
- **How we use it**:
  - Helper exists to enforce cleanliness before operations, but is not currently invoked by routes.
- **Code**:
  - `src/git/utils.ts:ensureCleanWorkingTree`
- **API routes**:
  - None (currently).

---

## Route-to-Git “Call Graph” (ASCII AST)

Legend:
- `route` = API route handler
- `fn` = internal function
- `git:` = native git command(s) involved (directly or via `simple-git`)

```
ResearchTreeGitUsage
|
|-- route: POST app/api/projects/route.ts
|   `-- fn: src/git/projects.ts:initProject
|       |-- git: init
|       |-- git: checkout -b main        (checkoutLocalBranch)
|       |-- git: config user.*           (ensureGitUserConfig)
|       |-- git: add + commit            (seed files)
|
|-- route: GET app/api/projects/route.ts
|   `-- fn: src/git/projects.ts:listProjects
|       `-- fn: src/git/utils.ts:getCurrentBranchName
|           `-- git: rev-parse --abbrev-ref HEAD
|
|-- route: GET app/api/projects/[id]/history/route.ts
|   `-- fn: src/git/utils.ts:readNodesFromRef
|       `-- git: show <ref>:nodes.jsonl
|
|-- route: POST app/api/projects/[id]/chat/route.ts
|   |-- fn: src/git/nodes.ts:appendNodeToRefNoCheckout   (user message)
|   |   |-- git: rev-parse <ref>
|   |   |-- git: show <ref>:nodes.jsonl
|   |   |-- git: hash-object -w --stdin
|   |   |-- git: rev-parse <commit>^{tree}
|   |   |-- git: ls-tree -z + mktree -z
|   |   |-- git: commit-tree
|   |   `-- git: update-ref <heads/ref> <new> <old>      (CAS)
|   |
|   |-- fn: src/server/context.ts:buildChatContext
|   |   |-- fn: src/git/utils.ts:readNodesFromRef        (git show <ref>:nodes.jsonl)
|   |   `-- fn: src/git/artefact.ts:getArtefactFromRef   (git show <ref>:artefact.md)
|   |
|   `-- fn: src/git/nodes.ts:appendNodeToRefNoCheckout   (assistant message; same git set)
|
|-- route: POST app/api/projects/[id]/interrupt/route.ts
|   `-- (no git; abort controller registry only)
|
|-- route: GET app/api/projects/[id]/artefact/route.ts
|   |-- fn: src/git/artefact.ts:getArtefactFromRef       (git show <ref>:artefact.md)
|   `-- fn: src/git/utils.ts:readNodesFromRef            (git show <ref>:nodes.jsonl)
|
|-- route: PUT/PATCH app/api/projects/[id]/artefact/route.ts
|   `-- fn: src/git/artefact.ts:updateArtefact
|       |-- fn: src/git/utils.ts:forceCheckoutRef
|       |   `-- git: checkout -f (+ reset --hard + clean -fd on retry)
|       |-- git: hash-object -w artefact.md              (snapshot)
|       `-- fn: src/git/nodes.ts:appendNode              (working-tree lane)
|           |-- git: checkout <ref>
|           |-- git: add [nodes.jsonl, artefact.md]
|           `-- git: commit
|
|-- route: GET app/api/projects/[id]/stars/route.ts
|   `-- fn: src/git/stars.ts:getStarredNodeIds
|       `-- git: show main:stars.json
|
|-- route: POST app/api/projects/[id]/stars/route.ts
|   `-- fn: src/git/stars.ts:toggleStar -> setStarredNodeIds
|       |-- fn: src/git/utils.ts:forceCheckoutRef        (git checkout -f main, etc)
|       |-- git: add stars.json
|       `-- git: commit
|
|-- route: GET app/api/projects/[id]/branches/route.ts
|   |-- fn: src/git/branches.ts:listBranches
|   |   |-- git: branch --list                           (branchLocal)
|   |   |-- git: rev-parse <branch>                      (tip commit)
|   |   |-- git: show -s --format=%ct <ref>              (last modified)
|   |   |-- git: reflog show ... --reverse <branch>      (created time; fallback to show)
|   |   `-- git: show <ref>:nodes.jsonl                  (nodeCount via readNodesFromRef)
|   `-- fn: src/git/utils.ts:getCurrentBranchName        (git rev-parse --abbrev-ref HEAD)
|
|-- route: POST/PATCH app/api/projects/[id]/branches/route.ts
|   `-- fn: src/git/branches.ts:createBranch | switchBranch
|       |-- git: branch --list
|       |-- fn: forceCheckoutRef                          (git checkout -f ...)
|       `-- git: checkout -b <new> / checkout <branch>
|
|-- route: POST app/api/projects/[id]/merge/route.ts
|   `-- fn: src/git/branches.ts:mergeBranch
|       |-- fn: forceCheckoutRef                          (target sync)
|       |-- git: merge -s ours --no-commit <source>
|       |-- git: add nodes.jsonl + commit                 (merge node commit)
|       `-- git: merge --abort                             (on error)
|
|-- route: POST app/api/projects/[id]/merge/pin-canvas-diff/route.ts
|   |-- fn: src/git/utils.ts:readNodesFromRef            (git show)
|   `-- fn: src/git/nodes.ts:appendNodeToRefNoCheckout   (plumbing write; CAS update-ref)
|
|-- route: POST app/api/projects/[id]/edit/route.ts
|   |-- fn: src/git/utils.ts:getCommitHashForNode
|   |   `-- git: rev-list --reverse <ref>                (index → commit hash)
|   |-- fn: src/git/branches.ts:createBranch             (from commit hash)
|   |   `-- git: checkout -f <commit> ; checkout -b <new>
|   `-- fn: src/git/nodes.ts:appendNode                  (working-tree lane add/commit)
|
`-- route: GET app/api/projects/[id]/graph/route.ts
    |-- fn: src/git/branches.ts:listBranches             (branch/revparse/reflog/show)
    |-- fn: src/git/utils.ts:readNodesFromRef            (git show per branch)
    `-- fn: src/git/stars.ts:getStarredNodeIds           (git show main:stars.json)
```

---

## Notes / Implications for Next Steps

- The MVP mixes **porcelain/index-based commits** and **plumbing/ref-only commits**. Any new operation that needs to be safe under concurrent streaming should either:
  - use ref-safe plumbing (extend `appendNodeToRefNoCheckout` to update more paths), or
  - be serialized with `withProjectLockAndRefLock` and force-sync the working tree via `forceCheckoutRef`.
- Current “native git” concurrency safety is primarily:
  - `git update-ref <new> <old>` (atomic CAS), plus
  - in-process locks (`src/server/locks.ts`) for ordering and working-tree protection.

