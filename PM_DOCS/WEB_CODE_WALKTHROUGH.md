# Web App Code Walkthrough (File-by-File)

Date: 2026-02-01

## Scope and exclusions
- Scope: Web app (`app/`, `src/`) with Postgres/Supabase + local PG adapters.
- Exclusions: `desktop/`, `src/git/**`, `tests/**`, `node_modules/`, and other ignored or vendor files.
- Notes: Some files include git-backed fallbacks; those paths are intentionally not described here.

## Next.js app routes and pages
- `app/layout.tsx`: Root HTML layout and global metadata; imports `app/globals.css`.
- `app/globals.css`: Global Tailwind + custom styles for the web UI.
- `app/loading.tsx`: Default loading shell (spinner + label).
- `app/page.tsx`: Home dashboard; loads projects (PG) and provider options, renders `HomePageContent`.
- `app/projects/[id]/page.tsx`: Workspace page; loads project + branches and renders `WorkspaceClient`.

## Auth + account pages
- `app/login/page.tsx`: Login/signup page with waitlist awareness and query param sanitation.
- `app/login/LoginForm.tsx`: Sign in / sign up UI; handles password visibility and error states.
- `app/login/actions.ts`: Server actions for sign in, sign up, and sign out; integrates waitlist + Supabase.
- `app/forgot-password/page.tsx`: Password reset request page.
- `app/forgot-password/ForgotPasswordForm.tsx`: Reset email form with Cmd+Enter submit.
- `app/forgot-password/actions.ts`: Server action to request password reset via Supabase.
- `app/reset-password/page.tsx`: Password reset form page.
- `app/reset-password/ResetPasswordForm.tsx`: Password update form with policy validation and Cmd+Enter submit.
- `app/reset-password/actions.ts`: Server action to update password post recovery.
- `app/check-email/page.tsx`: Confirmation screen for signup or reset flows.
- `app/profile/page.tsx`: Server-rendered profile page; requires auth and mounts `ProfilePageClient`.

## Waitlist and admin
- `app/waitlist/page.tsx`: Waitlist request and access code application screen.
- `app/waitlist/WaitlistSubmitButton.tsx`: Reusable submit button with pending state.
- `app/waitlist/actions.ts`: Server actions to request access or redeem access codes.
- `app/admin/waitlist/page.tsx`: Admin dashboard for waitlist approvals.
- `app/admin/waitlist/actions.ts`: Server actions for approve/remove allowlist.
- `app/admin/waitlist/ApproveEmailForm.tsx`: Admin approval form with inline feedback.
- `app/admin/waitlist/AdminSubmitButton.tsx`: Admin submit button with pending state.

## Auth routes
- `app/auth/callback/route.ts`: Supabase auth code exchange and redirect handling.
- `app/auth/invite/route.ts`: Accept workspace invite and redirect to project.
- `app/auth/signout/route.ts`: POST handler to sign out and redirect to login.

## API routes (web app)
- `app/api/auth/me/route.ts`: Returns current user (id + email).
- `app/api/health/route.ts`: Health check for PG mode; bootstraps local PG if needed.
- `app/api/profile/route.ts`: Read/write LLM tokens; accepts invite links; enforces auth.
- `app/api/profile/llm-keys/route.ts`: Server-side check for token readability.
- `app/api/profile/password/route.ts`: Authenticated password change with origin check.
- `app/api/projects/route.ts`: List/create projects (PG-only path documented).
- `app/api/projects/[id]/branches/route.ts`: List branches, create branch, switch branch.
- `app/api/projects/[id]/branches/[refId]/route.ts`: Rename branch (lease-aware in PG).
- `app/api/projects/[id]/branches/[refId]/pin/route.ts`: Pin a branch.
- `app/api/projects/[id]/branches/pin/route.ts`: Clear pinned branch.
- `app/api/projects/[id]/branches/[refId]/visibility/route.ts`: Hide/unhide a branch.
- `app/api/projects/[id]/history/route.ts`: Read branch history (filters hidden/merge ack nodes).
- `app/api/projects/[id]/graph/route.ts`: Build graph payload + branch histories + stars.
- `app/api/projects/[id]/artefact/route.ts`: Read/update canvas (draft) content.
- `app/api/projects/[id]/chat/route.ts`: Stream chat completions; handles canvas tools + leases.
- `app/api/projects/[id]/interrupt/route.ts`: Abort active stream for a branch.
- `app/api/projects/[id]/edit/route.ts`: Edit a message (non-streamed); creates a branch.
- `app/api/projects/[id]/edit-stream/route.ts`: Edit message (streamed) with NDJSON output.
- `app/api/projects/[id]/branch-question/route.ts`: Create a question branch and stream chat.
- `app/api/projects/[id]/merge/route.ts`: Merge source → target with summary, diff, and auto-ack.
- `app/api/projects/[id]/merge/pin-canvas-diff/route.ts`: Pin merge canvas diff as a message.
- `app/api/projects/[id]/members/route.ts`: Manage collaborators and invites (PG-only).
- `app/api/projects/[id]/leases/route.ts`: Acquire/release branch leases (PG-only).
- `app/api/projects/[id]/stars/route.ts`: Toggle and list starred nodes.

