## FRs

### FR-001 Waitlist via access code [migrated]
name: Waitlist via access code
status: open
description: |
  Add an "apply with access code" route so users can request access using limited-use codes (e.g., 5 uses per code).
assignee:
labels: enhancement, server

### FR-002 Loading indicator for actions [migrated]
name: Loading indicator for actions
status: closed (complete)
description: |
  Add spinner or loading text to show requests are running after navigation or form submit. Context-dependent spinner/visual indicator in place.
assignee:
labels: enhancement, ui

### FR-003 Onboarding modal when no API token saved [migrated]
name: Onboarding modal when no API token saved
status: closed (complete)
description: |
  If a user has not saved at least one API token, show a homepage modal with a button that routes to profile.
assignee:
labels: enhancement, ui

### FR-004 Define new user state for onboarding [migrated]
name: Define new user state for onboarding
status: closed (complete)
description: |
  Treat users who have not successfully sent at least one message as "new user" for onboarding.
assignee:
labels: enhancement, ui

### FR-005 Session tips modal pre-expanded for new users [migrated]
name: Session tips modal pre-expanded for new users
status: closed (complete)
description: |
  Show session tips modal pre-expanded for new users on projects page.
assignee:
labels: enhancement, ui

### FR-006 Detailed onboarding flow after session tips [migrated]
name: Detailed onboarding flow after session tips
status: open
description: |
  Add a deeper onboarding flow after closing session tips to walk through branching, merging, graph, and canvas.
assignee:
labels: enhancement, ui

### FR-007 Home rail empty state message [migrated]
name: Home rail empty state message
status: closed (complete)
description: |
  Show a low-key "no projects yet" message under Recent when empty. HomePageContent renders "No workspaces yet.." when list is empty.
assignee:
labels: enhancement, ui

### FR-008 Cmd-B toggles rail [migrated]
name: Cmd-B toggles rail
status: closed (complete)
description: |
  Add cmd-B hotkey to toggle rail expand/collapse.
assignee:
labels: enhancement, ui

### FR-009 Home rail archive collapsed by default + scroll [migrated]
name: Home rail archive collapsed by default + scroll
status: open
description: |
  Archive section should be collapsed by default; both archive and recent sections should scroll when full.
assignee:
labels: enhancement, ui

### FR-010 Project create spinner [migrated]
name: Project create spinner
status: closed (complete)
description: |
  Add spinner after clicking create project. Create button shows "Creating.." while request is in flight.
assignee:
labels: enhancement, ui

### FR-011 Render assistant markdown [migrated]
name: Render assistant markdown
status: closed (complete)
description: |
  Render assistant messages as markdown. Assistant bubble uses ReactMarkdown + remark-gfm.
assignee:
labels: enhancement, ui

### FR-012 Web search toggle in chat [migrated]
name: Web search toggle in chat
status: closed (complete)
description: |
  Add search toggle near chat input to route requests through provider web search, with OpenAI search-preview note.
assignee:
labels: enhancement, ui

### FR-013 Render OpenAI Responses citations [migrated]
name: Render OpenAI Responses citations
status: open
description: |
  Render citations by parsing message.content[].annotations from raw response events (or include web_search_call.action.sources).
assignee:
labels: enhancement, ui

### FR-014 Store thinking traces in context [migrated]
name: Store thinking traces in context
status: open
description: |
  Store thinking traces and include in context across providers (best-effort due to differences).
assignee:
labels: enhancement, server

### FR-015 Replace edit icon with branch icon [migrated]
name: Replace edit icon with branch icon
status: closed (complete)
description: |
  Replace edit pencil with new branch icon on message.
assignee:
labels: enhancement, ui

### FR-016 Chat auto-scroll on new message [migrated]
name: Chat auto-scroll on new message
status: closed (complete)
description: |
  Auto-scroll chat to bottom when messages are added. Scrolls when visibleNodes length increases.
assignee:
labels: enhancement, ui

