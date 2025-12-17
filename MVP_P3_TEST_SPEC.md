# Phase 3 Test Specification

Test plan covering branching, merge UI, artefact editing (trunk-only), message editing, and context discipline. Builds on Phase 2 coverage; focuses on new routes, branch-aware hooks, merge/artefact flows, and shared-history UX.

---

## Testing Toolkit

| Layer | Tooling | Notes |
| --- | --- | --- |
| Route handlers / server modules | **Vitest** + Next API route test harness (or mocked `Request`/`Response`) | Mock git helpers + LLM; assert status and side effects |
| Hooks & client utilities | **Vitest** + React Testing Library `renderHook` | Branch-aware SWR keys and cache updates |
| React components | **React Testing Library (RTL)** | Branch bar, merge modal, artefact editor, edit flows |
| Streaming & concurrency | Vitest with fake `ReadableStream` + AbortController + mutex mocks | Race/release and partial streams |
| End-to-end | **Playwright** (headless) | Drive real UI: branch, chat, merge, edit artefact |

Test locations:
- `tests/server/` — route/context/provider tests.
- `tests/client/` — hooks/components.
- `tests/e2e/` — Playwright smoke.

---

## 1) Route Handlers

### `/api/projects/:id/branches` (tests/server/branches-route.test.ts)
1. **GET lists branches** — Mock `listBranches`; expect trunk + feature branches ordered.
2. **POST creates branch** — Valid name/fromRef → `201`, `createBranch` called, returns updated list/current branch.
3. **PATCH switches branch** — Valid name switches current; invalid name → `404/400`.
4. **Validation errors** — Missing name/too long → `400`.
5. **Git errors bubble** — Simulate `createBranch` throw → `500` with safe message.

### `/api/projects/:id/merge` (tests/server/merge-route.test.ts)
1. **Happy path** — `mergeBranch` called with summary + source branch; response includes merge node metadata.
2. **Requires summary** — Empty summary → `400`.
3. **Unknown branch** — `mergeBranch` throws; expect `404/400` mapping.
4. **Artefact toggle passed through** — When `applyArtefact=false`, ensure downstream flag honored (mock checked).

### `/api/projects/:id/edit` (tests/server/edit-route.test.ts)
1. **Creates branch from parent** — Given `nodeId` + new content, calls git helper to branch from parent and appends edited message.
2. **Invalid payload** — Missing content or nodeId → `400`.
3. **Nonexistent node** — Helper rejects → `404`.

### `/api/projects/:id/artefact` (PUT/PATCH) (tests/server/artefact-update-route.test.ts)
1. **Trunk-only guard** — On non-trunk ref, expect `403`.
2. **Updates artefact** — Valid markdown writes file + commit; returns lastUpdated metadata.
3. **Validation** — Empty body → `400`.

### `/api/projects/:id/history` (ref-aware) (tests/server/history-route-ref.test.ts)
1. **Returns ref-specific nodes** — Query `?ref=feature`; ensures `readNodesFromRef` invoked.
2. **Limit param honored** — `?limit=2` trims results.

### `/api/projects/:id/chat` (branch-aware) (tests/server/chat-route-branch.test.ts)
1. **Uses provided ref** — Body includes `ref`; `appendNode` called with branch ref/mutex.
2. **Streams chunks** — Same as Phase 2 but on branch; still user+assistant nodes appended separately.
3. **Mutex release on error** — Simulate LLM throw; ensure lock released for next request.

### Context Builder (tests/server/context-branch.test.ts)
1. **Includes merge summaries** — Merge nodes become system messages; budget respected.
2. **Does not expand merged branch history** — When on trunk after merge, merged branch nodes excluded beyond summary.
3. **Supports ref arg** — Pulls nodes/artefact for given ref; default trunk.
4. **Token trimming** — Oldest messages dropped when over budget.

---

## 2) Hooks & Utilities

### `useProjectData` (branch-aware) (tests/client/useProjectData-branch.test.tsx)
1. **Fetches history/artefact for ref** — When `ref` provided, SWR keys include `ref`; returns branch data.
2. **Switching ref revalidates** — Changing `ref` triggers new fetch; old cache not reused.
3. **Error handling** — History failure surfaces `error` while preserving prior data.

