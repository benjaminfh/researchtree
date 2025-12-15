# Phase 2: Basic Chat & Project Shell — Implementation Plan

## Goal
Deliver an end-to-end Next.js application that exercises the git-backed reasoning core: create/select a project, hold a trunk-only chat with an LLM, persist nodes to git, and surface the evolving artefact beside the conversation. This proves the UI + API loop, validates context assembly against the technical requirements, and sets up hooks for branching/merge flows in Phase 3.

## Product Alignment
1. **PRD alignment** — Preserve epistemic structure by treating each chat turn as a node written through the git stack (Principles 1, 8, 9).
2. **Technical requirements** — Respect append-only nodes, artefact-trunk constraint, and controllable context assembly (Sections 1–4).
3. **Implementation continuity** — Build on Phase 1 exports under `src/git/*` without duplicating storage logic; keep client/server separation clean for future branch-aware UI.

---

## Architecture Overview

### Client (Next.js App Router)
- **Pages / routes**
  - `/` — project list/creation screen.
  - `/projects/[id]` — workspace with chat pane, artefact pane, context metadata strip.
- **State management**
  - `ProjectProvider` at layout level for ID + metadata.
  - React Query/SWR for polling project state (history, artefact) with revalidation on node append.
  - Streaming hook (`useChatStream`) that handles SSE/Fetch streaming and reconciles partial assistant nodes.
- **UI composition**
  - Chat timeline component renders nodes (system/user/assistant/state/merge) with metadata badges.
  - Artefact viewer is a markdown pane (read-only in Phase 2).
  - Status bar shows git branch (main), project name, last commit time.

### Server (Next.js Route Handlers)
- `/api/projects` (REST) uses `src/git/projects.ts`.
- `/api/projects/[id]/history` returns nodes for current ref.
- `/api/projects/[id]/artefact` returns markdown content.
- `/api/projects/[id]/chat` handles user input + LLM streaming:
  1. Append user node.
  2. Assemble context (last N nodes + artefact).
  3. Call OpenAI/Anthropic streaming API via fetch.
  4. Stream assistant tokens to client while buffering.
  5. On completion/interrupt, append assistant node with `interrupted` flag as needed.
- `/api/projects/[id]/interrupt` stops active stream (server-side abort controller).

### Data & Context Flow
1. UI posts user message → API writes node via Phase 1 helper.
2. API assembles prompt by traversing git nodes (respecting append-only order; limit by token budget).
3. LLM completion streamed to client; final buffer persisted as assistant node and broadcast via SSE/WebSocket revalidate path.
4. Artefact reads remain trunk-only; editing deferred to later phase but viewer must refresh when `state` nodes appear.

---

## Project Structure Updates
```
researchtree/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Project list
│   │   └── projects/[id]/page.tsx   # Workspace shell
│   ├── components/
│   │   ├── chat/...
│   │   └── artefact-pane.tsx
│   ├── hooks/
│   │   ├── useChatStream.ts
│   │   └── useProjectData.ts
│   └── server/
│       └── llm.ts                   # Thin wrapper around OpenAI/Anthropic SDK
├── app.d.ts                         # type augmentation for env vars
├── env.example
├── scripts/
│   └── seed-project.ts
└── package.json (Next.js deps, OpenAI SDK, SWR/React Query, zod)
```

Key constraints:
- Keep `src/git` untouched except for any minor exports needed.
- Route handlers import directly from `src/git`.
- All client components remain server-render friendly (no `window` usage outside client sections).

---

## API & Services

