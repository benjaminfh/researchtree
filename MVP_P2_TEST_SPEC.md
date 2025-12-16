# Phase 2 Test Specification

Test-driven roadmap for the Next.js application layer that wraps the git core. Mirrors Phase 2 functional scope (project shell, chat streaming, artefact viewer) so we can iterate safely before introducing branching UI.

---

## Testing Toolkit

| Layer | Tooling | Notes |
| --- | --- | --- |
| Route handlers / server modules | **Vitest** + `next-test-api-route-handler` (or custom request mocks) | Run in Node, mock LLM + git helpers |
| Hooks & client utilities | **Vitest** + React Testing Library `renderHook` | Tests live under `tests/client/` |
| React components | **React Testing Library (RTL)** | DOM assertions, event simulation |
| Streaming flows | Vitest w/ fake `ReadableStream` + AbortController | Ensure partial chunks + interrupts behave |
| End-to-end sanity | **Playwright** (headless) | Boot Next dev server, drive real UI |

Test locations:
- `tests/server/` — API/context builder/unit tests.
- `tests/client/` — hooks/components.
- `tests/e2e/` — Playwright specs (optional to run in CI yet).

---

## 1. Route Handlers

### `/api/projects` (tests/server/projects-route.test.ts)
1. **GET empty list**
   - Mock `listProjects` → `[]`.
   - Assert response `200` with empty array.
2. **GET with projects**
   - Mock `listProjects` → sample metadata.
   - Assert shape (id/name/createdAt/description) and ordering.
3. **POST validation**
   - Missing `name` → expect `400` + error code `INVALID_BODY`.
   - Name too long (>100 chars) → `400`.
4. **POST success**
   - Mock `initProject` → returns metadata.
   - Assert `201`, body matches metadata.
5. **POST git failure bubble**
   - Mock `initProject` to throw; assert `500` + safe message.

### `/api/projects/[id]` (tests/server/project-detail-route.test.ts)
1. **GET valid project**
   - Mock `getProject` + `listBranches` (returns only `main`).
   - Assert response has metadata + branches array.
2. **GET project missing**
   - Mock `getProject` → `null`; expect `404`.
3. **DELETE success**
   - Mock `deleteProject`; expect `204`.

### `/api/projects/[id]/history` (tests/server/history-route.test.ts)
1. **Happy path**
   - Mock `readNodesFromRef` to return 5 nodes.
   - Assert `200` + ordered nodes.
2. **Limit handling**
   - Query `?limit=2`; ensure only last 2 nodes returned.
3. **Invalid ID**
   - Mock `assertProjectExists` to throw; expect `404`.

### `/api/projects/[id]/artefact` (tests/server/artefact-route.test.ts)
1. **Returns markdown + last state metadata**
   - Mock `getArtefact` + `getLastNode` (state node).
   - Assert JSON includes `content`, `lastUpdatedAt`, `lastStateNodeId`.
2. **No state nodes yet**
   - `getLastNode` returns undefined; ensure metadata fields are `null`.

### `/api/projects/[id]/chat` (tests/server/chat-route.test.ts)
Mock `appendNode`, context builder, and LLM stream.

1. **Persists user node before call**
   - Ensure `appendNode` invoked with user message before LLM mock runs.
2. **Streams assistant chunks**
   - Mock LLM generator yielding `["foo", "bar"]`.
   - Assert handler emits chunked response (SSE or stream) containing tokens.
3. **Completes with assistant node**
   - After stream ends, expect `appendNode` called with `role: assistant`, `content: "foobar"`, `interrupted: false`.
4. **Handles interrupts**
   - Provide AbortSignal that aborts mid-stream.
   - Assert partial assistant text persisted with `interrupted: true`.
5. **Context builder errors bubble gracefully**
   - Force builder throw; expect `500` + JSON error, no assistant node append.

### `/api/projects/[id]/interrupt` (tests/server/interrupt-route.test.ts)
1. **Cancels active controller**
   - Inject controller map with entry for project; POST should abort signal + remove entry.
2. **No active stream**
   - POST when map lacks project; expect 204 (noop).

### `context builder` (tests/server/context-builder.test.ts)
1. **Includes nodes until token budget reached**
   - Mock nodes of varying length, set budget low; ensure trimming respects order.
2. **Always appends artefact snapshot**
   - Provide artefact string; assert system prompt contains section.
3. **Merge nodes included verbatim**
   - Provide merge node; ensure not expanded.
