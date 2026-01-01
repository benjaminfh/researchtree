# Phase 3: Branching, Merge UI, and Canvas (Artefact) Editing — Implementation Plan

## Goal
Ship the full reasoning loop with branch-aware UX: create/switch branches, edit messages (auto-branch), merge back with summaries + a single assistant “payload”, edit the Canvas (artefact) on any branch, and visualize shared/branch history. Close the gap between git-layer support and the Next.js app by adding route handlers, context rules, and UI polish so branching is reliable, explainable, and testable.

## Status Update (Implementation Drift)
Phase 3 originally assumed a “trunk-only Canvas” and an `applyArtefact` merge toggle. The shipped implementation moved to:
- Canvas (`artefact.md`) is editable per ref (branch-local).
- Merges never auto-apply `artefact.md`; they record a diff snapshot and route chat content through a single assistant merge payload.
- “Add canvas diff to context” is persistent (it appends an assistant message node).

`MVP_P4_PLAN.md` and `MVP_GIT_ARCH_README.md` are the authoritative references for the current behavior.

## Product Alignment
1. **Provenance-first** — Every node is append-only, one commit per node, branches reflect reasoning forks, merges carry explicit summaries (PRD Principles 1, 8, 9).
2. **Branch-local Canvas** — Canvas edits are allowed on any branch; merges record diffs but do not auto-apply `artefact.md` (Phase 4 semantics).
3. **Context discipline** — Shared history visible; merge summaries injected, branch-specific context constrained (TECH_REQUIREMENTS section 4).
4. **Dogfoodable** — Branch, explore, merge, and edit the Canvas (artefact) inside the app without falling back to CLI.

## Scope (In/Out)
**In**
- Branch list/create/switch endpoints + UI wired to git.
- Merge flow (diff preview, summary required, select merge payload, choose target branch).
- Message editing UX that auto-creates branch from parent node.
- Canvas (artefact) editing on any ref (branch-local autosave).
- Context builder: branch-aware history retrieval, merge summary inclusion, trimming.
- Graph/visual cues: shared-history divider, merge/state badges, minimal DAG view (React Flow or list-based fallback).
- Provider/model persistence per branch; keyboard shortcut toggle.
- Error handling + retries for branch ops and merges.

**Out (defer)**
- 3-way Canvas/artefact merge resolution UI.
- Advanced context compression/summarization.
- Tool calling/search.
- Mobile polish and accessibility hardening.

## Architecture / System Changes
### Server (Next.js Route Handlers)
- Add `/app/api/projects/[id]/branches/route.ts` (GET list, POST create, PATCH switch).
- Add `/app/api/projects/[id]/merge/route.ts` (POST merge summary + payload selection + diff snapshot).
- Add `/app/api/projects/[id]/edit/route.ts` (POST edit node -> create branch + append edited message).
- Extend `/app/api/projects/[id]/artefact/route.ts` to support PUT/PATCH on an explicit `ref` (branch-local Canvas).
- Ensure all routes share validation via `src/server/schemas.ts` and use git helpers directly.

### Data/Context
- Continue one-commit-per-node; merge node already contains `mergeFrom`, `mergeSummary`, `sourceCommit`, `sourceNodeIds`.
- Context builder: accept `ref`, include merge summaries as system messages, trim by token budget, and avoid expanding merged branch history.
- Serialize chat writes per project/ref (mutex) to prevent interleaved commits.

### Client
- Workspace branch bar: list, create, switch; display provider per branch.
- Merge modal: shows merge summary input (required), Canvas diff (target vs source), and payload preview/picker.
- Canvas editor: enabled on any branch; autosave to the active `ref`.
- Message edit action: triggers `/edit` route, switches to new branch, seeds composer with edited text.
- Shared-history divider improvements and badges for merge/state nodes; minimal graph pane if time.