| Route | Method | Purpose | Notes |
| --- | --- | --- | --- |
| `/api/projects` | GET/POST | List & create projects | POST validates payload (name, description). Returns metadata. |
| `/api/projects/[id]` | GET/DELETE | Inspect/delete project | GET includes branch info (currently only main). |
| `/api/projects/[id]/history` | GET | Fetch ordered nodes | Query params: `limit`, `before`. Response used by chat list + context assembly. |
| `/api/projects/[id]/artefact` | GET | Fetch trunk artefact | Always pulls from main via git helper. |
| `/api/projects/[id]/chat` | POST (stream) | Append user node + LLM response | Body: `{ message: string, intent?: string }`. Stream SSE/Fetch readable. |
| `/api/projects/[id]/interrupt` | POST | Abort in-flight completion | Uses AbortController map keyed by project ID. |

Shared behaviors:
- Route handlers must guard invalid IDs via `assertProjectExists`.
- Responses include derived metadata (node IDs, timestamps) so the client can optimistically render.
- Use `zod` schemas for payload validation and to avoid malformed nodes.

---

## UI/UX Scope
1. **Project index**
   - Lists all repos with name, created date, node count.
   - CTA to create project (modal/form).
2. **Workspace layout**
   - Left: chat timeline with sticky composer (textarea + send + interrupt).
   - Right: artefact viewer (markdown) with refresh indicator when state node commits land.
   - Header: project name, branch badge (`main`), active model, token usage placeholders.
3. **Chat composer states**
   - Idle, sending (disabled send button, show spinner), streaming (stop button), error (retry CTA).
4. **Node rendering**
   - Message nodes show role, timestamp, commit summary.
   - `state` nodes appear inline as pill showing “Artefact updated”.
   - Merge nodes placeholder (none yet, but component must exist for future compatibility).
5. **Empty states**
   - No projects yet.
   - Project exists but no messages (show instructions referencing PRD workflow: seed system prompt then chat).

UX must reinforce PRD principles: emphasise trunk context, show provenance (timestamps, roles), and avoid pretending to be linear chat history unrelated to git.

---

## Context Assembly & Streaming Details
1. **Context builder module (`src/server/context.ts`)**
   - Pull latest N nodes (default 40) via `readNodesFromRef`.
   - Stop when token estimate exceeds budget (~8k tokens between history + artefact).
   - Always include artefact snapshot at end of system prompt.
   - Do not inline merge history; include merge summary nodes verbatim.
2. **LLM Wrapper**
   - Support OpenAI `Responses API` or Anthropic `messages` with streaming; expose uniform async generator that yields `{ chunk: string }`.
   - Accept AbortSignal for interrupts.
3. **Client stream handling**
   - Use `ReadableStream` from fetch; append tokens to UI immediately.
   - If interrupt triggered, mark assistant node as `interrupted: true` and persist partial text.
4. **Error handling**
   - On API failure, roll back optimistic user node if assistant never persisted.
   - Surface inline error with retry; maintain git log integrity (never double-write).

---

## Implementation Checklist

### 1. Tooling & Dependencies
- [ ] Install Next.js (`next`, `react`, `react-dom`), Tailwind (optional) or simple CSS.
- [ ] Add runtime SDK (`openai` or `@anthropic-ai/sdk`), `zod`, `swr` (or React Query), `remark`/`react-markdown`.
- [ ] Update `tsconfig.json` paths for shared modules; enable `jsx: react-jsx`.
- [ ] Add `next.config.js` with experimental `serverActions` disabled (not needed yet).
- [ ] Extend `package.json` scripts (`dev`, `next build`, `next start`, `lint` via `next lint` or `tsc`).
- [ ] Commit `env.example` listing `OPENAI_API_KEY`, `RESEARCHTREE_PROJECTS_ROOT`.

### 2. Server Route Handlers
- [ ] `/api/projects` GET/POST with validation + git helper calls.
- [ ] `/api/projects/[id]/history` hitting existing `getNodes`.
- [ ] `/api/projects/[id]/artefact` returning markdown + last state node metadata.
- [ ] `/api/projects/[id]/chat` orchestrating node append + LLM stream, ensuring:
  - [ ] Append user node immediately.
  - [ ] Acquire abort controller, store in map.
  - [ ] Stream assistant output to client, buffer for final commit.
  - [ ] Append assistant node with `interrupted` flag.
