# HOME PAGE
## RAIL
[x] when there are no projects, there should be a low key message under "recent" explaining there are no projects yet [Done - `HomePageContent` renders “No workspaces yet…” when list is empty]

## MAIN FRAME
[x] when creating a project (after clicking create) we need a spinner to communicate to the user that the click was received and things are happening in the background [Done - create button shows “Creating…” spinner while request is in flight]

# PROJECTS PAGE
## CHAT
[x] [markdown rendering] assistant messages should render as markdown [Done - assistant bubble uses `ReactMarkdown` + `remark-gfm`]
[ ] [web search mode] 

### Messages
[x] when any message is added, the chat container should auto scroll to the bottom [Done - message list scrolls to bottom when `visibleNodes.length` increases]

### Branch
### Merge
[ ] Merge modal includes **Provider** and **Thinking** selectors used for merge-assist actions (kept independent from the main chat composer settings). [Open - merge modal only has summary + payload picker; no independent provider/thinking inputs]
[x] Merge summary remains **required** for completing a merge; user can always type/edit it manually. [Done - merge is blocked if `mergeSummary.trim()` is empty]
[ ] Optional helper: “Generate summary” calls `POST /api/projects/[id]/merge/suggest-summary` with the selected assistant payload + source/target Canvas snapshots and fills the merge summary input with the generated text. [Open - no `merge/suggest-summary` route exists]

## Canvas
[ ] LLM Agent has no way to edit the canvas currently - we need to give it tools [Open - system prompt includes canvas content, but no tool/function pathway for the model to write canvas updates]

# USER PROFILE
[x] [User profile] A user profile page. MVP shows registered email, plus 3 fields for LLM provider keys. We must store these keys securely using supabase vault!! [Partial - profile page + token storage via Supabase Vault exists; no change-password flow found]
[x] [Password change] User profile - change password flow [Done - profile UI posts to `/api/profile/password` which calls `supabase.auth.updateUser({ password })`]
