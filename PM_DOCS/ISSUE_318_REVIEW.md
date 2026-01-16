# Issue 318 Review - Collaboration on Projects

## Issue 318 Summary (Original Spec)
- All users must be authenticated.
- Projects are private by default.
- Owner can share project by email; stored as invite and resolved to user if/when the email registers.
- Owner can revoke users from share list.
- Branch interaction (sending messages) is governed by leases: one lease per branch, TTL set by env.
- Lease owner sees "Editing" and can release lease; others see "Locked".
- No hard limit on concurrent leases beyond 1 per branch.
- Out of scope: lease request + toast.

## Additional Requirements Emerged From Current Branch
- Lease sessions are per-project, persisted in local storage, and must be sent on every write request in PG mode.
- Leases are per ref/branch; TTL is RT_REF_LEASE_TTL_SECONDS; leases are implicitly acquired/extended on write.
- Branch list includes lease metadata and UI shows Editing/Locked chips plus a Release action for the current user.
- Collaboration is PG-only (routes, RPCs, and lease enforcement).
- Owner can share by email (viewer/editor), update roles, revoke members, revoke invites; owner role cannot be changed.
- Invites auto-accept on profile load if email matches.
- New APIs: /members (list/invite/update/remove) and /leases (list/acquire/release).

## Workspace Client Paths + Decision Points

### Core write paths (consolidated list)
- Chat on existing branch (foreground).
- New branch creation (foreground).
- Branch via edit (foreground or background).
- Branch via assistant (foreground).
- Branch via question on assistant (foreground or background).
- Merge (foreground).
- Artefact/canvas updates (autosave/background).
- Branch rename (foreground).

### Chat (send message)
Path: useChatStream -> /api/projects/[id]/chat
- Decision: block send until leaseSessionId is ready? **Yes.**
- Decision: lease acquisition failure UX (generic error vs locked-by-user state)? **Show locked-for-editing (no user name).**

### Branch question
Path: /api/projects/[id]/branch-question -> /chat
- Decision: should branch creation itself require a lease, or is enforcing on /chat enough? **No lease required for branching.**

### Edit message (stream)
Path: /api/projects/[id]/edit-stream
- Decision: lease on source ref only (current), or target too? **Target only (branching does not require source lease).**
- Decision: should edits block until leaseSessionId is ready? **Yes.**

### Background edit queue
Path: background task -> /api/projects/[id]/edit-stream
- Decision: require leaseSessionId before queuing, or allow a deferred retry? **Require before queueing.**

### Merge
Path: /api/projects/[id]/merge
- Decision: lease on target branch only (current) or also source? **Both.**
- Decision: should merge block until leaseSessionId is ready? **Yes.**

### Artefact autosave
Path: /api/projects/[id]/artefact
- Decision: snapshot content + ref at timer creation (t=0)? **Yes.**
- Decision: force save before branch switch, cancel pending timers? **Yes.**
- Decision: block autosave until leaseSessionId is ready? **Yes.**
- Decision: should autosave fail when lease is held by another user? **Yes; block editing UI if no lease.**

### Branch rename
Path: /api/projects/[id]/branches (PATCH)
- Decision: require lease on the branch being renamed? **Yes.**

### Lease release
Path: /api/projects/[id]/leases DELETE
- Decision: should only lease holder release (current) or allow owner force-release? **Owner force-release allowed.**

## Sharing and Collab UI Paths + Decision Points

### Share / manage members
Path: /api/projects/[id]/members (GET/POST/PATCH/DELETE)
- Decision: owner-only enforcement at API level, or rely solely on RPC authz? **Enforce at API layer (403).**
- Decision: non-owner visibility of share UI (hide vs read-only)? **Owner-only UI.**

### Member removal
- Decision: should removing a member revoke any active leases? **Yes.**

### Branch list lease indicators
- Decision: explicit "Acquire lease" action vs implicit on write? **Implicit.**

