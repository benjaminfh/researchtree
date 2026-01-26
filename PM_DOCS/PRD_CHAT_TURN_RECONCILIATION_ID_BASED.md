# PRD: Chat Turn Reconciliation (ID-Based) and Scroll Stability

## 1 Background
We removed legacy pinning/autofollow logic and rebuilt the chat list behavior to stabilize scroll position during message submission and streaming. Recent changes introduce ID-based reconciliation for optimistic/persisted nodes to eliminate content matching and DOM swaps.

## 2 Scope
- Chat turn lifecycle and rendering in `WorkspaceClient`.
- Optimistic user/assistant nodes, streaming lifecycle, and list stability.
- ID-based reconciliation (clientRequestId) across client, API, and persistence.
- Bottom padding, pin-to-pill behavior, and jump-to-bottom affordance.
- RPC and schema updates required for persistence.

Out of scope:
- Graph navigation UX beyond the existing node selection surface.
- Branch management UI changes unrelated to chat turn behavior.
- Canvas tagging flow beyond naming updates.

## 3 Goals
- Avoid scroll jumps when streaming completes.
- Promote optimistic nodes in-place, never swap DOM elements.
- Make reconciliation independent of message content.
- Keep a consistent pin position below the provider pill.
- Preserve existing merge node UI, hidden node behavior, and optimistic UX.

## 4 Requirements

### 4.1 Turn Lifecycle and Rendering
1) Assistant lifecycle: `idle -> pending -> streaming -> final -> error`.
2) At most one assistant row visible per turn (pending OR streaming OR final).
3) Streaming content persists in-place until the persisted assistant node appears.
4) Optimistic user node persists in-place until persisted nodes are reconciled.
5) Final assistant row should replace streaming row only after reconciliation.
6) Errors reset lifecycle and clear buffers without duplicating rows.

### 4.2 ID-Based Reconciliation
1) Each chat turn must use a stable client-generated `clientRequestId`.
2) The optimistic user and assistant nodes must carry the same `clientRequestId`.
3) Persisted user/assistant nodes must store `clientRequestId`.
4) Reconciliation matches persisted nodes by `clientRequestId` (not content).
5) DOM identity is preserved via a stable `renderId` across optimistic -> persisted.
6) Render IDs must be unique in the visible list to avoid key collisions.

### 4.3 Submission Pinning and Padding
Definitions:
- Line height = computed line height of chat text.
- Pill = model/provider indicator at top of chat panel.

1) On submit, pin the user message so its top is positioned 0.5 line height below the pill bottom.
2) Pinning applies to both optimistic and persisted user nodes.
3) Overflow is allowed: tall messages can extend below the viewport.
4) Assistant streaming rows appear below the pinned user without changing scroll.
5) Always maintain a minimum of 4 line heights of padding below the latest visible node.
6) Dynamic padding may increase to satisfy pinning but must not drop below the minimum.
7) On page load or branch switch, perform exactly one scroll-to-bottom.
8) Jump-to-bottom appears only when the list overflows and the user is not near bottom (fuzzy threshold).
9) Jump-to-bottom scrolls to the bottom while preserving padding rules.

### 4.4 Persistence and API Contract
1) API requests accept optional `clientRequestId` for chat, branch-question, and edit-stream.
2) PG writes persist `client_request_id` column and mirror it in `content_json.clientRequestId`.
3) Git-mode writes persist `clientRequestId` in node JSON for parity.
4) The new RPC signature must be respected by all callers and adapters.

### 4.5 Migration
1) Add `client_request_id` column to `public.nodes`.
2) Update `rt_append_node_to_ref_v2` to accept `p_client_request_id`.
3) Store `p_client_request_id` in both `nodes.client_request_id` and `content_json.clientRequestId`.

### 4.6 Jump-to-Message UX
1) Clicking a graph node shows its message preview in the graph detail panel.
2) ⌘ + click jumps to the nearest visible representation of the node in chat.
3) If the nearest representation is in shared history, shared history is revealed for the jump.
4) ⌥ + click jumps to the node’s origin branch (createdOnBranch), switching branches if needed.
5) Jumping scrolls the node into view just below the provider pill and briefly highlights it.
6) No jump occurs if the node cannot be resolved from current graph histories.

## 5 Acceptance Criteria
- No scroll jump on stream completion or optimistic reconciliation.
- No DOM swaps when the persisted nodes arrive.
- Optimistic and persisted nodes share render IDs.
- Pin position is stable across optimistic -> persisted transition.
- Jump-to-bottom only appears when user is not near bottom.
- `clientRequestId` is stored for both user and assistant nodes in PG and git modes.

## 6 Notes
- Graph jump-to-message remains disabled (TODO) and is not required for this scope.
- Canvas diff tagging uses updated labeling ("Tag diff in chat").

## 7 Implementation TODOs
All listed tasks completed in this branch.