## API Surface (Phase 3)
| Route | Method | Purpose |
| --- | --- | --- |
| `/api/projects/:id/branches` | GET | List branches with metadata. |
| `/api/projects/:id/branches` | POST | Create branch (`name`, `fromRef?`). |
| `/api/projects/:id/branches` | PATCH | Switch active branch (`name`). |
| `/api/projects/:id/merge` | POST | Merge `sourceBranch` into `targetBranch` with `mergeSummary` and optional `sourceAssistantNodeId`. |
| `/api/projects/:id/edit` | POST | Edit a node: create branch from parent and append edited message. |
| `/api/projects/:id/artefact` | PUT/PATCH | Update Canvas/artefact for a ref (`?ref=<name>`). |

> Branch-aware calls now require an explicit ref (landed in Session 1): `/api/projects/:id/history?ref=<name>` scopes history, `/api/projects/:id/chat` includes `ref` in the body, `/api/projects/:id/interrupt?ref=<name>` cancels branch streams, and the new edit/merge routes require `fromRef`/`sourceBranch` + optional `targetBranch`. Always pass the active branch when hitting git-backed APIs.

## UI/UX Scope
1. **Branch bar** — Create/switch, show trunk badge, per-branch provider/model label, error states.
2. **Shared history** — Divider + show/hide shared nodes; badges for merge/state.
3. **Merge UI** — Diff of Canvas (target vs source), required summary textarea, payload preview/picker, success/failure toasts.
4. **Canvas editor** — Markdown editor with autosave; works on any branch/ref.
5. **Message edit** — Inline “Edit” on any message; on submit, branch created and user switched there; composer seeded.
6. **Graph/visibility** — At minimum, per-branch history counts and merge/state badges; stretch: mini DAG via React Flow.
7. **Settings polish** — Shortcut toggle (⌘+Enter), provider persistence per branch.

## Implementation Checklist
- [x] Add missing route handlers for branches, merge, edit, artefact/Canvas update with zod validation + git helper wiring. *(Shipped during P3 Session 1; see `app/api/projects/[id]/*` handlers with `withProjectLock`.)*
- [x] Update `useProjectData` to accept `ref` and expose branch-aware artefact/history; add branch-aware SWR keys. *(Hook takes `ref` and both history + Canvas reads use `?ref=`.)*
- [x] Extend `useChatStream` to carry `ref` and provider per branch; ensure interrupt works cross-branch. *(Chat + interrupt routes persist ref-aware streams.)*
- [x] WorkspaceClient: wire branch bar to new routes; integrate merge modal; enable Canvas editor on any ref. *(UI shipped; merge modal/payload support was finalized in Phase 4.)*
- [x] Add message edit UI + handler calling `/edit`. *(Edit modal creates branch from parent commit + switches ref.)*
- [x] Context builder: support `ref`, merge summaries, token-budget trimming; serialize writes per project. *(Implemented + consumed by chat route; regression tests exist.)*
- [x] Graph/metadata: render merge/state badges; optional React Flow DAG. *(Shipped in Session 2: React Flow global git-graph-style lanes + bounded layout + Collapsed/All/Starred modes; shared/inherited styling uses `createdOnBranch` + unified colors.)*
- [x] Merge UI completion: add Canvas diff preview + payload preview/picker + arbitrary target branch selection, and wire it end-to-end to `/api/projects/[id]/merge` with coverage. *(Finalized in Phase 4.)*
- [x] Context builder coverage: add targeted tests proving merge summaries/payload are injected and merged histories aren’t expanded. *(Covered in server context tests.)*
- [ ] Composer attachments/modes: wire or hide the “Add attachment” affordance until functional. *(UI now uses Heroicons; still no functionality.)*
- [x] Docs: README updates for Phase 3 flows; env vars unchanged. *(README reflects branch-local Canvas + merge diff semantics.)*
- [ ] Tests per spec (server, hooks, components, e2e). *(Unit/integration suites updated; still need e2e smoke for branch create/switch, edit→branch, merge, and Canvas editing across refs.)*

