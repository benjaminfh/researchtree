# User Flows (Web App)

## Public entry points
- **Login / Signup** (`/login`)
  - Toggle sign-in vs sign-up.
  - Waitlist notice when enforced.
- **Waitlist** (`/waitlist`)
  - Request access or apply access code.
- **Check email** (`/check-email`)
  - Post-signup or password reset confirmation.
- **Forgot / Reset password** (`/forgot-password`, `/reset-password`)
  - Request reset email and set new password.
- **Auth callback** (`/auth/callback`)
  - Supabase code exchange and redirect.

## Signed-in flows
- **Home** (`/`)
  - Create workspace (name, description, provider).
  - View recent workspaces; archive/unarchive locally.
  - Prompt to add LLM tokens when missing.
- **Workspace** (`/projects/:id`)
  - Chat and streaming responses.
  - Branching, switching, hiding, pinning.
  - Graph and canvas panels.
  - Edits and merges.
- **Profile** (`/profile`)
  - Manage provider tokens (OpenAI/Gemini/Anthropic).
  - Change password (web only).
- **Admin waitlist** (`/admin/waitlist`)
  - Approve requests and manage allowlist.

## Core workspace actions
- **Chat**
  - Stream assistant responses; interrupt when needed.
  - Thinking levels and optional web search.
- **Branching**
  - Create branches from branch head or from a node.
  - Rename, hide/unhide, pin/unpin.
  - Question branches from highlighted assistant responses.
- **Graph**
  - View nodes (full/collapsed/starred), select nodes.
- **Canvas**
  - Edit draft content and save.
  - Pin merge diffs to a message node.
- **Merges**
  - Merge source → target with summary and diff.
  - Auto-ack merge nodes to keep context consistent.
- **Collaboration (PG only)**
  - Invite members, update roles, revoke invites.
  - Lease-based editing locks.

## Global conventions
- Cmd+Enter submits any valid form.
- Cmd+B toggles the rail.
- Icons are sourced via Blueprint icon helpers.