## Layout and navigation components
- `src/components/layout/RailLayout.tsx`: Base rail layout with collapse state and Cmd+B toggle.
- `src/components/layout/RailPageLayout.tsx`: Rail layout variant for full-height pages.
- `src/components/layout/RailShell.tsx`: Layout wrapper with auth status and home shortcut.
- `src/components/layout/RailPopover.tsx`: Popover anchored to rail buttons with viewport-aware positioning.

## Auth and profile components
- `src/components/auth/AuthRailStatus.tsx`: Rail account menu with profile link and sign-out confirmation.
- `src/components/auth/AuthStatusPill.tsx`: Server-side auth indicator (optional badge).
- `src/components/profile/ProfilePageClient.tsx`: Token management + password change UI.

## Home and project components
- `src/components/home/HomePageContent.tsx`: Home page UI (create workspace, recent/archived list).
- `src/components/projects/CreateProjectForm.tsx`: Workspace creation form (provider selection + redirects).
- `src/components/projects/ProjectsList.tsx`: Archived/active project list display (not used on home).

## Workspace UI components
- `src/components/workspace/WorkspaceClient.tsx`: Main workspace UI; orchestrates chat, branches, graph, canvas, merges, invites, and leases.
- `src/components/workspace/WorkspaceGraph.tsx`: React Flow graph for branch history visualization.
- `src/components/workspace/NewBranchFormCard.tsx`: Reusable “new branch” form card.
- `src/components/workspace/InsightFrame.tsx`: Layout wrapper for right-hand insight panels.
- `src/components/workspace/MarkdownWithCopy.tsx`: Markdown renderer with copyable code blocks.
- `src/components/workspace/branchColors.ts`: Branch color mapping helpers.
- `src/components/workspace/HeroIcons.tsx`: Blueprint-backed icon exports used across workspace UI.
- `src/components/workspace/clipboard.ts`: Clipboard utility for copy actions.

## Forms and UI primitives
- `src/components/forms/CommandEnterForm.tsx`: Form wrapper that submits on Cmd+Enter.
- `src/components/ui/BlueprintIcon.tsx`: Blueprint icon rendering adapter.

## Login visuals
- `src/components/login/BranchingTracesBackground.tsx`: Canvas-based animated background for login page.

## Hooks
- `src/hooks/useCommandEnterSubmit.ts`: Cmd/Ctrl+Enter form submit helper.
- `src/hooks/useProjectData.ts`: SWR hooks for history + artefact data.
- `src/hooks/useChatStream.ts`: NDJSON streaming chat client with interrupt support.
- `src/hooks/useLeaseSession.ts`: Session-scoped lease ID storage.

## Shared domain helpers
- `src/shared/llmProvider.ts`: Provider enum and type.
- `src/shared/llmCapabilities.ts`: Provider models, thinking settings, and validation.
- `src/shared/thinking.ts`: Thinking setting translation helpers.
- `src/shared/thinkingTraces.ts`: Thinking content blocks and serialization helpers.
- `src/shared/chatLimits.ts`: Character limits for chat inputs.
- `src/shared/graph.ts`: Types for graph nodes and views.
- `src/shared/graph/buildGraph.ts`: Constructs graph payloads from branch histories.
- `src/shared/graph/deriveForkParentNodeId.ts`: Finds fork parent for question branches.

