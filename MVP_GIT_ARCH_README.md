# ResearchTree MVP — Git Storage Architecture

This document describes how the MVP stores all project state in git repos on disk, how reads/writes work, and why some operations intentionally avoid `git checkout` (for correctness under concurrent streaming).

## Goals / Non‑Goals

**Goals**
- Immutable, append-only provenance of reasoning: every chat turn becomes a durable record.
- Branches represent exploration threads; trunk (“main”) represents the canonical output.
- Minimal moving parts: no external DB required for MVP.
- Safe under concurrent UI activity (especially multiple chat streams on different branches).

**Non‑Goals (MVP)**
- Multi-user concurrency in the same project repo.
- High-frequency writes / massive binary artefacts.
- Full 3-way merge UI for `artefact.md`.

## High-Level Model

Each “project” is a git repository on disk (under `data/projects/<projectId>` by default). We treat git as:
- An immutable commit history (provenance log),
- A branching DAG (reasoning branches),
- A content-addressed store (blobs/trees),
- A lightweight transactional mechanism (update a ref from an expected old value).

The app stores project state in a small set of files inside the repo:
- `nodes.jsonl`: append-only log of node records (the reasoning graph).
- `artefact.md`: the “Canvas” markdown output.
- `stars.json`: per-project starred node IDs.
- `project.json`: project metadata.
- `README.md`: user-facing notes.

Git branches/refs provide isolation between reasoning threads:
- `main` is the trunk.
- Other refs represent branches (e.g. `feature/foo`).

## Repository Layout (Per Project)

```
<PROJECTS_ROOT>/<projectId>/
  .git/
  nodes.jsonl
  artefact.md
  stars.json
  project.json
  README.md
```

All business logic is implemented in `src/git/*` and the Next.js route handlers under `app/api/projects/*`.

## Node Records (Reasoning DAG)

Nodes are stored line-by-line in `nodes.jsonl` as JSON objects. The file is treated as append-only: we do not rewrite or delete existing lines.

### Types
See `src/git/types.ts`.

- **MessageNode**
  - `type: "message"`
  - `role: "system" | "user" | "assistant"`
  - `content: string`
  - `interrupted?: boolean` (true if a streaming response was interrupted/aborted)
  - `pinnedFromMergeId?: string` (set when a message is a persisted “pin” of a merge’s `canvasDiff`)

- **StateNode**
  - `type: "state"`
  - `artefactSnapshot: string` (git blob hash of `artefact.md` at the time of update)

- **MergeNode**
  - `type: "merge"`
  - `mergeFrom: string` (source branch name)
  - `mergeSummary: string` (human summary injected into future contexts)
  - `sourceCommit: string` (commit hash of source branch at merge time)
  - `sourceNodeIds: string[]` (IDs in source branch not present in target branch)
  - `applyArtefact?: boolean` (legacy flag on older nodes; no longer produced by the API)
  - `mergedAssistantNodeId?: string` (source branch assistant node ID chosen as the merge “payload”)
  - `mergedAssistantContent?: string` (snapshot of the chosen assistant payload content)
  - `canvasDiff?: string` (snapshot of canvas diff; see below)

### Common Fields
- `id` (UUID)
- `timestamp` (ms)
- `parent` (previous node ID on this ref, or null)
- `createdOnBranch?` (branch name/ref at creation time)
- `contextWindow?`, `modelUsed?`, `tokensUsed?` (MVP metadata)

## Commit Strategy

We keep “one commit = one appended node” as the primitive operation. This yields:
- Clear provenance (git history matches user actions),
- A stable ordering,
- Easy debugging with `git log`.

In practice, a single chat “turn” typically produces two commits on the active ref:
1) user message node, then 2) assistant message node (possibly marked `interrupted: true` if stopped).

Important: `nodes.jsonl` is not merged textually across branches during merges. We intentionally avoid line-level merge conflicts by appending merge nodes on the target branch and treating merge summaries as the reintegration mechanism.