### Invite acceptance
Path: profile GET auto-accepts invites
- Decision: should this be silent or surface a notification? **Silent.**

## UI Additions Required (Not Implemented Yet)
- Share entry point in workspace header (button/menu item) visible to owners.
- Share modal for invite-by-email with role selection (viewer/editor).
- Members list view: show current members with roles and ability to change/revoke (owner only).
- Invites list view: show pending invites with role, invited-by, created-at, and revoke/edit role (owner only).
- Non-owner view: read-only roster or no access to sharing UI (decision needed).
- Notifications/toasts for share actions (invite sent, role updated, removed, invite accepted).
- Empty/edge states (no members beyond owner, no pending invites, invite already accepted).

## Lease UI Design Requirements
- Branch name must remain readable; lease indicators and actions cannot obscure it.
- Lease status should be visible at a glance without crowding the branch row.
- Release action should be discoverable but visually secondary to branch navigation.
- Locked state should communicate who holds the lease when available (decision on display).
- Lease controls move from rail to chat header area (near main branch/merge buttons), likely via a settings popover that also includes rename/pin/hide.

## Risks and Potential Gotchas
- Lease session not initialized when user acts (race on page load).
- Background edit queue missing lease session and failing silently.
- Autosave timers writing to the wrong branch if ref/content not snapshotted.
- Branch switch without save can lose edits or conflict with leases.
- Non-owner access to /members returning 500 instead of 403 if authz is only in RPC.
- Invite acceptance is silent; users may not realize they joined a shared project.
- Lease UI crowding can obscure branch names and reduce discoverability.

## Completeness Check (Potential Gaps)
- Owner authz at API layer for sharing routes (avoid 500s on forbidden).
- Lease requirements on all write paths, including branch rename and background edit queue.
- Autosave hygiene: snapshot ref + content at timer creation; force save before switch; cancel pending timers.
- Non-PG mode behavior and messaging (explicit errors vs hidden UI).
- Tests for lease-required writes, share flows, and member removal edge cases.

## Discrete Work Chunks (Candidate Issues)
1. Share UI + member management UI (modal, members/invites list, role edits, revoke).
2. Lease enforcement coverage across all write paths (chat/edit/edit-stream/merge/artefact/branch rename).
3. Lease UI redesign for branch list (placement, readability, lock/owner indicator).
4. Autosave hygiene + branch switch save (already in Issue 322).
5. API authz ergonomics (owner checks + error handling for /members; consistent 403s).
6. Invite acceptance UX (silent vs surfaced confirmation/toast).
7. Testing suite updates for leases + collaboration (client + server + PG store).

## Plan (Phased, Independently Mergeable)
### Stage 1 - Spec + UX alignment (no code)
- Finalize decisions for every write path and sharing UI visibility.
- Lock down lease UI design and placement in branch list.
- Decide autosave + branch switch policy (Issue 322 already).

### Stage 2 - Backend scaffolding (safe to merge)
- Add migrations/RPCs and read-only APIs (no lease enforcement yet).
- Add API-layer authz checks returning 403s for non-owners on /members.
- Add tests for new RPCs and read-only endpoints.
- Smoke test: invite list and member list endpoints return data for owners.

### Stage 3 - Client sharing UI (safe to merge)
- Implement share entry point + share modal + members/invites list UI.
- Hook up to /members endpoints with owner-only access.
- Add toasts and empty states.
- Smoke test: owner can invite, update role, revoke invite/member.

### Stage 4 - Lease enforcement + UX (merge with client changes)
- Enforce lease session on all write paths (chat/edit/edit-stream/merge/artefact/branch rename).
- Add lease UI redesign (Editing/Locked indicators + release action placement).
- Implement autosave snapshot + forced save before branch switch (Issue 322).
- Smoke test: locked branch prevents write; lease holder can write and release.

### Stage 5 - QA + Hardening
- Update tests for lease enforcement, collaboration flows, background edits.
- Validate cross-branch behavior, background edits, invite acceptance UX.