### FR-017 Composer hint fades when draft non-empty [migrated]
name: Composer hint fades when draft non-empty
status: closed (complete)
description: |
  Fade composer hint to 10% opacity when input has content.
assignee:
labels: enhancement, ui

### FR-018 Streaming auto-scroll pause/resume [migrated]
name: Streaming auto-scroll pause/resume
status: closed (complete)
description: |
  Stop auto-scroll when user scrolls away, resume near bottom. Follow breaks on user scroll and resumes at threshold.
assignee:
labels: enhancement, ui

### FR-019 Thinking bar width alignment [migrated]
name: Thinking bar width alignment
status: closed (complete)
description: |
  Thinking bar should not exceed user bubble max width; aligns with shared history bar and shrinks when squashed.
assignee:
labels: enhancement, ui

### FR-020 Thinking box renders markdown [migrated]
name: Thinking box renders markdown
status: closed (complete)
description: |
  Render thinking box text as markdown.
assignee:
labels: enhancement, ui

### FR-021 Branch button mirrors provider/thinking selectors [migrated]
name: Branch button mirrors provider/thinking selectors
status: closed (complete)
description: |
  Branch button should mirror provider/thinking selections from current branch. Rail + popover mirror current branch selections.
assignee:
labels: enhancement, ui

### FR-022 Branch button parity (duplicate entry) [migrated]
name: Branch button parity (duplicate entry)
status: closed (complete)
description: |
  Duplicate of branch button parity item: mirror provider/thinking selections. Keeping separate for traceability.
assignee:
labels: enhancement, ui

### FR-023 Branch from assistant message [migrated]
name: Branch from assistant message
status: closed (complete)
description: |
  Allow user to branch from an assistant message.
assignee:
labels: enhancement, ui

### FR-024 Assistant-message branch flow mirrors branch button [migrated]
name: Assistant-message branch flow mirrors branch button
status: closed (complete)
description: |
  Branching from assistant should use the same UI/flow as the bottom-right branch button, branching after the assistant and nulling next user message.
assignee:
labels: enhancement, ui

### FR-025 Retrospective branching (move to branch) [migrated]
name: Retrospective branching (move to branch)
status: open
description: |
  Allow moving downstream nodes to a new branch after realizing a user follow-up is a tangent.
assignee:
labels: enhancement, ui

### FR-026 Merge modal provider/thinking selectors [migrated]
name: Merge modal provider/thinking selectors
status: closed (complete)
description: |
  Merge modal should include Provider and Thinking selectors for merge-assist actions. Currently modal only has summary + payload picker.
assignee:
labels: enhancement, ui

### FR-027 Merge summary required [migrated]
name: Merge summary required
status: closed (complete)
description: |
  Keep merge summary required, editable, and block merge if empty.
assignee:
labels: enhancement, ui

### FR-028 Generate merge summary helper [migrated]
name: Generate merge summary helper
status: open
description: |
  Add "Generate summary" helper calling POST /api/projects/[id]/merge/suggest-summary using assistant payload + canvas snapshots; fill merge summary input.
assignee:
labels: enhancement, server, ui

### FR-029 LLM can edit canvas via tools [migrated]
name: LLM can edit canvas via tools
status: open
description: |
  Provide tools for LLM agents to edit the canvas. Currently only includes canvas in system prompt without tool pathway.
assignee:
labels: enhancement, server

### FR-030 Streaming tool use for canvas tools [migrated]
name: Streaming tool use for canvas tools
status: open
description: |
  Add streaming tool-use support for LLM canvas tools once tool calls are stable; see streaming tool loop plan.
assignee:
labels: enhancement, server

### FR-031 Graph branch labels [migrated]
name: Graph branch labels
status: closed (complete)
description: |
  Add branch labels on graph view.
assignee:
labels: enhancement, ui

### FR-032 Graph autoscroll to current [migrated]
name: Graph autoscroll to current
status: closed (complete)
description: |
  Graph should autoscroll to current position at 1/4 height from bottom.
assignee:
labels: enhancement, ui