## Branching Model

Git branches map to reasoning threads.

Operations:
- **Create branch**: `src/git/branches.ts:createBranch`
- **Switch branch**: `src/git/branches.ts:switchBranch`
- **List branches**: `src/git/branches.ts:listBranches`

The UI always passes an explicit `ref` to history/chat/interrupt APIs so operations are scoped correctly.

The “active branch” shown in the UI is also tracked by the repo’s checked-out branch (HEAD) via the branch switch endpoint. Ref-safe chat writes do not change HEAD; they only move the target ref forward.

## Reading Data

### History
Route: `GET app/api/projects/[id]/history/route.ts`

Reads `nodes.jsonl` either:
- From the working tree (`getNodes`) when no ref is specified, or
- From a specific ref snapshot (`readNodesFromRef(projectId, ref)`) via `git show <ref>:nodes.jsonl`.

For correctness and reproducibility, the UI always passes `ref` so history reads come from the ref snapshot.

### Artefact (Canvas)
Route: `GET app/api/projects/[id]/artefact/route.ts`

Reads `artefact.md` from:
- A specific ref (`getArtefactFromRef(projectId, ref)`) if provided, or
- Trunk ref snapshot by default (`getArtefactFromRef(projectId, "main")`).

This distinction matters for correctness when browsing a non-trunk branch: the Canvas you see should match that branch’s commit snapshot. In practice, the UI always passes `ref`, so reads come from `git show <ref>:artefact.md` and are independent of whatever is currently checked out.

### Stars
Route: `GET app/api/projects/[id]/stars/route.ts`

Reads `stars.json` from trunk (stars are stored on trunk).

## Writing Data

This section is the “why” behind decisions like “chat writes no longer checkout the repo”.

### Two Lanes: Ref-Safe Writes vs Working-Tree Writes

The MVP uses two different write strategies, depending on the operation:

1) **Ref-safe writes (no checkout)** — used for long-lived, concurrent chat streaming.
   - We advance the target ref directly without touching the working tree.
   - This avoids checkout races and allows different branches to stream concurrently.

2) **Working-tree writes (requires checkout)** — used for operations that modify files beyond `nodes.jsonl` (e.g. `artefact.md`, `stars.json`) and for operations that currently depend on git porcelain merge/branch commands.
   - These flows intentionally force-sync the working tree to the ref they operate on before committing.

The key is consistency: we avoid checkout where it is unsafe (streaming), and we force-sync checkout where it is required (working-tree mutations).

### The Core Concurrency Problem (Why Avoid `checkout` During Streaming)

In the initial implementation, writing a node on a branch used:
- `simple-git.checkout(ref)`
- append to `nodes.jsonl`
- `git add` + `git commit`

That works in a single-threaded world. But it becomes unsafe when:
- Two requests stream concurrently to different branches, and
- Both try to `checkout` the repo’s working tree back and forth.

The working tree is shared process state. Concurrent checkouts can:
- Race and commit to the wrong branch,
- Corrupt the working tree,
- Cause “dirty tree” failures,
- Produce nondeterministic history.

Because streaming keeps requests open for a long time, these races are much more likely in practice.

### Working Tree Drift (Important)

Once we start advancing refs without touching the working tree (the ref-safe `appendNodeToRefNoCheckout` path), the repo’s checked-out working tree can become stale relative to the ref tip.

Example:
- The repo is currently checked out on `feature/foo`.
- A ref-safe chat write advances `refs/heads/feature/foo` to a new commit.
- The working tree does **not** update automatically, so `git status` may appear “dirty” even though there were no uncommitted user changes — the working tree is just behind the ref.

Design rule:
- Any operation that relies on the working tree (branch ops, merges, artefact/stars writes) must treat the working tree as disposable and force-sync it to the desired ref before proceeding.