## Server-side infrastructure
- `src/server/http.ts`: API error helpers + JSON error response formatting.
- `src/server/storeConfig.ts`: Store mode (`pg` vs `git`) resolver.
- `src/server/pgMode.ts`: PG adapter mode checks (supabase vs local).
- `src/server/localPgConfig.ts`: Local PG connection string helpers.
- `src/server/localPgBootstrap.ts`: Local PG bootstrap and migrations runner.
- `src/server/auth.ts`: Auth helpers (Supabase user + local PG user).
- `src/server/authz.ts`: Project access/owner/editor checks (PG).
- `src/server/admin.ts`: Admin gating via `RT_ADMIN_USER_IDS`.
- `src/server/requestOrigin.ts`: Origin resolution for redirect + invite links.
- `src/server/schemas.ts`: Zod schemas for API payloads.
- `src/server/locks.ts`: In-memory project and ref locks.
- `src/server/leases.ts`: Lease enforcement and TTLs for branch editing.
- `src/server/pgRefs.ts`: Resolve branch names and current refs in PG mode.
- `src/server/stream-registry.ts`: Manages active streaming controllers.
- `src/server/branchConfig.ts`: Per-branch LLM provider/model resolution.
- `src/server/llmConfig.ts`: Provider enablement + model defaults from env.
- `src/server/llmUserKeys.ts`: Reads user tokens from PG vault with error reporting.
- `src/server/providerCapabilities.ts`: Token limit discovery + caching.
- `src/server/context.ts`: Builds chat context from branch history.
- `src/server/llmContentBlocks.ts`: Converts raw responses to content blocks.
- `src/server/geminiThought.ts`: Gemini thought/response parsing helpers.
- `src/server/llmState.ts`: Tracks previous response IDs for OpenAI Responses.
- `src/server/canvasDiff.ts`: Unified diff generator for canvas merges.
- `src/server/canvasTools.ts`: Canvas tool schema + execution in PG mode.
- `src/server/json.ts`: Safe JSON serialization helper.
- `src/server/waitlist.ts`: Waitlist + allowlist workflows.
- `src/server/workspaceInvites.ts`: Invite email composition and Resend delivery.

## Supabase adapters
- `src/server/supabase/env.ts`: Supabase env var access + validation.
- `src/server/supabase/server.ts`: SSR supabase client for server/actions.
- `src/server/supabase/admin.ts`: Service-role supabase client for admin RPCs.
- `src/server/supabase/browser.ts`: Browser client for client-side auth.

## Postgres store (RPC wrappers)
- `src/store/pg/adapter.ts`: Switchable Supabase/local PG RPC adapter.
- `src/store/pg/localAdapter.ts`: Local PG RPC emulation (SQL call builder).
- `src/store/pg/projects.ts`: Project create/read/list RPCs.
- `src/store/pg/reads.ts`: Branch listings, history, canvas reads, stars.
- `src/store/pg/branches.ts`: Branch creation/rename/pin/hide RPCs.
- `src/store/pg/prefs.ts`: Current branch preference reads/writes.
- `src/store/pg/nodes.ts`: Append node + read node content RPCs.
- `src/store/pg/drafts.ts`: Save artefact draft content.
- `src/store/pg/artefacts.ts`: Commit artefact updates.
- `src/store/pg/merge.ts`: Merge RPC wrapper.
- `src/store/pg/leases.ts`: Branch lease RPC wrappers.
- `src/store/pg/stars.ts`: Star toggle RPC wrapper.
- `src/store/pg/refs.ts`: Previous response ID read/write.
- `src/store/pg/members.ts`: Collaboration member/invite RPCs.
- `src/store/pg/userLlmKeys.ts`: User token status + read/write RPCs.

## Configuration and middleware
- `src/config/app.ts`: Global UI constants and storage key helpers.
- `src/config/features.ts`: Feature flags for UI behavior.
- `middleware.ts`: Maintenance mode, auth gating, and Supabase cookie refresh.

## Utilities
- `src/utils/passwordPolicy.ts`: Password policy validation + copy.
- `src/utils/formatDate.ts`: Consistent UTC date formatting.
- `src/utils/ndjsonStream.ts`: NDJSON stream parsing for chat/edit.
