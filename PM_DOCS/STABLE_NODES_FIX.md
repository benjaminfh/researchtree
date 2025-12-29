# Stable Nodes / History Fetch Thrash — Fix Plan

## Problem Statement
During streaming, the chat UI triggers a rapid cascade of history fetches across multiple branches (e.g., main + test/*). This creates excessive network traffic, layout reflows, and scroll jitter. The issue appears in desktop and web, and likely affects git and PG modes equally.

Observed symptoms:
- Dozens of `GET /api/projects/:id/history?ref=...&limit=...` per second during streaming.
- Streaming UI flicker/jumpiness; scroll feels “locked.”
- Duplicate text during streaming UI (not persisted). This suggests UI/state churn, not server output duplication.

## Root Cause (Current Code Path)
1. `WorkspaceClient` renders a streaming node that updates on every NDJSON chunk.
2. Those updates change the `visibleNodes` array length or content.
3. `sharedCount` effect recomputes shared history by fetching all branch histories, keyed on `stableVisibleNodes`.
4. This effect re-runs on every streaming update, producing repeated requests.

Key files:
- `src/components/workspace/WorkspaceClient.tsx` (sharedCount effect)
- `src/hooks/useProjectData.ts` (history fetch)
- `src/hooks/useChatStream.ts` (NDJSON chunk stream)

## Desired Mental Model
Separate nodes into two classes:
- **Ephemeral streaming node**: live updates during token stream; does not trigger global history recalculations.
- **Persisted node**: only created after completion; drives shared-history updates and any cross-branch analysis.

The streaming node “graduates” to a persisted node only after completion (or after server mutation finishes). Until then, it should be isolated from effects that assume stable history.

## Principles for a Global Fix
- **Streaming updates should not trigger cross-branch history fetches.**
- **Shared history computation should be driven by persisted history changes**, not transient streaming state.
- **Avoid per-chunk revalidation**; gate, throttle, or decouple from streaming UI state.

## Fix Options (Ranked)

### Option A — Freeze sharedCount during streaming (minimal, safe)
- When `state.isStreaming === true`, skip the cross-branch history fetch loop.
- Recompute once on `onComplete` (or when `isStreaming` flips false).
- Pros: minimal change, low risk, big performance win.
- Cons: shared-count indicator doesn’t update mid-stream (OK).

### Option B — Debounce / throttle sharedCount recompute
- Wrap the sharedCount fetch effect in a 250–500ms debounce.
- Pros: still updates during streaming but bounded; keeps UI “live.”
- Cons: still extra requests; more code complexity.

### Option C — Decouple sharedCount inputs from streaming UI (best match)
- Track a stable “persisted history snapshot” (e.g., `historyEpoch`) that updates only after `mutateHistory()` completes.
- The sharedCount effect depends on `historyEpoch`, not `visibleNodes` or streaming state.
- This enforces the **ephemeral streaming node → persisted node** boundary and prevents streaming deltas from driving global fetches.
- Pros: most correct architecture; streaming UI never drives branch history fetch.
- Cons: requires a small refactor of state flow.

### Option D — Server-side sharedCount endpoint
- Add `/api/projects/:id/shared-count?ref=...` that precomputes counts without fetching full histories.
- Pros: lowest client cost; scalable.
- Cons: most engineering + schema work.

## Recommended Approach
- **Primary**: Option C (ephemeral vs. persisted node boundary).
- **Short-term guard**: Option A can be added while Option C is implemented, or kept as a permanent safety belt.

## Implementation Plan (Option C)

### 1) Add a stable “history epoch”
Add a state variable to `WorkspaceClient` that only changes when persisted history changes.

```
const [historyEpoch, setHistoryEpoch] = useState(0);
```

### 2) Centralize persisted history refresh
Wrap `mutateHistory()` in a helper that bumps `historyEpoch` only after the server snapshot is refreshed.

```
const refreshHistory = async () => {
  await mutateHistory();
  setHistoryEpoch((n) => n + 1);
};
```

Use this helper instead of calling `mutateHistory()` directly.

### 3) Rewire sharedCount effect
Replace the sharedCount effect dependency on streaming-driven state (e.g., `stableVisibleNodes`) with `historyEpoch`.

This ensures sharedCount only recalculates when persisted history changes, not when the streaming node updates.

Pseudo:
```
useEffect(() => {
  // existing sharedCount compute logic
}, [historyEpoch, branches, branchName, trunkName, trunkHistory, trunkNodeCount, project.id]);
```

### 4) Define graduation points
Identify the specific points where the streaming node becomes a persisted node, and call `refreshHistory()` there.

Known locations:
- `onComplete` in `useChatStream` handler (after stream finishes and node is persisted).
- Any edit/merge flows that create new persisted nodes.
- Branch switch / branch create flows if they already call `mutateHistory()`.

### 5) Optional safety belt (Option A)
Add a guard inside the sharedCount effect:

```
if (state.isStreaming) return;
```

This prevents accidental recompute if anything else touches `historyEpoch` during streaming.

## Expected Outcomes
- Streaming does **not** cause cross-branch history request spam.
- Shared-count and branch UI update only after history is stable.
- UI flicker / scroll jitter significantly reduced.

## Notes for Implementer
- This is a **client-only** change; no API/schema changes required.
- It should apply equally to web + desktop; no desktop-only flags needed.
- Keep changes confined to `WorkspaceClient` unless other flows call `mutateHistory()` directly.
- Validate by watching server logs: during streaming, you should no longer see repeated `/history?ref=...` loops.

## Non-Goals
- Do not change LLM streaming transport format.
- Do not block or delay core chat message stream.
- Avoid large UI refactors unless needed.

## Questions
- Should shared-count compute strictly from persisted `nodes` (from `useProjectData`) instead of `stableVisibleNodes`, so optimistic user nodes do not affect shared-count before persistence?
  - **Answer:** Yes. Shared-count should be based on persisted history only. Optimistic or streaming nodes are ephemeral and should not influence cross-branch shared calculations.
- For Option C, should `historyEpoch` bump on every `mutateHistory()` call, or only when history truly changes (e.g., skip artefact autosave flows that call `mutateHistory()` today)?
  - **Answer:** Only when persisted history changes. If a call is known to only refresh artefact state (or a no-op), it should not bump `historyEpoch`. Best practice: wrap history-specific refreshes in `refreshHistory()` and keep artefact-only refreshes separate.
- Is the optimistic user node expected to behave like an ephemeral node (similar to `streaming`) for shared-count purposes, or should it be treated as persisted immediately?
  - **Answer:** Treat optimistic user nodes as ephemeral. They should “graduate” only after the persisted history refresh succeeds; until then, they should not drive shared-count or cross-branch fetches.
- On stream error/interrupt paths (`state.error` effect, manual interrupt), can the server still persist any nodes? If yes, should we call `refreshHistory()` (and bump `historyEpoch`) there, or keep a history refresh that does not bump?
  - **Answer:** Yes, partial persistence is possible (e.g., user node saved, assistant node missing/partial). Use `refreshHistory()` on error/interrupt completion **once** to reconcile persisted history and bump `historyEpoch`. Avoid repeated refreshes during the stream itself.
- Should autosave after `/artefact` PUT still call `mutateHistory()` at all? If it must, should that be treated as a history change (bump `historyEpoch`) or stay artefact-only (no bump)?
  - **Answer:** Autosave should be artefact-only. It should not call `mutateHistory()` unless it actually writes a history node. If it must call `mutateHistory()` today, do **not** bump `historyEpoch` for that path.