- [ ] `/api/projects/[id]/interrupt` retrieving abort controller and cleaning up.
- [ ] Shared error helper returning JSON with `code`, `message`.

### 3. Client Components
- [ ] Project list page with server-side fetch (Next.js server component) + client form.
- [ ] Workspace layout (server component) that fetches metadata; child client components handle live data.
- [ ] Chat timeline component w/ virtualization (optional) and support for message/state/merge nodes.
- [ ] Composer component with optimistic append + streaming state.
- [ ] Artefact pane using `react-markdown`, auto-refresh triggered via SWR on `state` node arrival.
- [ ] Toast/error boundary for API failures.

### 4. Hooks & Utilities
- [ ] `useProjectData` (SWR) pulling history + artefact; dedupe concurrent refreshes.
- [ ] `useChatStream` to send message → manage fetch stream → update SWR cache.
- [ ] Token estimator utility (simple char count heuristic) for context trimming.
- [ ] Date formatting + role-to-color mapping helpers.

### 5. Testing & Verification
- [ ] Vitest tests for context builder (token trimming, artefact inclusion).
- [ ] API route tests using Next.js route handler test harness (or Vitest + supertest) mocking `src/git`.
- [ ] React component tests (lightweight) for chat composer interactions.
- [ ] Manual e2e checklist: create project, send message, interrupt, verify git repo content via CLI.

### 6. Developer Experience
- [ ] Seed script to create demo project with sample nodes for UI dev.
- [ ] Storybook or simple preview page for chat components (optional stretch).
- [ ] Updated README instructions for running `next dev`, setting env vars, and pointing UI to local git storage.

---

## Testing Strategy
1. **Unit tests** — context builder, API payload validation, streaming abort logic (mock LLM).
2. **Integration smoke** — spin up Next.js dev server + in-memory fetch to ensure `/api/projects/:id/chat` writes nodes & returns stream.
3. **Manual dogfooding** — Use UI to:
   - Create project.
   - Send multi-turn conversation.
   - Interrupt assistant.
   - Observe artefact pane update after calling `updateArtefact` (via CLI) to ensure UI reflects trunk changes.
4. **Git inspection** — Confirm `nodes.jsonl` contains both user + assistant nodes per chat turn and that interrupts carry `interrupted: true`.

---

## Success Criteria
1. Creating a project via UI results in git repo matching Phase 1 spec.
2. Sending a message from UI writes both the user node and streamed assistant node in order with correct metadata.
3. Artefact pane always reflects trunk state; editing is blocked in UI but viewer updates automatically when repo changes.
4. Interrupt button reliably stops streaming and persists partial assistant output flagged correctly.
5. Context builder respects limits (no request exceeds configured token ceiling) and maintains ordering from git history.
6. API + UI gracefully surface errors (missing keys, git failures) without corrupting repo state.
7. Architecture leaves room for Phase 3 (branching): workspace already renders branch badge, data hooks accept `ref` parameter even though only `main` exists now.

---

## Risks & Mitigation
- **LLM latency / streaming errors** — Always append user node before calling LLM; if assistant fails, display error and allow retry without duplicating node.
- **Git contention** — Serialize chat writes per project (mutex) to avoid race conditions during concurrent sends.
- **Context overflow** — Implement conservative truncation (oldest nodes dropped first) with instrumentation log for when trimming occurs.
- **UI divergence from git reality** — After each commit, re-fetch history from `/history` to reconcile optimistic UI state.

---

## Next Steps After Phase 2
1. Extend workspace to branch-aware navigation (Phase 3 scope).
2. Add merge UI + artefact editing capabilities.
3. Instrument graph visualization using data from `/history` + future `/graph` endpoint.

Phase 2 completion should provide a reliable trunk-only research loop, making future branch/merge work a focused UI + workflow problem rather than establishing the fundamentals.
