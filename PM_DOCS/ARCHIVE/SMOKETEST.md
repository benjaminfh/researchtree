# Smoke Test: `RT_STORE=pg` (Supabase Provenance)

This is a manual end-to-end sanity check that Postgres-backed provenance is working with **no git fallback**.

## Prereqs

- Supabase project is configured and migrations applied.
- `.env.local` contains working Supabase keys:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- You can sign in successfully via the app login UI.

## Setup

1. Set `RT_STORE=pg` in `.env.local`.
2. Start the app: `npm run dev`
3. Sign in.

## Run (PG mode)

### A) Project creation + load

1. From `/`, create a new workspace.
2. You should be redirected to `/projects/<new-id>`.

Expected:
- Workspace loads successfully (no 404/500).
- History/graph/canvas panels load without errors.

### B) Chat (append nodes)

1. Send a user message.
2. Wait for assistant response to complete.

Expected:
- Two new message nodes appear (user then assistant), in order.
- Refreshing the page shows the same messages (persisted).

### C) Stars

1. Star one message.
2. Unstar it.

Expected:
- UI reflects starred state immediately.
- No API errors; starred list persists across refresh.

### D) Branching + switching

1. Create a branch (from main).
2. Switch between `main` and the new branch.

Expected:
- Branch list updates; the “current” branch changes.
- History reflects the selected branch.

### E) Edit flow (branch from a node + optional LLM)

1. Click “edit” on an existing message node.
2. Confirm edit to create an edit branch.
3. If the edited node is a **user** message, confirm it triggers an LLM call.

Expected:
- A new `edit-*` branch is created and selected.
- The edited message is appended on the edit branch.
- If editing a user message: an assistant reply is appended after the edited message.

### F) Merge flow

1. Merge your edit/feature branch into `main`.
2. If the UI supports selecting a payload assistant node for merge, try both:
   - default selection
   - explicitly selecting a payload assistant node

Expected:
- A merge node is appended on the target branch.
- Merge node includes `mergeFrom`, `mergeSummary`, `sourceNodeIds`, and (when applicable) merged assistant payload fields.

### G) Pin canvas diff from merge

1. Select the merge node in the graph.
2. Use “pin canvas diff” (or equivalent).

Expected:
- A new assistant message is appended that contains the diff payload.
- Repeating the action does not create duplicates (returns “already pinned”).

### H) Canvas drafts (no chat spam)

1. Edit the canvas.
2. Wait for autosave to complete.

Expected:
- Canvas content persists across refresh.
- No new chat history nodes appear solely due to canvas autosave.

## Verify “no git touched”

While running the PG smoke test, confirm no on-disk git repo is being created/used:

- Ensure no new folder appears under `data/projects/*` for the new project id.

## Troubleshooting

### “Could not find the function … in the schema cache”

This means the migration defining the RPC wasn’t applied to your Supabase DB, or PostgREST hasn’t reloaded its schema cache.

1. Apply the relevant migration SQL in Supabase (SQL editor).
2. Run: `select pg_notify('pgrst', 'reload schema');`
3. Wait ~30–60 seconds and retry (restart `npm run dev` if needed).