4. **Handles empty history gracefully**
   - Returns base system prompt + artefact.
5. **Respects provider token limits**
   - Pass tokenLimit override and ensure budget calculation uses that limit (simulating per-model capability data).

---

## 2. Hooks & Utilities

### `useProjectData` (tests/client/useProjectData.test.tsx)
1. **Fetches history + artefact**
   - Mock fetch responses; ensure hook exposes combined state.
2. **Revalidation on focus**
   - Simulate window focus event; assert `mutate` invoked.
3. **Handles errors**
   - Mock `/history` failure; hook should surface `error` and keep previous data.

### `useChatStream` (tests/client/useChatStream.test.ts)
1. **Optimistic user append**
   - When `sendMessage` called, ensure hook immediately inserts user node into cache.
2. **Streaming accumulation**
   - Mock fetch stream returning chunks; hook should expose incremental assistant text via callback/state.
3. **Completion flush**
   - On stream end, ensure assistant node inserted and optimistic entry reconciled with server ID.
4. **Interrupt flow**
   - Call `interrupt` mid-stream; verify fetch abort called and assistant node flagged `interrupted`.
5. **Error rollback**
   - Force fetch rejection; user node should be removed/marked failed with retry info.

### Utilities
Tests for helpers like token estimator, role-to-color mapping (pure functions) with simple input/output assertions.

---

## 3. React Components

### `ProjectListPage` (tests/client/project-list-page.test.tsx)
1. **Renders empty state**
   - With no projects, show CTA + helper text.
2. **Displays project cards**
   - Provide mock data; assert names, created dates, node counts present.
3. **Creates project via form**
   - Fill name, submit; ensure `fetch` POST called and success callback triggered.

### `WorkspaceLayout` (tests/client/workspace-layout.test.tsx)
1. **Shows header metadata**
   - Verify branch badge, project name, model label rendered.
2. **Loads chat + artefact panes**
   - With provided hook data, ensure timeline nodes and markdown preview appear.

### `ChatTimeline` (tests/client/chat-timeline.test.tsx)
1. **Renders node variants**
   - Provide message/state/merge nodes; assert role tags, state pill.
2. **Autoscroll on new message**
   - Mock container + track `scrollIntoView` triggered for latest node.

### `ChatComposer` (tests/client/chat-composer.test.tsx)
1. **Disables send when empty**
2. **Shows streaming state w/ stop button**
3. **Error banner on failure with retry button invoking `retry` callback**

### `ArtefactPane` (tests/client/artefact-pane.test.tsx)
1. **Renders markdown correctly**
2. **Displays “read-only” badge**
3. **Shows loading indicator while fetch pending**

---

## 4. Streaming & Concurrency Edge Cases

### Mutex around git writes (tests/server/chat-route-concurrency.test.ts)
1. **Serializes concurrent sends**
   - Simulate two overlapping requests; ensure user nodes written sequentially (mock by pushing order).
2. **Releases lock on failure**
   - Force first request to throw; second request should still complete after lock release.

### Artefact refresh subscription (tests/client/artefact-refresh.test.tsx)
1. **When new state node appears**
   - Simulate SWR history update containing state node; ensure artefact fetch refresh triggered.

---

## 5. End-to-End Smoke (tests/e2e/phase2.spec.ts)

Prereq: run `next dev` + set env keys. Use Playwright.

1. **Create project & chat**
   - Navigate to `/`, create “Smoke Test Project”.
   - Verify workspace loads, send “Hello”.
   - Assert assistant response appears (mock LLM can echo).
   - Check git repo for two nodes (optional CLI helper).
2. **Interrupt flow**
   - Start long-running completion (LLM mock adds delay), hit “Stop”.
   - Confirm UI labels message as interrupted and node persisted.
3. **Artefact viewer sync**
   - Update artefact via CLI or mock API call; reload artefact pane and verify content.

E2E uses mocked LLM endpoint returning deterministic text; git helpers run against temp dir.

---

## Success Criteria
1. All route, hook, and component tests pass under Vitest (`npm test`).
2. Streaming specs cover chunked delivery, interrupts, and error rollback.
3. Playwright smoke test proves UI ↔ git loop works (can run gated/optional in CI).
4. Tests serve as living documentation for PRD principles: append-only provenance, artefact trunk discipline, controllable context assembly.

Once this suite is green, Phase 2 feature work is definition-of-done compliant and ready for Phase 3 branching enhancements.
