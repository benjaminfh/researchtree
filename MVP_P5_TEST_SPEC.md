# Phase 5 Test Specification

Test-driven roadmap for Phase 5 graph visualization + navigation. This spec assumes Phase 4 semantics are already shipped (ref-safe streaming, merge payloads, pin-diff nodes) and focuses on making the graph view *interactive and dependable*.

---

## Testing Toolkit

| Layer | Tooling | Notes |
| --- | --- | --- |
| Route handlers / server modules | **Vitest** | Keep tests in `tests/server/`; mock git helpers where appropriate |
| Graph utilities (pure) | **Vitest** | Deterministic unit tests for node projection + head markers |
| React components | **React Testing Library (RTL)** | Mock React Flow to avoid canvas/DOM complexity |
| Integration (client) | RTL + fetch mocks | Drive graph tab, selection, branch switching, jump behavior |
| Optional e2e smoke | Playwright | Only if already present/desired for CI |

---

## 1) Route Handlers (Server)

### `GET /api/projects/[id]/graph` (`tests/server/graph-route.test.ts`)
Assumes Phase 5 adds `app/api/projects/[id]/graph/route.ts`.

1. **Returns a single graph payload**
   - Arrange: mock `getProject`, `listBranches`, `getCurrentBranchName`, `readNodesFromRef`, `getStarredNodeIds`.
   - Assert `200` and JSON shape:
     - `branches: BranchSummary[]`
     - `trunkName: string`
     - `currentBranch: string`
     - `branchHistories: Record<string, NodeRecord[]>`
     - `starredNodeIds: string[]`

2. **Caps history per branch**
   - Arrange: `readNodesFromRef` returns > `MAX_PER_BRANCH` nodes.
   - Assert returned history length is `<= MAX_PER_BRANCH` for each branch key.

3. **Branch histories align with branches list**
   - Ensure `Object.keys(branchHistories)` equals the returned `branches.map(b => b.name)` (order not important).

4. **404 when project missing**
   - `getProject` returns `null` → expect `404`.

5. **Errors return safe 500**
   - Throw from `listBranches` or `readNodesFromRef` → expect `500` via `handleRouteError`.

---

## 2) Graph Projection + Layout (Pure / Deterministic)

### `buildGraphNodes` head markers (`tests/client/WorkspaceGraph.buildGraphNodes.test.ts`)
If Phase 5 introduces branch head markers, keep the logic deterministic and unit-tested.

1. **Computes head IDs per branch**
   - Given `branchHistories`, head for branch is the last node ID in its array.
   - Trunk head and active head should both be representable.

2. **Marks head nodes without duplicating nodes**
   - Shared histories should not create duplicate `GraphNode`s; a shared head should carry multiple head labels if needed (e.g., branch with no unique nodes).

3. **Active branch membership remains correct**
   - `isOnActiveBranch` should remain true only for nodes in `branchHistories[activeBranchName]`.

### `layoutGraph` safety regression (`tests/client/WorkspaceGraph.layout.test.ts`)
Extend existing tests rather than duplicating:

1. **Still falls back under low iteration budgets**
   - Existing “budget exhausted → usedFallback” must remain green.

2. **Head marker rendering does not affect layout completion**
   - With fork/merge + multiple branch heads, `layoutGraph` should complete within budget (or deterministically fall back).

---

## 3) `WorkspaceGraph` Component (Client)

### Selection and head-marker rendering (`tests/client/WorkspaceGraph.interaction.test.tsx`)
Mock `reactflow` similarly to `tests/client/WorkspaceGraph.viewport.test.tsx`, but:
- capture `nodes` passed into React Flow,
- expose a way to simulate a node click (either via `onNodeClick` prop or by rendering clickable stand-ins for node IDs).

Tests:
1. **Renders head markers for each branch**
   - Given `branchHistories` with 2+ branches:
     - assert that the React Flow `nodes` data includes a badge/label/icon variant on the last node of each branch.

2. **Calls `onSelectNode` when a node is clicked**
   - Render `WorkspaceGraph` with `onSelectNode` mock.
   - Simulate selecting a node → expect callback called with that node ID.

3. **Selected node renders in a “selected” style**
   - Render with `selectedNodeId`.
   - Assert the corresponding Flow node has `data.isSelected === true` (or an equivalent render signal).

---

## 4) `WorkspaceClient` Integration (Client)

### Graph loads via `/graph` (`tests/client/WorkspaceClient.test.tsx`)
Add/adjust coverage to ensure the graph tab is driven by the new endpoint.

1. **Graph tab fetches `/graph` once**
   - Click “Quest graph”.
   - Assert a single fetch to `/api/projects/<id>/graph` and no fan-out to `/history?ref=...` (or keep as fallback behavior explicitly).

2. **Passes `branchHistories` and `starredNodeIds` through**
   - Mock `WorkspaceGraph` as done currently (capture props).
   - Ensure props contain:
     - `branchHistories` for all branches returned,
     - `starredNodeIds` from payload,
     - `trunkName` and `activeBranchName`.

### “Jump to message” across branches (`tests/client/WorkspaceClient.graphNavigation.test.tsx`)
If Phase 5 adds a node detail pane and “jump” action:

1. **Jump on current branch scrolls + highlights**
   - Arrange: chat list contains an element with `data-node-id="<id>"`.
   - Stub `HTMLElement.prototype.scrollIntoView` and assert it is called.
   - Assert highlight state is applied (e.g., the row has a highlight class or an attribute).

2. **Jump to a node on another branch switches branch first**
   - Arrange: selected node ID exists only in `branchHistories['feature/x']`.
   - Trigger jump action.
   - Assert:
     - `PATCH /api/projects/<id>/branches` called with `{ name: 'feature/x' }`,
     - after branch switch, the scroll/highlight logic runs for that node.

3. **Jump to shared node chooses the active branch (no switch)**
   - If node exists on multiple branches, ensure selection prefers staying on `activeBranchName` unless explicitly overridden.

---

## Optional: End-to-End Smoke
If adding Playwright is already established:

`tests/e2e/phase5-graph.spec.ts`
1. Create project, create branch, add a few chat nodes.
2. Open “Quest graph”; verify nodes appear and branch heads are visible.
3. Click a node and “Jump to message”; verify chat scrolls to that message.
4. Click a node from another branch; verify branch switch + jump.

---

## Success Criteria
1. Server: `/graph` returns correct, bounded payload and is covered by unit tests.
2. Client: graph selection + head markers are covered by RTL tests with React Flow mocked.
3. Integration: “jump to message” works reliably across branches, with regression coverage.

