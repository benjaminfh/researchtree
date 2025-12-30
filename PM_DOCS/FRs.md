# LOGIN / REGISTRATION
[ ] [waitlist via code] Right now a user has to apply to be whitelisted. We should also have a "apply with access code" route. I can supply some people with N-time access code. N can probably be 5 to limit chaos but to allow people to share if they want. 

# OVERALL
[x] We need a spinner or "loading text" visual indicator rectangles to indicate to the user that requests are still running after an action (navigation, form submit etc). It is context dependent whether it should be a spinner or other visual.

# HOME PAGE
## ONBOARDING
[x] if the user has not saved as least one API token successfully, we should prompt them with a modal on homepage - message + one button, which should take them to the profile page
[x] new user: if the user has not yet successfully sent at least one message, they are a "new user" for onboarding purposes.
[x] new users should be presented with the session tips modal pre-expanded when they land on the projects page
[ ] we need a more detailed onboarding flow that follows from closing the session tips modal and walks through branching, merging, the graphs, the canvas etc - TBD...
 
## RAIL
[x] when there are no projects, there should be a low key message under "recent" explaining there are no projects yet [Done - `HomePageContent` renders “No workspaces yet…” when list is empty]
[x] add cmd-B as hot key to toggle rail expand/collapse
[ ] On the home page rail, the archived section should be collapsed by default (contents hidden). Both archive and recent sections should scroll when full.

## MAIN FRAME
[x] when creating a project (after clicking create) we need a spinner to communicate to the user that the click was received and things are happening in the background [Done - create button shows “Creating…” spinner while request is in flight]

# PROJECTS PAGE
## CHAT
[x] [markdown rendering] assistant messages should render as markdown [Done - assistant bubble uses `ReactMarkdown` + `remark-gfm`]
[x] [web search mode] Add a Search toggle near the chat input that routes requests through provider web search when enabled. Show a subtle note when OpenAI is selected to indicate the model is forced to the search-preview variant.
[ ] [web search citations] Render OpenAI Responses citations by parsing `message.content[].annotations` from the raw response events (or add `include: ["web_search_call.action.sources"]` to capture sources).
[?] [Thinkin traces] currently we don't store thinking traces or bake them into the context. This pattern varies across all three providers - we need best efforts.
[x] Replace edit icon on message: pencil to new branch icon

 
### Messages
[x] when any message is added, the chat container should auto scroll to the bottom [Done - message list scrolls to bottom when `visibleNodes.length` increases]
[x] Composer hint should fade to 10% opacity once the draft is non-empty. [Done - hint opacity drops when input has content]
[x] Streaming autoscroll should stop when the user scrolls away, and resume when they return near the bottom. [Done - follow breaks on user scroll, resumes at threshold]
[ ] thinking bar in the chat window should not extend beyond the user chat bubble max width; default width aligns with shared history bar (slightly wider than current); both shrink when squashed

### Branch

[x] [model selection] we currently allow the user to select a branch when branching via edit message button. The branch button at the bottom of the chat is not at parity. need to mirror the provider and thinking mode selectors (they should mirror current branch selections.) [Done - new branch UI now mirrors current branch provider/thinking selections in rail + popover]
[x] [model selection] we currently allow the user to select a branch when branching via edit message button. The branch button at the bottom of the chat is not at parity. need to mirror the provider and thinking mode selectors (they should mirror current branch selections.) 
[x] allow user to branch from assistant message
[x] branching from assistant message flow: should be the same flow/ui as dedicated branch button (bottom right) since the branch happens "after" the assistant message, *at* the user message. In this specific flow, we assume the following user message is nulled and will be defined on the new branch chat. (We could even simply expand that existing branch modal on assistant message branch click?)

### Merge
[x] [descoped] Merge modal includes **Provider** and **Thinking** selectors used for merge-assist actions (kept independent from the main chat composer settings). [Open - merge modal only has summary + payload picker; no independent provider/thinking inputs]
[x] Merge summary remains **required** for completing a merge; user can always type/edit it manually. [Done - merge is blocked if `mergeSummary.trim()` is empty]
[ ] Optional helper: “Generate summary” calls `POST /api/projects/[id]/merge/suggest-summary` with the selected assistant payload + source/target Canvas snapshots and fills the merge summary input with the generated text. [Open - no `merge/suggest-summary` route exists]

## Canvas
[...] LLM Agent has no way to edit the canvas currently - we need to give it tools [Open - system prompt includes canvas content, but no tool/function pathway for the model to write canvas updates]
[ ] [streaming tool use] LLM canvas tools currently run via non-streamed tool loop; add streaming tool-use support once tool calls are stable across providers [Planned - use streamed tool_call/tool_use events to preserve chat UX]
    - Plan: `PM_DOCS/STREAMING_TOOL_LOOPS_PLAN.md`

## Graph
[x] branch labels on graph view
[x] graph should autoscroll to posistion "current" at 1/4 height (from bottom)
[x] rather than "current" UI pill, simply place "current" node inside a pill
[x] cmd-click on a graph node navigates page to branch/message (+ add note to session tips)

# USER PROFILE
[x] [User profile] A user profile page. MVP shows registered email, plus 3 fields for LLM provider keys. We must store these keys securely using supabase vault!! [Partial - profile page + token storage via Supabase Vault exists; no change-password flow found]
[x] [Password change] User profile - change password flow [Done - profile UI posts to `/api/profile/password` which calls `supabase.auth.updateUser({ password })`]

# DB
[x] need to setup the dev db branch (no-op)

# TESTING
[ ] Add a Node-environment test suite for server routes (see `PM_DOCS/NODE_TESTS.md`).
[ ] Add Playwright E2E smoke test coverage (see `PM_DOCS/E2E_TESTING.md`).

# DESKTOP
[ ] Store LLM provider keys in macOS Keychain instead of local PG vault (use Electron IPC + native keychain bridge).
[x] Hide password change profile section when we are in desktop env
