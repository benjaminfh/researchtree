# Phase 3: Branching, Merge UI, and Artefact Editing — Implementation Plan

## Goal
Ship the full reasoning loop with branch-aware UX: create/switch branches, edit messages (auto-branch), merge back with summaries and optional artefact adoption, edit artefact on trunk with safeguards, and visualize shared/branch history. Close the gap between git-layer support and the Next.js app by adding route handlers, context rules, and UI polish so branching is reliable, explainable, and testable.

## Product Alignment
1. **Provenance-first** — Every node is append-only, one commit per node, branches reflect reasoning forks, merges carry explicit summaries (PRD Principles 1, 8, 9).
2. **Trunk authority** — Artefact edits only on trunk; branch merges optionally adopt branch artefact (TECH_REQUIREMENTS sections 2–3).
3. **Context discipline** — Shared history visible; merge summaries injected, branch-specific context constrained (TECH_REQUIREMENTS section 4).
4. **Dogfoodable** — Branch, explore, merge, and edit artefact inside the app without falling back to CLI.

## Scope (In/Out)
**In**
- Branch list/create/switch endpoints + UI wired to git.
- Merge flow (diff preview, summary required, choose trunk vs branch artefact).
- Message editing UX that auto-creates branch from parent node.
- Artefact editing on trunk (markdown editor + guardrails).
- Context builder: branch-aware history retrieval, merge summary inclusion, trimming.
- Graph/visual cues: shared-history divider, merge/state badges, minimal DAG view (React Flow or list-based fallback).
- Provider/model persistence per branch; keyboard shortcut toggle.
- Error handling + retries for branch ops and merges.

**Out (defer)**
- 3-way artefact merge resolution UI.
- Advanced context compression/summarization.
- Tool calling/search.
- Mobile polish and accessibility hardening.

## Architecture / System Changes
### Server (Next.js Route Handlers)
- Add `/app/api/projects/[id]/branches/route.ts` (GET list, POST create, PATCH switch).
- Add `/app/api/projects/[id]/merge/route.ts` (POST merge summary + artefact choice).
- Add `/app/api/projects/[id]/edit/route.ts` (POST edit node -> create branch + append edited message).
- Extend `/app/api/projects/[id]/artefact/route.ts` to support PUT/PATCH for trunk-only edits.
- Ensure all routes share validation via `src/server/schemas.ts` and use git helpers directly.

### Data/Context
- Continue one-commit-per-node; merge node already contains `mergeFrom`, `mergeSummary`, `sourceCommit`, `sourceNodeIds`.
- Context builder: accept `ref`, include merge summaries as system messages, trim by token budget, and avoid expanding merged branch history.
- Serialize chat writes per project/ref (mutex) to prevent interleaved commits.

### Client
- Workspace branch bar: list, create, switch; display provider per branch.
- Merge modal: shows merge summary input (required), artefact diff (trunk vs branch), toggle to adopt branch artefact.
- Artefact editor: enabled only on trunk; disabled on branches; optimistic save + rollback on failure.
- Message edit action: triggers `/edit` route, switches to new branch, seeds composer with edited text.
- Shared-history divider improvements and badges for merge/state nodes; minimal graph pane if time.

## API Surface (Phase 3)
| Route | Method | Purpose |
| --- | --- | --- |
| `/api/projects/:id/branches` | GET | List branches with metadata. |
| `/api/projects/:id/branches` | POST | Create branch (`name`, `fromRef?`). |
| `/api/projects/:id/branches` | PATCH | Switch active branch (`name`). |
| `/api/projects/:id/merge` | POST | Merge branch into current ref with `mergeSummary`, `sourceBranch`, `applyArtefact`. |
| `/api/projects/:id/edit` | POST | Edit a node: create branch from parent and append edited message. |
| `/api/projects/:id/artefact` | PUT/PATCH | Update artefact (trunk-only guard). |

## UI/UX Scope
1. **Branch bar** — Create/switch, show trunk badge, per-branch provider/model label, error states.
2. **Shared history** — Divider + show/hide shared nodes; badges for merge/state.
3. **Merge UI** — Diff of artefact (trunk vs branch), required summary textarea, adopt-artefact toggle, success/failure toasts.
4. **Artefact editor (trunk-only)** — Markdown editor with dirty state, save/disable on branches, last-updated metadata.
5. **Message edit** — Inline “Edit” on any message; on submit, branch created and user switched there; composer seeded.
6. **Graph/visibility** — At minimum, per-branch history counts and merge/state badges; stretch: mini DAG via React Flow.
7. **Settings polish** — Shortcut toggle (⌘+Enter), provider persistence per branch.

## Implementation Checklist
- [ ] Add missing route handlers for branches, merge, edit, artefact update with zod validation + git helper wiring.
- [ ] Update `useProjectData` to accept `ref` and expose branch-aware artefact/history; add branch-aware SWR keys.
- [ ] Extend `useChatStream` to carry `ref` and provider per branch; ensure interrupt works cross-branch.
- [ ] WorkspaceClient: wire branch bar to new routes; integrate merge modal; enable artefact editor on trunk.
- [ ] Add message edit UI + handler calling `/edit`.
- [ ] Context builder: support `ref`, merge summaries, token-budget trimming; serialize writes per project.
- [ ] Graph/metadata: render merge/state badges; optional React Flow DAG.
- [ ] Docs: README updates for Phase 3 flows; env vars unchanged.
- [ ] Tests per spec (server, hooks, components, e2e).

## Risks & Mitigations
- **Route drift** (routes missing vs tests): define and implement handlers before UI changes; align zod schemas with git functions.
- **Artefact overwrite**: enforce trunk-only edits and merge toggle; add tests for rejection on branches.
- **Context pollution**: ensure merge summaries included, merged branch history not in context when on trunk; add builder tests.
- **Concurrent writes**: mutex per project/ref around chat/merge/edit; test for race release on error.
- **LLM/provider errors**: surface in UI with retry; don’t double-append nodes.

## Success Criteria
1. Users can branch, chat, edit messages (auto-branch), and merge back with required summary and optional artefact adoption.
2. Artefact edits work on trunk and are blocked on branches.
3. Context assembly respects branch ref and merge summaries without leaking merged histories.
4. UI clearly shows shared vs branch-specific nodes and merge/state badges.
5. Tests in MVP_P3_TEST_SPEC pass (unit, integration, e2e smoke for branch/merge/edit/artefact flows).