Implementation:
- `forceCheckoutRef(projectId, ref)` does a `git checkout -f <ref>` and, if needed, a `reset --hard` + `clean -fd` before retrying.
- This is not “rewriting history”; it just ensures the working tree reflects the ref tip in a repo where refs may advance without checkout.

### Locking Strategy

We use in-memory async locks in `src/server/locks.ts`:

- **Project lock** (`acquireProjectLock`, `withProjectLock`)
  - Serializes all operations for a project (one queue).
  - Use for operations that still rely on working-tree mutation (e.g. artefact updates, stars writes, branch ops that checkout).

- **Project+Ref lock** (`acquireProjectRefLock`, `withProjectRefLock`)
  - Serializes only operations targeting the same `(projectId, ref)`.
  - Enables concurrent chat streams on different branches of the same project.

When mixing working-tree operations with ref-safe “no-checkout” updates, it’s important to avoid races on the same ref:
- Operations that update `main` via the working tree (e.g. `artefact.md` saves, stars updates, merges into trunk) should take the project lock **and** the `main` ref lock so they don’t interleave with chat streaming on `main`.
- We provide a helper `withProjectLockAndRefLock(projectId, ref, fn)` for this pattern.

### Chat Writes: No-Checkout Append (Safe Per-Ref Streaming)

Route: `POST app/api/projects/[id]/chat/route.ts`

To support concurrent chat streams on different branches safely, chat no longer uses `git checkout`. Instead it writes directly to the ref tip using git plumbing:

Implementation: `src/git/nodes.ts:appendNodeToRefNoCheckout`

What it does:
1. Read the current commit hash of the ref (`git rev-parse <ref>`).
2. Read `nodes.jsonl` as it exists at that commit (`git show <ref>:nodes.jsonl`).
3. Append a new JSON line to that content in-memory.
4. Store the new file content as a blob (`git hash-object -w --stdin`).
5. Recreate the tree with the updated `nodes.jsonl` entry (`git ls-tree` + `git mktree`).
6. Create a new commit pointing to that tree (`git commit-tree -p <oldCommit> -m <msg>`).
7. Move the ref forward with an optimistic compare-and-swap (`git update-ref refs/heads/<ref> <newCommit> <oldCommit>`).

Key safety properties:
- **No working tree mutation**: no checkout, no index, no shared-state races.
- **Atomic ref update**: `update-ref` with an expected old value prevents clobbering concurrent writers on the same branch.
- **Per-ref lock**: we additionally serialize `(projectId, ref)` in-process to keep ordering stable and simplify reasoning.

Important limitation (current MVP):
- `appendNodeToRefNoCheckout` only updates `nodes.jsonl` in the commit. It does not currently support committing additional files in the same commit (e.g. `artefact.md`, `stars.json`). Those operations still use working-tree based flows and should use the project lock.

### Interrupt Handling and Persistence

Route: `POST app/api/projects/[id]/interrupt/route.ts`

We keep an `AbortController` per `(projectId, ref)` in `src/server/stream-registry.ts`.

Flow:
1. `/chat` registers a controller for that ref.
2. UI calls `/interrupt?ref=<ref>` which triggers `abortStream`.
3. The streaming generator stops; `/chat` persists the assistant message with:
   - `content` = whatever has been buffered so far,
   - `interrupted: true`.

This yields a durable record of “what the model produced before you stopped it”.

### Artefact Updates (Canvas)

Route: `PUT app/api/projects/[id]/artefact/route.ts`
Implementation: `src/git/artefact.ts:updateArtefact`

Rules:
- Artefact updates are allowed on any branch/ref.
- Updates write `artefact.md` on the target ref and append a `state` node with a blob snapshot hash.

This flow uses working-tree writes and commits (it checks out the target ref, commits, then restores the previous checkout), so it should remain serialized with the project lock and the ref lock for the target.

### Stars