### FR-033 Current node inside pill [migrated]
name: Current node inside pill
status: closed (complete)
description: |
  Place current node inside a pill instead of separate UI pill.
assignee:
labels: enhancement, ui

### FR-034 Cmd-click graph node navigates [migrated]
name: Cmd-click graph node navigates
status: closed (complete)
description: |
  Cmd-click a graph node navigates to branch/message and adds note to session tips.
assignee:
labels: enhancement, ui

### FR-035 User profile page with secure key storage [migrated]
name: User profile page with secure key storage
status: closed (complete)
description: |
  MVP profile page shows email and 3 provider key fields; store keys securely using Supabase Vault. Partial: profile page + token storage exist; no change-password flow found in note.
assignee:
labels: enhancement, ui, server

### FR-036 Password change flow [migrated]
name: Password change flow
status: closed (complete)
description: |
  Add password change flow in profile posting to /api/profile/password and supabase.auth.updateUser.
assignee:
labels: enhancement, ui, server

### FR-037 Dev DB branch setup [migrated]
name: Dev DB branch setup
status: closed (complete)
description: |
  Set up the dev DB branch (no-op).
assignee:
labels: enhancement, database

### FR-038 Node-environment server route tests [migrated]
name: Node-environment server route tests
status: open
description: |
  Add Node-environment test suite for server routes; see PM_DOCS/NODE_TESTS.md.
assignee:
labels: enhancement, server

### FR-039 Playwright E2E smoke tests [migrated]
name: Playwright E2E smoke tests
status: open
description: |
  Add Playwright E2E smoke test coverage; see PM_DOCS/E2E_TESTING.md.
assignee:
labels: enhancement, ui

### FR-040 Store provider keys in macOS Keychain (desktop) [migrated]
name: Store provider keys in macOS Keychain (desktop)
status: open
description: |
  Store provider keys in macOS Keychain instead of local PG vault using Electron IPC + native keychain bridge.
assignee:
labels: enhancement, server

### FR-041 Hide password change section in desktop env [migrated]
name: Hide password change section in desktop env
status: closed (complete)
description: |
  Hide password change profile section when running in desktop env.
assignee:
labels: enhancement, ui

## BUGS

### BUG-001 Desktop/local PG mode missing .env.local [migrated]
name: Desktop/local PG mode missing .env.local
status: open
description: |
  In desktop/local PG mode, app routes to /login or throws Supabase env errors when.env.local is missing because pages/API routes still call createSupabaseServerClient, bypassing local auth failsafe.
assignee:
labels: bug, server

### BUG-002 Duplicate rawResponse storage in PG [migrated]
name: Duplicate rawResponse storage in PG
status: open
description: |
  rawResponse duplicated in PG (nodes.content_json and nodes.raw_response); consider de-dupe and a history projection to keep UI payloads small.
assignee:
labels: bug, database

### BUG-003 Next.js Edge runtime warnings in middleware [migrated]
name: Next.js Edge runtime warnings in middleware
status: open
description: |
  Edge runtime warning from middleware.ts importing Supabase SSR (uses Node APIs). App deploys on Node so runtime OK; warning persists until middleware avoids Supabase or auth gating moves to Node routes.
assignee:
labels: bug, server

### BUG-004 Registration with existing email shows no feedback [migrated]
name: Registration with existing email shows no feedback
status: closed (complete)
description: |
  If a user attempts to create an account with an email already registered, UI hits a dead end with no feedback.
assignee:
labels: bug, ui

### BUG-005 Confirm email link routes to existing user view [migrated]
name: Confirm email link routes to existing user view
status: open
description: |
  When user clicks confirm email link, send them to existing user view.
assignee:
labels: bug, ui

### BUG-006 Password reset link routes to registration view [migrated]
name: Password reset link routes to registration view
status: open
description: |
  Password reset email link takes user to new user registration view; should route to reset flow.
assignee:
labels: bug, ui

### BUG-007 Returning user lands on sign-in view [migrated]
name: Returning user lands on sign-in view
status: open
description: |
  Returning users with expired/cancelled cookie should land on sign-in view, not new user view.