## Risks & Mitigations
- **Route drift** (routes missing vs tests): define and implement handlers before UI changes; align zod schemas with git functions.
- **Canvas divergence confusion**: make the active ref explicit in the UI and always read/write Canvas with `?ref=`; keep merge diffs out of context by default.
- **Context pollution**: ensure merge summaries included, merged branch history not in context when on trunk; add builder tests.
- **Concurrent writes**: mutex per project/ref around chat/merge/edit; test for race release on error.
- **LLM/provider errors**: surface in UI with retry; don’t double-append nodes.

## Success Criteria
1. Users can branch, chat, edit messages (auto-branch), and merge back with required summary + a single assistant payload.
2. Canvas (artefact) edits work on any branch/ref and are persisted as state nodes.
3. Context assembly respects branch ref and merge summaries without leaking merged histories.
4. UI clearly shows shared vs branch-specific nodes and merge/state badges.
5. Tests in MVP_P3_TEST_SPEC pass (unit, integration, e2e smoke for branch/merge/edit/Canvas-artefact flows).

## Implementation Notes
### P3 Session 1 - Handover
- **Editing flow**: `/api/projects/[id]/edit` now requires `nodeId`, branches from the edited node’s parent commit, and appends the edited message on the new branch. Client UI surfaces “Edit” on user messages and opens a modal to save/switch branches.
- **Merge plumbing**: `/api/projects/[id]/merge` snapshots a single assistant payload + a Canvas diff on a merge node; merges do not auto-apply `artefact.md`.
- **Canvas/artefact editor**: Branch-local autosave markdown editor; server reads/writes use `?ref=` for correctness.
- **Branch-aware hooks/routes**: `useProjectData` and `useChatStream` accept `ref`; chat/interrupt routes register streams per project+ref; stream registry, context builder, and git writes hit the correct branch.
- **WorkspaceClient UX**: Added merge modal, edit modal, shared-history divider, branch rail improvements (collapsible tips, home shortcut), floating composer adjustments, and renamed artefact to Canvas across UI.
- **Testing updates**: Updated client tests to new copy/labels (“Workspace”, “Ask anything”, stop button, provider selector), added server tests for edit/merge/artefact routes, and git test for ref-aware `appendNode`.

### P3 Session 1 - Progress
Implementation Progress
Server routes: /branches, /merge, /edit, /artefact exist with zod validation and per-project locking (withProjectLock). Chat and interrupt routes accept ref, register streams per branch, and append nodes on the requested ref.
Git layer: appendNode can checkout a ref before committing; mergeBranch accepts { targetBranch, applyArtefact }; updateArtefact enforces trunk-only edits and checks out main. getCommitHashForNode finds parent commit for edit branching.
Hooks: useProjectData(ref) and useChatStream({ projectId, ref }) propagate the active branch to history/chat APIs and SWR caches.
Workspace UI:
Collapsible rail on all pages with APP_NAME branding (from env), branch chips, session tips pill, and home shortcut pinned to the bottom.
Conversation pane shows shared-history divider, merge button, merge modal (summary only), message edit buttons (modal creates branch from edited node’s parent).
Artefact renamed to Canvas; trunk-only editor with Save/Reset actions, read-only view on branches.
Floating composer anchored to bottom, with light-gray textarea outline, attachment button, stop control, streaming indicator.
Shared history, merge/state badges, and improved branch-aware provider selection persisted per branch.
Copy updates: Home page/rail now use the env-defined app name, “workspace”, “canvas” terminology; artefact references updated where user-facing.
Testing: Client tests updated for new UI strings and selectors; server tests cover new routes; git tests verify ref-aware append and artefact behavior.
Outstanding Work / Next Steps
Context builder tests: Implementation already passes `ref` and injects merge summaries, but we still need coverage proving merged-branch history stays trimmed on trunk and that merge-summary system prompts appear. Consider tests for parent-branch trimming after edits.
Merge flow: UI now includes Canvas diff preview, merge payload selection, and an explicit “Add diff to context” action; there is no `applyArtefact` toggle.
Graph visualization: Not implemented; still need minimal DAG/branch view or planned React Flow integration.
Home rail archive: Spec mentions archiving workspace cards; not yet built.
Collapse rail state: Confirm home rail hides contents when collapsed (currently only workspace rail collapses). Need consistent behavior on both pages per spec.
Composer attachments/modes: Buttons exist but no functionality; define attachment menu/mode selector behavior if needed.
Act warnings: Tests emit “environment not configured to support act”; optional cleanup by wrapping streaming mutations in act.
UI polish:
Canvas section should always fill viewport height above composer (recent tweak bumped padding, but re-check cross-browser).
No home nav in top bar (per spec). Consider adding quick link in header or inside rail toggle tooltip.
Ensure branch rail doesn’t scroll on long lists (spec wanted fixed rail).
Docs: README/plan mention tailwind/postcss config added; confirm instructions cover new scripts (if any) and environment variables.
Hand-off Tips
Always call server routes with ref; the git checkout logic assumes requests specify branch.
When editing messages, you must send nodeId and the server branches from the parent commit; the UI modal already does this.
Canvas/artefact editing is branch-local; always pass `ref` for Canvas reads/writes and make the active ref obvious in UI.
Whenever testing branch flows, ensure npm test passes (act warnings acceptable) and consider running vitest --runInBand if sandbox kill signals appear.
If modifying the rail/composer layouts, watch for overlapping with the floating composer (main container needs pb-* to avoid underlap).

