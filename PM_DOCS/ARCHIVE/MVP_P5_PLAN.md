# Phase 5: Graph Visualization + Navigation — Implementation Plan

## Goal
Ship a graph view that makes the reasoning DAG *legible and usable*:
- Visually reflects branch/fork/merge structure (GitGraph-like).
- Clearly indicates the current active branch and all branch heads.
- Supports node selection with a detail view and “jump to message” navigation (including branch switching when needed).
- Remains performant and stable (never hangs; predictable fallbacks).

This phase should close the gap between the MVP phase list (`MVP_IMPL_PLAN.md`) and the graph/projection requirements in `TECH_REQUIREMENTS.md` §6.

---

## Current State (Already Shipped)
Graph visualization exists and is already integrated into the workspace:
- UI tab: “Quest graph” in `src/components/workspace/WorkspaceClient.tsx`.
- React Flow rendering + custom GitGraph layout: `src/components/workspace/WorkspaceGraph.tsx`.
- View modes:
  - `collapsed` (default), `nodes` (all), `starred`.
- Layout safety:
  - `layoutGraph(..., { maxIterations })` returns `usedFallback=true` when iteration budget is exhausted; suite coverage exists.
- Viewport behavior:
  - Pinned-to-bottom behavior for overflow, follow-bottom mode, and “stop following after user pans” are covered by tests.
- Data loading:
  - Graph currently fetches `GET /api/projects/[id]/history?ref=<branch>&limit=<n>` per-branch (client fan-out) when the graph tab is visible.
  - Active-branch history changes patch-update `graphHistories[activeBranch]` live.

What’s missing vs Phase 5 requirements:
- No branch-head markers (“HEAD” / “trunk head” / “active head”) in the rendered graph.
- No node selection or detail pane; no “jump to message” navigation from the graph.
- Graph data fetch is N-requests-per-branch; there is no dedicated `/graph` endpoint.

---

## Phase 5 Scope

### In Scope
1) **Graph data contract (server-side)**
- Add `GET /api/projects/[id]/graph` returning a single payload for graph rendering:
  - `branches`: branch summaries (existing shape from `/branches`).
  - `trunkName`, `currentBranch`.
  - `branchHistories`: nodes for each branch, capped by a server-side limit.
  - `starredNodeIds` (so “Starred” mode can be graph-driven without extra client fetches).

2) **Branch head + active head markers**
- In the graph UI, visually mark:
  - head node for every branch (including trunk),
  - active branch head (distinct).
- Keep markers purely presentational (no persisted node type required).

3) **Node selection + detail pane**
- Clicking a graph node selects it and opens a details view (within the graph/canvas pane area).
- Details view shows, at minimum:
  - node type + timestamp,
  - originating branch (`createdOnBranch` and/or inferred lane),
  - message content (full), or merge summary + payload + diff availability.
- Actions:
  - “Jump to message” scrolls the chat list to the node.
  - If the node is not present on the current branch history, prompt/switch to an appropriate branch before jumping.

4) **Navigation integration**
- Provide a stable “select → jump” workflow that works across:
  - shared nodes (present on trunk and branch),
  - branch-only nodes,
  - merge nodes (jump after merge switches you to target already exists; graph should support similar).

5) **Performance + stability**
- Server limits: cap max nodes per branch (configurable constant).
- UI behavior: avoid re-layout churn while streaming (only patch active branch history; keep other branches stable until explicit refresh).
- Ensure graph rendering always completes (fallback layout is mandatory; never block UI).

### Out of Scope (Defer)
- True “supernodes” that expand in place (Phase 6+).
- Rich hover-cards / minimap / search in graph.
- Cross-branch diffing beyond Canvas diff already captured on merge nodes.

---

## Implementation Plan (Work Items)

### 1) Add `/graph` API route
Files:
- Add `app/api/projects/[id]/graph/route.ts`.
- Add a small graph payload type in `src/server/` (or colocate in route) to keep the client contract explicit.

Behavior:
- Validate project exists.
- Fetch `branches` and `currentBranch` using existing helpers (`@git/branches`, `@git/utils`).
- For each branch, fetch up to `MAX_PER_BRANCH` nodes (use `readNodesFromRef` + slice).
- Fetch `starredNodeIds` from `@git/stars`.
- Return a single JSON payload for the client.

Notes:
- This is read-only and should not require locks.
- Keep the per-branch limit consistent with the current UI max (currently `500` in `WorkspaceClient`).

### 2) Update graph data loading to use `/graph`
Files:
- `src/components/workspace/WorkspaceClient.tsx`

Changes:
- Replace the fan-out `Promise.all(sortedBranches.map(history fetch))` with a single fetch to `/api/projects/${id}/graph`.
- Use the returned `branchHistories` and `starredNodeIds` directly.
- Keep the existing “patch-update active branch history when graph is visible” behavior for responsiveness during chat streaming.

### 3) Add selection and head markers to `WorkspaceGraph`
Files:
- `src/components/workspace/WorkspaceGraph.tsx`

Changes:
- Add props:
  - `selectedNodeId?: string`
  - `onSelectNode?: (nodeId: string) => void`
  - `branchHeads?: Record<string, string>` (or compute internally from `branchHistories`)
- Render head markers (badge or icon variant) on head nodes.
- Wire selection:
  - `ReactFlow` supports click callbacks; selection should work via a single source of truth in `WorkspaceClient`.

### 4) Add graph node detail pane + “jump to message”
Files:
- `src/components/workspace/WorkspaceClient.tsx` (state + rendering + jump integration)
- Possibly a new small component: `src/components/workspace/GraphNodeDetail.tsx`

Changes:
- Track `selectedGraphNodeId`.
- Derive selected `NodeRecord` and the best target branch to view it (from `graphHistories`).
- Implement “jump to message” by reusing the existing `pendingScrollTo` + highlight mechanism:
  - if target branch differs: `switchBranch(targetBranch)` then set pending scroll,
  - else: set pending scroll directly.

### 5) UX polish
- Selected node styling in graph.
- Accessible controls:
  - clear selection,
  - keyboard focus for the “jump” action.
- Empty/error states for graph payload load.

---

## Success Criteria
- Graph renders reliably for multi-branch histories and merges (no hangs; fallback works).
- Branch heads and active head are clearly marked.
- Clicking a node shows details and “jump to message” works:
  - on the current branch,
  - on another branch (auto switch),
  - for merge nodes.
- A single `/graph` call fully drives the graph view (no per-branch fan-out).
- Test suite additions for Phase 5 are green.

