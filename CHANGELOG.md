# Changelog

All notable user-facing changes are documented here.

## v0.1.0 - 2026-02-02
- Branchable workspaces with git-style refs, branching flows, and merge summaries.
- Live graph view and branch-scoped Canvas with merge diff previews.
- Per-branch provider/model settings plus optional thinking traces.
- Collaboration support in Postgres mode (members, invites, edit locks).
- Multi-backend provenance: Postgres (Supabase/local) with legacy git mode.
- Electron desktop shell for local workflows.
- Recent updates:
  - GitHub OAuth sign-in (feature-gated via `RT_GITHUB_AUTH`) and login UI refresh.
  - Markdown code block wrap toggle plus icon-only copy control.
  - Contextual highlight menu for assistant selections.
  - Desktop env example and local PG user email alignment.
  - Ref label resolution after renames and ref-id FK columns in PG nodes/RPCs.

## Pre-release change log

### 2026-01-19
- PG history/graph/context now resolve branch labels from refs to avoid stale names after renames.
- Git branch renames refresh node JSON labels without breaking node-to-commit mapping.
- PG RPCs return ref IDs and nodes carry ref-id FK columns for stable joins.
- Legacy rows missing ref IDs now show `unknown` labels (temporary fallback).

### 2026-01-18
- Collaboration stages 2-5: invites, DB leases, and server/client support.
- Workspace shortcuts refined: graph panel hotkeys and browser-conflict adjustments.
- Branch rename errors are now explicit and user-friendly.

### 2026-01-06
- Branch-question flow and edit streaming updates.
- Responses API continuity improvements.
- Workspace rail UX: centered modal, scrollable branches, consistent backdrop dismissal.
- Graph and chat stability fixes for empty-history and highlight context.

### 2025-12-31
- Ref-id migrations across PG adapters and RPCs, plus data backfill and enforcement guards.
- Playwright e2e smoke suite and dedicated CI workflow.
- Auth sign-in flow tightened with password policy enforcement.
- Branch rename and pin support (with follow-up fixes).
- Rail layout polish and thinking bar ordering consistency.

### 2025-12-29
- Web search toggle and OpenAI search routing in the workspace.
- Thinking traces data model and documentation.
- History fetching optimizations and shared-count streaming stability.
- Graph viewport and UI styling improvements for search controls.

### 2025-12-28
- Local Postgres adapter with bootstrap, auto-create, and desktop integration support.
- macOS desktop wrapper scaffold, health checks, and packaging pipeline updates.
- Canvas tools wiring with hidden diff context and adapter selection.
- Provider error messaging and stream typing fixes.

### 2025-12-22
- Supabase auth, waitlist gates, and profile credential flows.
- Postgres provenance shadow-write/read parity with hardened tests.
- Workspace rail UI polish, popovers, and session tips.
- LLM provider diagnostics, error handling, and model option updates.
- Password reset via magic link and change-password support.

### 2025-12-18
- Ref-safe streaming chat with per-ref locking.
- Merge UX improvements with assistant payload previews and arbitrary targets.
- Graph lane stability fixes and build/typecheck hardening.

### 2025-12-17
- Git-style global graph and workspace UI polish.
- Branch-safe editing with artefact editor and related tests.
- Phase 3 UI design specification.

### 2025-12-16
- Next.js app shell with project list and creation flow.
- Branch-aware workspace UI with real git counts and metadata timestamps.
- Provider selection wiring, markdown artefact rendering, and streaming improvements.
- Client/server test coverage for core routes and hooks.

### 2025-12-15
- Initial branch management and node operations.
- Project structure refactors and developer documentation.

### 2025-12-14
- Initial repository setup and early product docs.
