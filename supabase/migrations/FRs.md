# CHAT
## Branch

## Merge

- Merge modal includes **Provider** and **Thinking** selectors used for merge-assist actions (kept independent from the main chat composer settings).
- Merge summary remains **required** for completing a merge; user can always type/edit it manually.
- Optional helper: “Generate summary” calls `POST /api/projects/[id]/merge/suggest-summary` with the selected assistant payload + source/target Canvas snapshots and fills the merge summary input with the generated text.