assignee:
labels: bug, ui

### BUG-008 Block non-compliant password submissions [migrated]
name: Block non-compliant password submissions
status: open
description: |
  Block registration when password is non-compliant; clarify whether Supabase returns error and enforce in UI.
assignee:
labels: bug, ui

### BUG-009 Allow magic link sign-in [migrated]
name: Allow magic link sign-in
status: open
description: |
  Support magic link sign-in.
assignee:
labels: bug, server

### BUG-010 Home rail misses new workspaces on load [migrated]
name: Home rail misses new workspaces on load
status: closed (complete)
description: |
  Home rail does not always pick up new workspaces on load; likely Next router cache on back nav without refresh.
assignee:
labels: bug, ui

### BUG-011 Main branch provider selection on new project [migrated]
name: Main branch provider selection on new project
status: closed (complete)
description: |
  Models pinned to branches prevent choosing provider for main/trunk when creating a project. Checked as fixed.
assignee:
labels: bug, ui

### BUG-012 Rail flicker on page load [migrated]
name: Rail flicker on page load
status: open
description: |
  On page load (home/workspace) rail renders open then closes, causing flicker.
assignee:
labels: bug, ui

### BUG-013 Home recent list should scroll after Archive flex [migrated]
name: Home recent list should scroll after Archive flex
status: closed (complete)
description: |
  Recent list must scroll after flexing into Archive section; was forcing content off page.
assignee:
labels: bug, ui

### BUG-014 Home archive pushes user button off page [migrated]
name: Home archive pushes user button off page
status: closed (complete)
description: |
  Archive section expansion pushes user button off bottom of page.
assignee:
labels: bug, ui

### BUG-015 Home archive disappears off bottom when expanded [migrated]
name: Home archive disappears off bottom when expanded
status: closed (complete)
description: |
  Archive content disappears off bottom when expanded.
assignee:
labels: bug, ui

### BUG-016 Workspace UI naming mismatch (main vs trunk) [migrated]
name: Workspace UI naming mismatch (main vs trunk)
status: closed (complete)
description: |
  Workspace UI sometimes refers to main, sometimes trunk.
assignee:
labels: bug, ui

### BUG-017 Rail toggle button jitters vertically [migrated]
name: Rail toggle button jitters vertically
status: closed (complete)
description: |
  Rail toggle jitters when navigating between home/workspace. Set top rail bar to shrink-0.
assignee:
labels: bug, ui

### BUG-018 Rail branch creation inherits incomplete messages [migrated]
name: Rail branch creation inherits incomplete messages
status: closed (complete)
description: |
  Branching via rail yields incomplete inherited messages. In PG, copy commit_order ancestry via rtCreateRefFromRefShadowV1.
assignee:
labels: bug, database

### BUG-019 Chat inherited messages incomplete (general) [migrated]
name: Chat inherited messages incomplete (general)
status: closed (complete)
description: |
  Inherited messages incomplete in general; fixed by rt_rebuild_commit_order_v1 migration and reads joining through commit_order.
assignee:
labels: bug, database

### BUG-020 User message should render immediately on send [migrated]
name: User message should render immediately on send
status: closed (complete)
description: |
  UI waited for assistant message; should render user message immediately. Use optimistic user node + streaming preview in WorkspaceClient.
assignee:
labels: bug, ui

### BUG-021 Assistant message width too narrow [migrated]
name: Assistant message width too narrow
status: closed (complete)
description: |
  Assistant messages not taking up expected width. Use assistant bubbles use w-full max-w-[85%].
assignee:
labels: bug, ui

### BUG-022 Non-stream tool loop drops thinking blocks [migrated]
name: Non-stream tool loop drops thinking blocks
status: open
description: |
  Non-stream tool loop responses can drop thinking blocks (Anthropic content arrays not parsed). Anthropic parser added; check OpenAI/OpenAI Responses parity if thinking content applies.
assignee:
labels: bug, server

