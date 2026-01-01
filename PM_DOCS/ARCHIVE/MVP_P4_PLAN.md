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

## P4 Handover Notes

This section summarizes what shipped in Phase 4, why the design looks the way it does, and where to look in the codebase.

### Phase 4 Outcomes (What Works Now)
- **True incremental streaming + interrupt persistence**
  - `/api/projects/[id]/chat` streams chunks to the client as they arrive (no single buffered enqueue), while still buffering the full assistant output for persistence at the end.
  - Interrupting a stream persists a partial assistant message node with `interrupted: true` and the partial content that was generated before abort.
- **Safe concurrency for chat streams**
  - Chat streaming is serialized per `(projectId, ref)` so two streams can’t interleave commits on the same branch.
  - Different branches of the same project can stream concurrently without blocking each other.
- **Merge “payload” model (Phase 4 core merge semantics)**
  - A merge does not “merge chat history”. It snapshots a single assistant “payload” from the source branch and stores it on the merge node.
  - Context assembly injects this payload as an assistant message so future generations on the target branch build on what was merged without importing the whole source history.
- **Canvas merge is diff-only and opt-in for context**
  - Merges never auto-apply `artefact.md`.
  - Merge nodes can store `canvasDiff`, but the diff is not injected into context by default.
  - Users can explicitly “Add diff to context”, which appends a persisted assistant message node on the target branch (durable provenance of what influenced later outputs).
- **Merge UI is end-to-end**
  - Merge modal supports:
    - selecting a **target branch** (not trunk-only),
    - previewing the Canvas diff (target vs source),
    - previewing the selected assistant payload,
    - “Advanced” payload picker to choose which assistant message becomes the merge payload.
  - After merging, the UI switches to the target branch and highlights the created merge node.
- **Chat UX polish (Phase 4 glue)**
  - Chat auto-scrolls to bottom when switching branches and stays pinned when new nodes arrive (unless user scrolls up).
  - Message action buttons moved to the bottom row and are consistent:
    - User messages: right-justified; timestamp first (left-most in that row).
    - Assistant messages: left-justified; timestamp last (right-most in that row).
  - “Edit” is a pencil icon; “Copy” is a square-2-stack icon with tick feedback after click.
  - Attachments UI is hidden behind a feature flag but keeps layout stable.

### Key Product Decisions (Why It’s Built This Way)
- **Branch-local Canvas**
  - `artefact.md` is editable on any branch/ref; reads/writes use explicit `?ref=<branch>` to avoid ambiguity.
  - This avoids a “trunk-only Canvas” bottleneck and aligns the UI with “branch everywhere” workflows.
- **No `applyArtefact`**
  - The old “apply artefact on merge” concept is intentionally removed from the merge API.
  - Canvas changes are routed through a recorded diff + optional persistent “pin into context”.
- **Merge routes all merge data through persisted nodes**
  - Merge payload is stored on the merge node (`mergedAssistantContent`) and is included in context deterministically.
  - Canvas diff is never injected implicitly; pinning creates a durable assistant message node with `pinnedFromMergeId` so context/history remain explainable.

### Implementation Walkthrough (Where to Look)

**Streaming + Interrupt**
- Route: `app/api/projects/[id]/chat/route.ts`
  - Uses `ReadableStream` to enqueue each provider chunk to the response while building a buffer for the final persisted assistant node.
  - Persists user node immediately, and persists assistant node on stream completion or cancellation (with `interrupted: true` when aborted).
  - Uses a per-ref lock (`acquireProjectRefLock`) that spans the streaming lifetime, preventing mid-stream interleaving commits on that ref.
- Stream registry: `src/server/stream-registry.ts`
  - Tracks an `AbortController` per `(projectId, ref)` so `/interrupt` can cancel the correct stream.
- Locking: `src/server/locks.ts`
  - `acquireProjectRefLock(projectId, ref)` enables concurrent streams on different refs.
  - `withProjectLockAndRefLock(projectId, ref, fn)` is used for operations that mutate the working tree and must be serialized at the project level.