### Phase 3 - Session 2

#### Session 2 - Plan
- **Merge UI completion** — Expand the Workspace merge modal with Canvas diff preview + `applyArtefact` toggle, wire it end-to-end to `/api/projects/[id]/merge`, and add server tests covering adoption safeguards.
- **Graph / visibility** — Deliver the minimal DAG or React Flow pane that highlights shared vs. branch-only nodes and merge/state badges, building on the existing shared-history divider.
- **Context builder coverage** — Write targeted `buildChatContext` tests that prove merge summaries are injected as system prompts and merged-branch histories stay trimmed on trunk/after edits.
- **Rails & workspace polish** — Implement Home-rail archiving, make collapse state consistent across pages, and keep branch chips fixed per spec (no scrolling rails).
- **Composer attachments & act cleanup** — Either wire the attachment/mode buttons or hide them until functional, and address the Vitest act warnings by wrapping streaming mutations in `act()`.
- **Layout/nav fixes** — Ensure the Canvas panel always fills the viewport above the floating composer, add the home nav affordance requested in the spec, and verify the rail doesn’t scroll on long branch lists across browsers.
- **Docs + e2e coverage** — Update README/plan copy to describe branching + Canvas flows and add e2e smoke tests covering branch create/switch, edit, merge, and Canvas edits across refs.

#### Session 2 - Progress
- **Stabilized WorkspaceClient test/runtime crashes**
  - Fixed hook/TDZ issues triggered by refactors (e.g. `trunkName` referenced before init during merge-preview effect; reordered memo/effects accordingly).
  - Resolved the “Stop streaming” accessibility/test mismatch by using stable `aria-label`/role targeting; aligned UI + tests so failures are explicit (not flaky).
  - Added a dedicated layout guardrail test so the graph suite fails fast instead of hanging when layout work exceeds a budget.

- **React Flow graph integration (no more hand-positioning)**
  - Introduced `reactflow` rendering for the workspace graph and a custom node/edge renderer (dot + label, angular/curve paths).
  - Removed the earlier `dagre` approach and moved toward a Git Graph-style lane allocator.

- **Git Graph-style layout + hard safety bounds**
  - Implemented a bounded Git Graph layout pass that cannot hang: `maxIterations` budget + safe fallback layout.
  - Refined the approach to keep the Git Graph layout algorithm “native” (newest-first assumptions) while rendering “time runs downward” via an index transform (layout on reversed view, render oldest-first).
  - Added sanity logging hooks for debugging parent-order violations and stuck vertices during layout development.

- **Global graph view (VS Code-like)**
  - Upgraded graph inputs from “selected branch linear history” to a global DAG: fetch histories for all branches (bounded per-branch) and render all active lanes.
  - Added graph modes: **All** (every node), **Collapsed** (tips/forks/merges, with parent-jump edges), and **Starred** (user-pinned nodes + trunk root).
  - Fixed React Flow edge anchoring by adding explicit handles to the custom node; edges now attach predictably.
  - Fixed merge-edge fan-out bug by treating merge nodes as having a single merge-parent (source branch head at merge time) rather than edges to every `sourceNodeId`.