### `useChatStream` (ref/provider) (tests/client/useChatStream-branch.test.ts)
1. **Sends ref + provider** — POST body carries `ref`, `llmProvider`; interrupt hits `/interrupt` for same ref.
2. **Streaming accumulation** — Chunks appended; onComplete invokes callback once.
3. **Abort clears state** — Interrupt resets `isStreaming`; no error.
4. **Error sets message** — Failed fetch sets error and stops streaming.

### Utilities
1. **Shared-history calculator** — Given branch and trunk node arrays, returns correct shared prefix count.
2. **Token estimator** — Basic input/output sanity.

---

## 3) React Components

### Branch Bar (tests/client/BranchBar.test.tsx or within WorkspaceClient)
1. **Lists branches & trunk badge** — Renders current branch, trunk label.
2. **Switch branch calls API** — Select change issues PATCH, updates state, handles error display.
3. **Create branch calls API** — POST new branch, switches on success, errors shown on failure.
4. **Provider persistence per branch** — Switching branches loads stored provider; selecting provider saves to per-branch key.

### Merge Modal (tests/client/MergeModal.test.tsx)
1. **Requires summary** — Save disabled until summary provided.
2. **Toggles artefact adoption** — Checkbox flips payload flag.
3. **Submits to merge route** — On success, calls callbacks; on failure shows error and re-enables.

### Artefact Editor (tests/client/ArtefactEditor.test.tsx)
1. **Enabled on trunk, disabled on branches** — Branch shows read-only badge.
2. **Saves markdown** — PUT call issued; success clears dirty state; failure shows error.
3. **Dirty state warning** — Typing sets dirty; switching branch warns or blocks save.

### Message Edit Flow (tests/client/MessageEdit.test.tsx)
1. **Edit button opens editor** — Prefills with existing content.
2. **Submit calls `/edit`** — On success, branch switches and composer cleared/seeded as designed.
3. **Error handling** — Failed edit shows error, does not switch branch.

### WorkspaceClient (branch-aware) (tests/client/WorkspaceClient-branch.test.tsx)
1. **Shared-history divider** — Shows shared count, hide/show toggles work.
2. **Merge/state badges render** — Merge nodes show summary; state nodes show pill.
3. **Streaming preview on branch** — onChunk renders partial assistant message in branch view.
4. **Interrupt button present while streaming** — Calls interrupt.

### Graph View (if React Flow or fallback) (tests/client/GraphPane.test.tsx)
1. **Renders nodes/edges from history** — Given nodes with parents/merge, graph displays correct structure.
2. **Highlights current branch head** — Active ref node styled.

---

## 4) Streaming & Concurrency Edge Cases

### Mutex around writes (tests/server/chat-route-concurrency.test.ts)
1. **Serializes concurrent sends per project/ref** — Two overlapping requests write in order; second waits.
2. **Releases on throw** — First request throws; lock released for next request.

### Interrupt during merge/chat (tests/server/interrupt-route-branch.test.ts)
1. **Interrupt clears controller for branch** — POST aborts signal for that project/ref key.

### Artefact edits vs merge (tests/server/artefact-merge-conflict.test.ts)
1. **Branch artefact adoption respected** — `applyArtefact=false` keeps trunk artefact; `true` replaces with branch snapshot (mocked).

---

## 5) End-to-End Smoke (tests/e2e/phase3.spec.ts)

Prereq: `next dev` running with mock LLM.

1. **Branch, chat, merge** — Create project, create branch, send message, merge back with summary; verify merge node visible and branch artefact choice applied.
2. **Artefact edit guard** — On branch, artefact editor disabled; switch to trunk, edit, save, see updated markdown.
3. **Message edit auto-branch** — Edit earlier message, confirm new branch created and context continues there.
4. **Shared history UI** — Shared divider appears; hide/show toggles work.

---

## Success Criteria
1. All server/hook/component specs above pass under Vitest; Playwright smoke runs green.
2. Branching/merge/edit/artefact flows are covered by tests that exercise real APIs and UI interactions.
3. Concurrency and context-discipline edge cases (locks, merge summaries, ref isolation) have explicit assertions.
4. Regressions from missing routes (Phase 2 gap) are prevented by direct route tests.***
