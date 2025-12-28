# LOGIN / REGISTRATION
[ ] [waitlist via code] Right now a user has to apply to be whitelisted. We should also have a "apply with access code" route. I can supply some people with N-time access code. N can probably be 5 to limit chaos but to allow people to share if they want. 

# HOME PAGE
## RAIL
[x] when there are no projects, there should be a low key message under "recent" explaining there are no projects yet [Done - `HomePageContent` renders “No workspaces yet…” when list is empty]

## MAIN FRAME
[x] when creating a project (after clicking create) we need a spinner to communicate to the user that the click was received and things are happening in the background [Done - create button shows “Creating…” spinner while request is in flight]

# PROJECTS PAGE
## CHAT
[x] [markdown rendering] assistant messages should render as markdown [Done - assistant bubble uses `ReactMarkdown` + `remark-gfm`]
[ ] [web search mode] Add a Search toggle near the chat input that routes requests through provider web search when enabled. Show a subtle note when OpenAI is selected to indicate the model is forced to the search-preview variant.
[ ] [web search citations] Render OpenAI Responses citations by parsing `message.content[].annotations` from the raw response events (or add `include: ["web_search_call.action.sources"]` to capture sources).
[ ] [Thinkin traces] currently we don't store thinking traces or bake them into the context. This pattern varies across all three providers - we need best efforts.
 
### Messages
[x] when any message is added, the chat container should auto scroll to the bottom [Done - message list scrolls to bottom when `visibleNodes.length` increases]

### Branch

[x] [model selection] we currently allow the user to select a branch when branching via edit message button. The branch button at the bottom of the chat is not at parity. need to mirror the provider and thinking mode selectors (they should mirror current branch selections.) [Done - new branch UI now mirrors current branch provider/thinking selections in rail + popover]
[ ] [model selection] we currently allow the user to select a branch when branching via edit message button. The branch button at the bottom of the chat is not at parity. need to mirror the provider and thinking mode selectors (they should mirror current branch selections.) 
[ ] allow user to branch from assistant message

### Merge
[x] [descoped] Merge modal includes **Provider** and **Thinking** selectors used for merge-assist actions (kept independent from the main chat composer settings). [Open - merge modal only has summary + payload picker; no independent provider/thinking inputs]
[x] Merge summary remains **required** for completing a merge; user can always type/edit it manually. [Done - merge is blocked if `mergeSummary.trim()` is empty]
[ ] Optional helper: “Generate summary” calls `POST /api/projects/[id]/merge/suggest-summary` with the selected assistant payload + source/target Canvas snapshots and fills the merge summary input with the generated text. [Open - no `merge/suggest-summary` route exists]

## Canvas
[ ] LLM Agent has no way to edit the canvas currently - we need to give it tools [Open - system prompt includes canvas content, but no tool/function pathway for the model to write canvas updates]

## Graph
[ ] branch labels on graph view

# USER PROFILE
[x] [User profile] A user profile page. MVP shows registered email, plus 3 fields for LLM provider keys. We must store these keys securely using supabase vault!! [Partial - profile page + token storage via Supabase Vault exists; no change-password flow found]
[x] [Password change] User profile - change password flow [Done - profile UI posts to `/api/profile/password` which calls `supabase.auth.updateUser({ password })`]

# DB
[ ] need to setup the dev db branch (no-op)