- **Consistent branch provenance + color system**
  - Added `createdOnBranch` to node metadata at write time (non-retroactive) and ensured merges record the target branch.
  - Centralized branch colors in a single helper (`branchColors`) and wired chat bubble outlines + graph dots/edges to match.
  - Enhanced shared/inherited message styling: thicker colored outlines + subtle “from <branch>” captions positioned outside bubbles (left/right aligned by speaker).

- **Workspace layout overhaul (chat + insights panel)**
  - Reworked layout to: left chat full-height; right collapsible insights panel with Canvas/Graph toggle (rarely need both).
  - Added collapsed-state behavior with a vertical “Canvas | Graph” label and ensured collapse gives width back to chat (no dead space).
  - Added a draggable split-resizer so chat width can be adjusted and persisted per project.

- **Canvas UX improvements**
  - Removed manual Save/Reset and implemented trunk-only autosave (debounced 2s) with an inline spinner that persists for a minimum duration.
  - Ensured the textarea fills its container, is non-resizable, and uses the same frame/padding as graph (via shared wrapper).

- **Graph UX polish**
  - Reduced lane spacing, adjusted vertical spacing, increased label size, enforced single-line truncation.
  - Disabled graph controls/zoom, enabled vertical scroll only when needed, and fixed “scrolling out of view” by clamping vertical translate extents.
  - Fixed toggle viewport behavior: per-mode viewport memory + reset logic so switching modes doesn’t inherit a stale scroll position.
  - Matched Canvas and Graph frames exactly using a shared `InsightFrame` wrapper.
  - Added bottom-pinned initial viewport (when overflow) and “follow bottom” behavior when already at bottom.
  - Added row-aware label positioning so labels start after the right-most edge per-row (with extra gap).
  - Standardized graph iconography using Heroicons (user/assistant/merge in circular badges) and updated merge glyph to match the merge button.

- **Branch operations UX corrections**
  - Required explicit branch name for edit→branch (user must choose name; no more silent `edit-<timestamp>` default in the UI).
  - Unified branch ordering: trunk first, then by last-modified (latest first) with created-time tie-breaker (so edit branches don’t jump unexpectedly).
  - Updated trunk display copy across UI (`main` shown as `trunk`) and renamed graph label to “Quest graph”.

- **Starred nodes (storage + API + UI)**
  - Added per-project `stars.json` stored on trunk, committed to git, and exposed via `/api/projects/[id]/stars` (GET + toggle POST).
  - Added star toggles (☆/★) per chat bubble and implemented the Starred graph mode.

- **Header/UI simplification**
  - Moved Provider selector into the Conversation header (top right), placed it after the model name, and dropped “Last update” + “Model ·” prefix.
  - Removed the redundant “Active · <branch>” pill from the rail and tightened “Branches” header alignment.
  - Converted key UI icons to Heroicons (rail/home/help, composer send/stop/attach, merge button).

- **Chat behavior + styling refinements**
  - Ensured branch chat loads start scrolled to the latest message (bottom).
  - Moved “Merge into trunk” to a floating bottom-right button inside the chat card with an icon badge.
  - Reworked message bubble styling to remove outlines/shadows and rely on background shading: assistant bubbles match section background; user bubbles use a darker shade with a minimum width.
  - Implemented a scroll-tied, continuous “stripe column” per message row colored by each node’s `createdOnBranch`, aligned consistently across inherited/current sections.

#### Session 2 - Handover Notes
- **Priority focus: add test coverage for Session 2 changes** (to reduce regressions from UI/layout churn).
- **Graph layout + hang-safety**
  - Extend `tests/client/WorkspaceGraph.layout.test.ts` to cover multi-branch + merge histories (not just linear chains).
  - Assert the layout always terminates: if `maxIterations` is too small, it must return `usedFallback=true` (fail fast instead of hanging).
  - Add coverage for per-row “right-most edge” label logic (labels should never overlap vertical lines).