**Ref-safe Git writes**
- `appendNodeToRefNoCheckout` in `src/git/nodes.ts` (used by chat streaming and pin-diff)
  - Ref-safe approach: update the ref tip without `git checkout`, avoiding shared working-tree state during long-lived streams.

**Merge payload + diff semantics**
- Git merge helper: `src/git/branches.ts:mergeBranch`
  - Computes `canvasDiff` by comparing `artefact.md` on `targetBranch` vs `sourceBranch` snapshot.
  - Selects a payload assistant message:
    - default: last assistant message on source branch that is unique to the source branch vs target,
    - optional override: `sourceAssistantNodeId` (must reference an assistant message unique to the source branch at merge time).
  - Stores `mergedAssistantNodeId` + `mergedAssistantContent` on the merge node.
- Merge API: `app/api/projects/[id]/merge/route.ts`
  - Accepts `sourceBranch`, `targetBranch` (optional), `mergeSummary`, `sourceAssistantNodeId` (optional).
  - Serializes merge operations with `withProjectLockAndRefLock` on the target ref to avoid interleaving with other target-ref writes.
- Pin-diff API: `app/api/projects/[id]/merge/pin-canvas-diff/route.ts`
  - Appends an assistant message node with `content = mergeNode.canvasDiff` and `pinnedFromMergeId = mergeNode.id`.
  - Enforces idempotency (won’t double-pin the same merge node).
- Context builder: `src/server/context.ts`
  - Injects merge summaries as system messages.
  - Injects merge payload as an assistant message (`mergedAssistantContent`) when present.
  - Does not auto-inject `canvasDiff`; pinned diff message nodes are included naturally like any other message.

**Workspace UI**
- Main client: `src/components/workspace/WorkspaceClient.tsx`
  - Merge modal: target branch selector, Canvas diff preview, payload preview/picker, merge submit behavior (switch + highlight).
  - Merge node rendering: “Merged from …” + summary + payload section + diff section with persistent pin action.
  - Message controls: star/copy/edit ordering, copy feedback tick, edit limited to user messages by default.
- Feature flags: `src/config/features.ts`
  - `NEXT_PUBLIC_RT_UI_EDIT_ANY_MESSAGE=true` exposes edit controls for non-user messages (API supports editing any role; UI defaults to user-only).
  - `NEXT_PUBLIC_RT_UI_ATTACHMENTS=true` shows the paperclip button in the composer (currently UI-only; no backend support).
  - `env.example` documents both flags.

### Tests Added/Updated in Phase 4
- Client:
  - `tests/client/WorkspaceClient.test.tsx` covers merge payload UI, pin diff flow, copy/edit affordances, and scroll behavior.
  - `tests/client/WorkspaceGraph.viewport.test.tsx` updated for React Flow mock compatibility.
- Server:
  - `tests/server/chat-route.test.ts` covers chunk streaming observability + abort setting `interrupted`.
  - `tests/server/merge-route.test.ts` covers `sourceAssistantNodeId` pass-through.
  - `tests/server/context.test.ts` covers merge payload injection behavior.

### Known Constraints / Phase 5 Considerations
- **Locks are in-memory** (`src/server/locks.ts`): safe for a single server process. A multi-process deployment needs shared locking or a different storage isolation strategy.
- **Non-chat operations still rely on checkout**: merges, branch ops, and some file writes use working-tree operations and therefore require project-level serialization + forced checkout (`forceCheckoutRef`).
- **Legacy data**: older merge nodes may be missing `mergedAssistantContent`; UI renders “legacy merge” messaging in that case.
- **Remaining tech debt (optional)**
  - Some older planning/spec docs still mention `applyArtefact`/trunk-only Canvas; Phase 4 behavior is now canonical in code and in `MVP_GIT_ARCH_README.md`.
  - RTL emits `act(...)` warnings for some streaming-related tests; suite passes but could be cleaned up later.

## Success Criteria
- Merging from any source→target creates a merge node that captures:
  - merge summary,
  - merged assistant payload snapshot,
  - canvas diff snapshot.
- Canvas diff is never injected automatically; pinning creates a durable assistant message node that remains in history.
- Context builder uses merge payload and pinned diff correctly without pulling entire merged branch history.
