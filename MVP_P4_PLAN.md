# Phase 4: Merge Semantics + Streaming Core Loop — Implementation Plan

## Goal
Finalize the “branch → explore → merge → continue” loop so it is:
- Consistent: branch/merge can be done from/to any branches without special cases.
- Provenance-first: anything that influences the model is persisted as nodes (not ephemeral UI toggles).
- Safe under streaming: chat streams are truly incremental, interruptible, and do not interleave commits mid-stream.

## Current State (Already Shipped)
- True incremental streaming + interrupt persistence (`interrupted: true` on partial assistant nodes).
- Locking supports concurrent streams on different branches (`(projectId, ref)` locks).
- Ref-safe chat writes (no checkout) for streaming (`appendNodeToRefNoCheckout` using `commit-tree` + `update-ref`).
- Working-tree safety for checkout-based operations (`forceCheckoutRef` before any working-tree mutation).
- Canvas (`artefact.md`) is editable on any branch/ref (autosave uses `?ref=`).
- Merge nodes can store a `canvasDiff` string (line-based diff) and the diff is not injected into context by default.
- Persistent “pin canvas diff into context”:
  - `POST /api/projects/[id]/merge/pin-canvas-diff` appends an assistant message node with `content = canvasDiff` and `pinnedFromMergeId = <mergeNodeId>`.
  - UI exposes a 2-step confirm action on merge nodes to pin the diff.

## Phase 3 Gap Audit (Outstanding / Drift)
Phase 3 planning assumed trunk-only Canvas and “applyArtefact” adoption. The implementation has moved to:
- Canvas is branch-local editable (Phase 3 doc + `README.md` still say trunk-only).
- `applyArtefact` is legacy only (merge does not auto-apply `artefact.md`; the API no longer accepts/returns an apply flag).

Remaining Phase 3-ish items worth cleaning up:
- Update `README.md` to reflect ref-safe chat writes + Canvas-per-branch + forced checkout rule.
- Add/strengthen context-builder regression tests around merge behavior (see below).
- Decide what to do with “attachments” UI affordance (wire or hide).

## Phase 4 Product Decisions (Locked In)

### Canvas merge
- A merge records a canvas diff (`canvasDiff`) but does not apply it to `artefact.md`.
- Canvas diff is accessible on the target branch and can be explicitly added into context.
- “Add into context” is persistent: it appends a durable assistant message node so history reflects what influenced later outputs.

### Chat merge
- Merges do not attempt to merge full chat history.
- Merge payload should be routed through a single assistant-authored “final payload” from the source branch.

## Work Items (Phase 4)

### 1) Define the Merge Payload Model (Chat Content)
Goal: the merge node should “show merged content always” and that content should be available for context assembly on the target branch.

Recommended implementation:
- Extend `MergeNode` with:
  - `mergedAssistantNodeId?: string` (node ID from source branch),
  - `mergedAssistantContent?: string` (copied content snapshot).
- Merge creation selects a payload:
  - Default: last assistant message on `sourceBranch` at merge time.
  - Optional override: client supplies `sourceAssistantNodeId`.

### 2) Update Merge API + Git Helper
Route: `POST /api/projects/[id]/merge`
- Add optional request field `sourceAssistantNodeId?: string`.
- Do not accept `applyArtefact` (legacy nodes may still carry the field).

Git helper: `src/git/branches.ts:mergeBranch`
- Resolve the source payload node (default last assistant).
- Populate merge node fields (`mergedAssistantNodeId`, `mergedAssistantContent`) alongside `canvasDiff`.

### 3) Update Context Assembly Rules
Implementation: `src/server/context.ts:buildChatContext`
- Continue to avoid expanding merged branch history.
- Include merge payload as a real assistant message in context:
  - Convert `MergeNode.mergedAssistantContent` into `{ role: "assistant", content: ... }` at the merge position (or immediately after the merge).
- Keep `canvasDiff` out of context unless explicitly pinned (which creates an assistant message node).

Add regression coverage proving:
- Merge payload appears in context.
- Pinned diff message appears as assistant role.
- Merged branch history is not auto-included.

### 4) Merge Node UI Rendering
Workspace chat rendering (`src/components/workspace/WorkspaceClient.tsx`):
- Render merge nodes “assistant-like” (left side) and show merged payload content (once stored on merge nodes).
- Show canvas diff in an expandable section (already present).
- Keep “Add diff to context” as a 2-step confirmation (already present) and display “Diff in context” when pinned.

### 5) Test Plan (Phase 4)
- Server:
  - Merge route: payload selection (default last assistant; explicit node ID), and merge node fields persisted.
  - Context builder: merge payload included; pinned diff message included; merged history not expanded.
- Client:
  - Merge node rendering shows payload content + diff + pin flow.
  - Pin flow remains persistent across refresh (detect via `pinnedFromMergeId`).

## Success Criteria
- Merging from any source→target creates a merge node that captures:
  - merge summary,
  - merged assistant payload snapshot,
  - canvas diff snapshot.
- Canvas diff is never injected automatically; pinning creates a durable assistant message node that remains in history.
- Context builder uses merge payload and pinned diff correctly without pulling entire merged branch history.
