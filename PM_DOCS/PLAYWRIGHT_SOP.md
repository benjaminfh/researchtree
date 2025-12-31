<!-- Copyright (c) 2025 Benjamin F. Hall. All rights reserved. -->

# Playwright SOP (ResearchTree)

This note captures the initial approach we took for the smoke suite and the lessons learned from trial runs.
Use it as a checklist when adding or updating E2E coverage.

## Initial approach

- Start with a single end-to-end "happy path" that exercises core flows (create project, chat, branch, merge).
- Prefer accessible selectors (role/label/placeholder) and only add `data-testid` when needed.
- Wire a global setup to log in once and reuse storage state.
- Use real API requests for auth/profile seeding to avoid UI-only bottlenecks.
- Keep the test sequential to mirror a real user session (branching, merging, graph navigation).

## Lessons learned (foreseeable failure patterns)

1) Selector ambiguity is common
   - Buttons like "Canvas", "All", or "Back to home" appear multiple times.
   - Fix: add `data-testid` for critical controls and scope locators to a container (`chat-message-list`, `graph-panel`).

2) Optimistic IDs are not stable
   - Nodes can briefly be `optimistic-*` or `streaming`, which break API calls like star/edit.
   - Fix: wait until `data-node-id` is a UUID (e.g., `!= optimistic-user`) before clicking actions that POST ids.

3) Panels are not always visible
   - Canvas/Graph panel can be collapsed or on the wrong tab.
   - Fix: `ensureInsightsVisible()`, then select `insight-tab-canvas` / `insight-tab-graph` before interacting.

4) Graph labels can collide
   - Graph node labels can match multiple nodes or include assistant echoes.
   - Fix: select graph nodes by the message's `data-node-id` (ReactFlow uses `rf__node-<id>`).

5) URL waits are brittle
   - Some flows render the target page without a clean URL transition.
   - Fix: wait for a stable UI anchor (`create-project-form`) instead of URL only.

6) Chat text queries can be ambiguous
   - The same message appears in the graph, in details panels, or in assistant echoes.
   - Fix: scope to `chat-message-list` when asserting message visibility.

7) Local env loading is not automatic
   - Playwright does not load `.env.local` by default.
   - Fix: read `.env.local` in `global-setup` for local runs, skip in CI.

## Recommended patterns (copy-paste)

- Ensure insight panel + tab:
  - `await ensureInsightsVisible(page);`
  - `await page.getByTestId('insight-tab-canvas').click();`

- Wait for persisted node id:
  - `await expect.poll(() => row.getAttribute('data-node-id')).not.toBe('optimistic-user');`

- Graph selection by node id:
  - `await page.getByTestId('graph-panel').getByTestId(\`rf__node-${nodeId}\`).click();`

- Scope message assertions:
  - `await expect(page.getByTestId('chat-message-list').getByText(message)).toBeVisible();`
