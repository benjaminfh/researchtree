# MVP Release Checklist

Use this checklist when declaring the MVP “done” (or before cutting a demo build).

## 1) Code Health
- `npm run typecheck`
- `npm test`
- `npm run build`

Notes:
- If you see intermittent Vitest worker timeouts locally, the repo config caps concurrency in `vitest.config.ts`.

## 2) Local Smoke Test (Dev)
1. `npm run dev`
2. Create a project from `/`.
3. In the workspace:
   - Send a message; verify streaming + Stop works.
   - Edit the Canvas; verify autosave.
   - Create a branch; verify shared history is collapsed by default on the branch.
   - Merge into another branch; verify merge node shows merged payload and Canvas changes are not auto-applied.
   - On the merge node, pin Canvas changes into context (either from the chat bubble or from the graph selection panel).
   - Open **Quest graph**; select a node → **Jump to message**; verify it scrolls + highlights the target row (including shared history nodes).
   - Select a merge node in the graph; use **Add canvas changes** (confirm) and verify it shows “Canvas changes added”.

## 3) Environment
- `.env.local` present (or `LLM_PROVIDER=mock`).
- `RESEARCHTREE_PROJECTS_ROOT` points at a writable directory.
- `git` is installed and on PATH.

## 4) Known Non-Goals (Confirm)
- No auth / multi-user.
- No automatic Canvas merge; only diff snapshot + optional pin into context.
- Locks are in-memory (single-process assumption).

