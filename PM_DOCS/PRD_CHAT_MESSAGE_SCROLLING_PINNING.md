# PRD: Chat Message Scrolling, Pinning, and Streaming Stability

## 1 Background
Recent changes removed legacy pinning/autofollow behavior in the chat list to simplify behavior and enable a clean rebuild. This PRD captures what was removed, the requirements for fixing the streaming flicker, and the new message submission/pinning UX requirements.

## 2 Scope
- Chat list rendering and scrolling behavior in `WorkspaceClient`.
- Streaming lifecycle (pending -> streaming -> final) and list stability.
- Message submission pinning and bottom-padding strategy.
- Jump-to-bottom affordance.

Out of scope:
- Merge node canvas diff tagging behavior beyond naming updates.
- Graph interactions unrelated to message list scrolling.

## 3 What Was Ripped Out (Intentional Removal)
1) Pinning/autofollow mechanics:
   - pending scroll-to-node logic
   - pinned-top padding calculations
   - auto-scroll on branch switch
   - scroll anchoring overrides tied to pinning
2) Jump-to-bottom button (temporarily removed, later reintroduced).
3) Message list bottom padding based on measured line height (temporarily removed, later reintroduced).

## 4 Requirements: Streaming Flicker Fix
Goal: no visible flicker/jump when streaming completes and persisted nodes replace optimistic/streaming nodes.

Requirements:
1) Assistant lifecycle is explicit: idle -> pending -> streaming -> final -> error.
2) At most one assistant row is visible at a time (pending OR streaming OR final).
3) Streaming content persists in-place until both:
   - final assistant node exists in history AND
   - optimistic user node has been reconciled (promoted).
4) When the final assistant node appears, the streaming row must not disappear before the optimistic user is reconciled.
5) Optimistic user nodes should be promoted in-place (reuse the DOM identity) whenever possible to avoid reflow jumps.
6) Errors reset the lifecycle and clear stream buffers without leaving duplicate assistant rows.

## 5 Requirements: Message Submission UX / Pinning
Definitions:
- "Line height" = computed line-height of chat text (message font size + line spacing).
- "Pill" = model/provider indicator at top of chat panel.

Requirements:
1) On user submit, pin the user message so its top is positioned 1 line height below the pill's bottom edge.
2) Pinning must work for both optimistic and persisted user nodes.
3) Pinning must allow overflow: if the user message is taller than the viewport, its top remains pinned and the rest flows below (including expanded messages).
4) Streaming assistant messages appear below the pinned user message without changing scroll position.
5) Always maintain a minimum of 4 line heights of padding below the latest visible node.
6) Dynamic bottom padding may increase to achieve pinning, but must never drop below the minimum (4 line heights).
7) On page load or branch switch (or equivalent list reload), perform exactly one scroll-to-bottom.
8) Show the jump-to-bottom button only when:
   - the list overflows the container AND
   - the user is not near the bottom (fuzzy threshold).
9) Clicking jump-to-bottom scrolls to the bottom and preserves the padding rules above.

## 6 Acceptance Notes (Implementation Checks)
- No scroll-to-bottom should fire after streaming completes (except the single initial load/branch switch scroll).
- Pin position should be stable across optimistic -> persisted promotion.
- Jump-to-bottom button should not appear when already near bottom.
