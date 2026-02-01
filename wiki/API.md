# API (Web App)

## Auth
- `GET /api/auth/me` — current user (id + email).
- `POST /auth/signout` — sign out and redirect.
- `GET /auth/callback` — Supabase auth callback + redirect.

## Health
- `GET /api/health` — PG health + migration status (local PG bootstrapped if enabled).

## Profile
- `GET /api/profile` — user + token status.
- `PUT /api/profile` — update provider tokens.
- `GET /api/profile/llm-keys` — server-side token readability checks.
- `PUT /api/profile/password` — change password (same-origin enforced).

## Projects
- `GET /api/projects` — list projects (PG mode).
- `POST /api/projects` — create project (provider + default model).

## Workspace (per project)
- `GET /api/projects/:id/branches` — list branches + current branch.
- `POST /api/projects/:id/branches` — create branch (optional from node).
- `PATCH /api/projects/:id/branches` — switch current branch.
- `PATCH /api/projects/:id/branches/:refId` — rename branch.
- `POST /api/projects/:id/branches/:refId/pin` — pin branch.
- `DELETE /api/projects/:id/branches/pin` — clear pin.
- `PATCH /api/projects/:id/branches/:refId/visibility` — hide/unhide branch.

- `GET /api/projects/:id/history` — branch history (filtered of hidden/merge-ack nodes).
- `GET /api/projects/:id/graph` — graph payload + branch histories + stars.
- `GET /api/projects/:id/artefact` — read canvas content.
- `PUT /api/projects/:id/artefact` — update canvas draft content.

- `POST /api/projects/:id/chat` — streaming chat (NDJSON).
- `POST /api/projects/:id/interrupt` — interrupt active stream.
- `POST /api/projects/:id/edit` — edit a message (non-streamed).
- `POST /api/projects/:id/edit-stream` — edit a message (streamed).
- `POST /api/projects/:id/branch-question` — question branch creation + chat.

- `POST /api/projects/:id/merge` — merge source → target with summary + diff.
- `POST /api/projects/:id/merge/pin-canvas-diff` — pin merge diff as message.

- `GET /api/projects/:id/stars` — list starred nodes.
- `POST /api/projects/:id/stars` — toggle star for a node.

## Collaboration (PG only)
- `GET /api/projects/:id/members` — list members + invites.
- `POST /api/projects/:id/members` — invite member (viewer/editor).
- `PATCH /api/projects/:id/members` — update role for member/invite.
- `DELETE /api/projects/:id/members` — revoke invite or remove member.

- `GET /api/projects/:id/leases` — list branch leases.
- `POST /api/projects/:id/leases` — acquire lease.
- `DELETE /api/projects/:id/leases` — release lease (force requires owner).
