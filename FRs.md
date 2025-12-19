# HOME PAGE
## RAIL
[ ] when there are no projects, there should be a low key message under "recent" explaining there are no projects yet

## MAIN FRAME
[ ] when creating a project (after clicking create) we need a spinner to communicate to the user that the click was received and things are happening in the background

# PROJECTS PAGE
## CHAT

### Messages

[ ] when any message is added, the chat container should auto scroll to the bottom

### Branch

### Merge

- Merge modal includes **Provider** and **Thinking** selectors used for merge-assist actions (kept independent from the main chat composer settings).
- Merge summary remains **required** for completing a merge; user can always type/edit it manually.
- Optional helper: “Generate summary” calls `POST /api/projects/[id]/merge/suggest-summary` with the selected assistant payload + source/target Canvas snapshots and fills the merge summary input with the generated text.

## Canvas
[ ] LLM Agent has no way to edit the canvas currently - we need to give it tools