### BUG-023 Scroll-to-bottom blinks after sending message [migrated]
name: Scroll-to-bottom blinks after sending message
status: open
description: |
  After sending a message, scroll-to-bottom briefly includes optimistic user + pending assistant, then blinks and scrolls back up.
assignee:
labels: bug, ui

### BUG-024 Assistant branch indicator color uses master [migrated]
name: Assistant branch indicator color uses master
status: open
description: |
  Assistant message branch indicator stripe initially uses master branch color (black) after sending a new message.
assignee:
labels: bug, ui

### BUG-025 Shared-count history fetches query all branches [migrated]
name: Shared-count history fetches query all branches
status: closed (not planned)
description: |
  Optimization: shared-count history fetches query all branches; could limit to trunk path or merge-base.
assignee:
labels: bug, server

### BUG-026 Provider quota errors show generic message [migrated]
name: Provider quota errors show generic message
status: closed (complete)
description: |
  If provider quota issue occurs, UI shows generic error. Detect provider response and show clear user-facing error.
assignee:
labels: bug, server

### BUG-027 Missing API token should show clear error [migrated]
name: Missing API token should show clear error
status: closed (complete)
description: |
  If user tries a provider without an API token, show clear user-facing error.
assignee:
labels: bug, server

### BUG-028 Excess horizontal padding around chat/graph container [migrated]
name: Excess horizontal padding around chat/graph container
status: closed (complete)
description: |
  Excess horizontal padding around chat/graph container.
assignee:
labels: bug, ui

### BUG-029 Gemini replies stream thinking content into chat view [migrated]
name: Gemini replies stream thinking content into chat view
status: open
description: |
  Gemini replies initially stream thinking content into chat view; after completion, thinking is only in thinking box. Initial state is a bug.
assignee:
labels: bug, ui

### BUG-030 Default thinking bar width overlaps user box [migrated]
name: Default thinking bar width overlaps user box
status: closed (complete)
description: |
  Default thinking bar width should meet default user message box; was overlapping.
assignee:
labels: bug, ui

### BUG-031 Thinking bar and shared bar width should match [migrated]
name: Thinking bar and shared bar width should match
status: closed (complete)
description: |
  Default thinking bar and shared message bar should be same width and flex together on resize.
assignee:
labels: bug, ui

### BUG-032 Toggling rail triggers auth request [migrated]
name: Toggling rail triggers auth request
status: closed (complete)
description: |
  Toggling rail fires auth request. Keep AuthRailStatus mounted across rail toggles.
assignee:
labels: bug, server

### BUG-033 Pinning branch feels laggy [migrated]
name: Pinning branch feels laggy
status: closed (complete)
description: |
  Pinning a branch triggers request/spinner; should match star behavior. Use optimistic pin + per-button pending indicator.
assignee:
labels: bug, ui

### BUG-034 LLM config pinned to branch [migrated]
name: LLM config pinned to branch
status: closed (complete)
description: |
  LLM config should be pinned to branch. (provider/thinking persisted per projectId + branchName).
assignee:
labels: bug, ui

### BUG-035 Merge summary injection not signaled [migrated]
name: Merge summary injection not signaled
status: closed (complete)
description: |
  Merge modal summary is injected into context but not signaled to user. Use modal explicitly states summary is injected.
assignee:
labels: bug, ui

### BUG-036 Merge nodes tagged as developer role [migrated]
name: Merge nodes tagged as developer role
status: closed (complete)
description: |
  Merge node content tagged as "developer" role; only user or assistant should be used.
assignee:
labels: bug, server

### BUG-037 Graph reloads on each toggle [migrated]
name: Graph reloads on each toggle
status: closed (complete)
description: |
  Graph reloads each time the graph toggle is selected. Use cached graph histories and only refetch when branch list changes.
assignee:
labels: bug, ui

### BUG-038 Starred graph bounce on unstar [migrated]
name: Starred graph bounce on unstar
status: closed (complete)
description: |
  Graph bounces when starring/unstarring messages; likely fixed with optimistic stars + stable starredNodeIds key + update guard.
assignee:
labels: bug, ui