Stars are stored as `stars.json` on trunk and committed to git. (Implementation under `src/git/stars.ts` and API route `app/api/projects/[id]/stars/route.ts`.)

Like artefact writes, this is a working-tree write and should be serialized with the project lock.

### Edits

Route: `POST app/api/projects/[id]/edit/route.ts`

Edits create a new branch from the parent of a target message, then append an “edited” message on that new branch. The API supports editing any message role, but the UI only exposes it for user messages by default.

Note: Edit currently uses branch creation helpers (which rely on checkout). This should use the project lock unless ref-safe plumbing is implemented for branch operations too.

### Merges

Route: `POST app/api/projects/[id]/merge/route.ts`
Implementation: `src/git/branches.ts:mergeBranch`

MVP merge behavior:
- Uses `git merge -s ours --no-commit <sourceBranch>` to preserve the DAG structure while keeping target branch file contents.
- Appends a `merge` node describing what to bring back.

Merge “payload” (chat content):
- We do not merge the full source branch chat history into the target branch.
- Instead, each merge snapshots a single “final assistant” message from the source branch into the merge node (`mergedAssistantNodeId`, `mergedAssistantContent`).
- Context assembly includes this payload as an assistant message, so future generations can build on what was merged without importing the whole branch.

Legacy `applyArtefact`:
- Older merge nodes may include `applyArtefact?: boolean`, but merges no longer auto-apply `artefact.md` and the API no longer accepts this flag.

`canvasDiff`:
- Stored on the merge node as a simple line-based diff string where each line is prefixed with:
  - ` ` (context/unchanged),
  - `-` (removed from target),
  - `+` (added from source).
- Not injected into LLM context by default; it’s available to the user (and can be selectively brought into context later).

### Pinning Canvas Diff Into Context (Persistent)

If the user chooses to “add the canvas diff into context”, we do it by **appending a durable assistant message node** on the target branch:
- The pinned node is `type: "message"`, `role: "assistant"`.
- `content` is the full diff text (exactly the merge node’s `canvasDiff` string).
- `pinnedFromMergeId` references the merge node ID so the UI can show “Diff in context” and avoid double-pinning.

Because it’s just another persisted message node, it appears in chat history and is included in future context assembly like any other assistant message.

## Context Assembly

Implementation: `src/server/context.ts:buildChatContext`

Given a `ref`:
- Load nodes from that ref (`readNodesFromRef`).
- Load artefact from that ref (`getArtefactFromRef`).
- Build a system prompt including the current artefact content.
- Convert message nodes into chat messages.
- Inject merge summaries as additional system messages:
  - `Merge summary from <mergeFrom>: <mergeSummary>`
- Inject merge payload as an assistant message (if present):
  - `mergedAssistantContent`
- Apply a rough token budget to trim history.

This ensures branch chats see the correct snapshot of both history and artefact for that branch.

## Operational Notes / Debugging

To inspect a project repo:
- `git log --oneline --decorate --graph --all`
- `git show <ref>:nodes.jsonl | tail`
- `git show <ref>:artefact.md`

To reason about ordering:
- “Appending nodes” means “moving the branch ref forward by one commit with a new `nodes.jsonl` blob”.

To reason about safety:
- If an operation might touch the working tree or switch branches, it must be serialized at least per project.
- If an operation is ref-only and implemented with `update-ref`, it can be safely serialized per `(projectId, ref)` and can run concurrently with other refs.

## Known Constraints / Follow-Ups

 - **Canvas merges are “diff-only”**: merges do not auto-apply `artefact.md`; instead we store `canvasDiff` on the merge node and optionally pin that diff into context as a durable assistant message.
- **Non-chat operations still rely on checkout**: branch ops, artefact updates, stars writes. If we want full concurrency across those, they should be converted to ref-safe git plumbing as well (or run in separate worktrees).
- The in-memory lock maps are per server process. A multi-process deployment would require a shared lock mechanism (DB/Redis) or a different storage approach.