- **Graph viewport behavior**
  - Expand `tests/client/WorkspaceGraph.viewport.test.tsx` to cover:
    - initial mount pins to bottom when overflow (newest visible),
    - “follow bottom” when already at bottom and new nodes arrive,
    - stop following when the user scrolls up (mode changes shouldn’t unexpectedly snap).
- **WorkspaceClient graph live-updates**
  - Add a client test (likely in `tests/client/WorkspaceClient.test.tsx`) asserting that when Graph is visible (tab=graph, not collapsed), new history nodes update the displayed graph without requiring a full refetch (we patch `graphHistories[branchName]` from `useProjectData` output).
- **Chat rendering + scroll behavior**
  - Add RTL tests for:
    - branch-load starts scrolled to bottom,
    - shared/inherited section uses darker background while stripe column alignment stays fixed,
    - stripe column is rendered per row (continuous bar segments; no `space-y` gaps),
    - user bubbles enforce `min-w-[300px]`.
- **Iconography regression guard**
  - Add a lightweight UI test asserting key controls still exist by `aria-label` (e.g. `Stop streaming`, `Send message`, `Add attachment`, `Hide canvas / graph panel`) since we migrated to Heroicons.
- **Known TODOs not completed in Session 2**
  - Merge UI still summary-first: Canvas diff + `applyArtefact` toggle wiring + tests remain.
  - README updates + e2e smoke tests remain.
- **Most relevant files changed in Session 2**
  - `src/components/workspace/WorkspaceClient.tsx`
  - `src/components/workspace/WorkspaceGraph.tsx`
  - `src/components/workspace/HeroIcons.tsx`
  - `tests/client/WorkspaceGraph.layout.test.ts`
  - `tests/client/WorkspaceGraph.viewport.test.tsx`

#### Session 2.1 - Testing
- **Goal**: Lock down Session 2’s graph/layout + chat UI changes with regression tests (no hangs, no viewport surprises, no UI selector drift).
- **1) Graph layout correctness + safety** (`tests/client/WorkspaceGraph.layout.test.ts`)
  - Add fixtures for fork+merge and multiple branches/merges.
  - Assert `layoutGraph(..., { maxIterations: low })` returns `usedFallback=true` (fails fast; never hangs).
  - Assert normal budgets return `usedFallback=false`.
  - Assert merge edge fan-out stays fixed (merge connects to one merge-parent, not every `sourceNodeId`).
  - Assert per-row label logic: labels start after the right-most reserved edge for that row (no overlaps).
- **2) Graph viewport behavior** (`tests/client/WorkspaceGraph.viewport.test.tsx`)
  - Initial mount pins to bottom when overflowing (newest visible).
  - Follow-bottom when already pinned and nodes are appended.
  - Stop following when user scrolls up (simulate `onMoveEnd`; subsequent nodes should not re-pin).
- **3) WorkspaceClient graph live-updates when visible** (`tests/client/WorkspaceClient.test.tsx`)
  - When Graph is visible (tab=graph, not collapsed), new `useProjectData().nodes` should update `branchHistories[branchName]` passed to `WorkspaceGraph` without refetch.
  - When Graph is not visible (tab=canvas or collapsed), ensure it does not perform graph-history patch updates.
- **4) Chat scroll-to-bottom on branch load** (new client test file or extend `tests/client/WorkspaceClient.test.tsx`)
  - On branch switch, message list should scroll to latest message after load completes.
- **5) Chat stripe column + shared/current alignment** (new client test file)
  - Stripe column rendered per row and continuous (no `space-y` gaps in the scroll list).
  - Shared section background applies behind message column only and does not shift stripe column position.
- **6) Icon/aria-label regression smoke** (fold into existing WorkspaceClient tests)
  - Keep selectors stable via `aria-label`: `Send message`, `Stop streaming`, `Add attachment`, `Hide canvas / graph panel`.

#### Session 2.1 - Testing
