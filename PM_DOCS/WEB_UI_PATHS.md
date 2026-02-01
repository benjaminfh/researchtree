# Web App UI Paths (Code-Derived)

Date: 2026-02-01

## Scope and assumptions
- Scope: Next.js web app only (no desktop app).
- Storage: Postgres via Supabase or local PG adapter only. Git-backed storage paths are intentionally omitted.
- Source: Derived from code inspection (no live UI run yet).

## Global UI conventions
- Form submission: All text forms submit on Cmd+Enter when the form is valid (via `useCommandEnterSubmit` / `CommandEnterForm`).
- Icons: UI icons are surfaced via Blueprint icon wrappers (`BlueprintIcon` and `HeroIcons`).
- Rail layout: Cmd+B toggles the left rail (when not typing in an input/textarea).

## Public entry points
- `/login`
  - Modes: sign up (default) and sign in (toggle or `mode=signin`).
  - Waitlist enforced: sign-up shows “Request access” link if `RT_WAITLIST_ENFORCE` is enabled.
  - Password reveal toggles for sign-in/sign-up.
  - “Forgot password?” link to `/forgot-password`.
- `/waitlist`
  - Request access by email.
  - Apply access code (email + code).
  - Redirects back with success/error query params.
- `/check-email`
  - Confirmation or password-reset email sent notice.
  - Link back to sign in.
- `/forgot-password`
  - Request reset email; redirects to `/check-email?mode=reset`.
- `/reset-password`
  - Set new password from recovery flow.
- `/auth/callback`
  - Supabase auth code exchange; redirects to `redirectTo`.
- `/auth/signout`
  - POST endpoint; signs out and redirects to sign-in.

## Authenticated entry points
- `/`
  - Home dashboard with recent workspaces.
  - Create workspace form (name, description, provider).
  - Archive/unarchive workspaces (stored in localStorage).
  - Token prompt modal if no LLM provider tokens are configured.
- `/projects/:id`
  - Workspace UI for a single project (branches, chat, graph, canvas, merges).
- `/profile`
  - Manage LLM provider tokens (OpenAI/Gemini/Anthropic).
  - Change account password (web only; hidden in desktop runtime).
- `/admin/waitlist` (admin-only)
  - Approve by email, review pending requests, manage allowlist.

## Workspace user paths (web app)
- **Open workspace**
  - Loads project + branches + current branch.
  - Rail shows workspaces and auth status.

- **Create workspace**
  - Home: Create workspace form (provider selection from enabled providers).
  - On success: navigate to `/projects/:id`.

- **Chat on a branch**
  - Composer supports message, question + highlight, thinking level, web search toggle.
  - Sends streaming chat request to `/api/projects/:id/chat`.
  - Interrupt streaming via `/api/projects/:id/interrupt`.

- **Branch management**
  - Switch branch: `/api/projects/:id/branches` (PATCH).
  - Create branch from current branch or from a specific node.
  - Rename branch: `/api/projects/:id/branches/:refId` (PATCH).
  - Pin/unpin branch: `/api/projects/:id/branches/:refId/pin` (POST) and `/api/projects/:id/branches/pin` (DELETE).
  - Hide/unhide branch: `/api/projects/:id/branches/:refId/visibility` (PATCH).

- **Question branches**
  - Create a branch from a highlighted assistant response + user question.
  - Optionally stay on current branch (hidden branch creation).
  - Uses `/api/projects/:id/branch-question` and then streams chat.

- **Graph views**
  - Graph, collapsed, and starred modes (includes node selection).
  - Graph data fetched from `/api/projects/:id/graph`.

- **Canvas**
  - Canvas text view/edit using draft (POST/PATCH `/api/projects/:id/artefact`).
  - Canvas diff surfaced during merge flows.
  - Optional pin of merge diff to a message via `/api/projects/:id/merge/pin-canvas-diff`.

- **Message editing**
  - Edit a past message by creating a new branch and replaying (streamed or non-streamed).
  - Uses `/api/projects/:id/edit` and `/api/projects/:id/edit-stream`.

- **Merge flow**
  - Merge source → target branch with summary.
  - Generates merge nodes, optional auto-ack message, and canvas diff.
  - Uses `/api/projects/:id/merge` and optionally `/api/projects/:id/merge/pin-canvas-diff`.

- **Stars**
  - Toggle starred nodes with `/api/projects/:id/stars`.

- **Collaboration (PG only)**
  - Invite members (viewer/editor), update roles, remove members/invites via `/api/projects/:id/members`.
  - Invite email sent via Resend when configured.
  - Branch leases for editing coordination via `/api/projects/:id/leases`.

## Admin paths
- **Waitlist admin** (`/admin/waitlist`)
  - Approve email, review pending requests, manage allowlist.
  - Uses server actions + waitlist RPCs.

## System-level paths
- **Maintenance mode**
  - When enabled, middleware serves a maintenance page (or 503 for API).
  - Admin allowlist can bypass maintenance for UI.

## Known out-of-scope paths
- Git-backed storage mode and `src/git/**` are intentionally excluded.
- Desktop/Electron UI is intentionally excluded.
