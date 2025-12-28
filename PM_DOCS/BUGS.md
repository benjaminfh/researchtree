# BACK END

# FRONT END
## HOME
### RAIL
[ ] (home) rail does not always pick up new workspaces on load [Open - home rail is server-rendered from `app/page.tsx`; likely Next router cache on back nav without a refresh]

[ ] models are now pinned immutably to branches - this means that a user now has no opportunity to choose provider for the main/trunk branch when creating a new project. 

## WORKSPACE / PROJECT
### CHAT
[x] rail toggle button jitters vertically when navigating between home/workspace [Fixed - top rail bar was flex-shrinking under rail content pressure; added `shrink-0` so it stays at 40px]
[x] when creating a branch via the rail, inherited messages are incomplete [Fixed (pg) - branch creation uses `rtCreateRefFromRefShadowV1`, which copies `commit_order` ancestry]
[x] chat window inherited messages appears to be incomplete in general [Fixed (pg) - `rt_rebuild_commit_order_v1` migration added for corrupted histories + reads join through `commit_order`]
[x] when the user sends a message, the UI waits until the assistant message is received in full before rendering both. Correct behaviour: we have user message on send, so render immediately (expected behaviour for a chat app) and then once stream first arrices, render assistat box and stream the assistant message in. [Fixed - optimistic user node + streaming preview in `WorkspaceClient`]
[x] assistant messages are not taking up full (or most of / 85% w) the chat container width - they should  [Fixed - assistant bubbles use `w-full max-w-[85%]`]
[ ] after sending a new message, the 'scroll to bottom' initially updates to include the optimistic user message + pending assistant stream, but then blinks and scrolls back up.
[ ] after sending a mesage, the assistant message's coloured branch indicator stripe initially adopts the master branch colour (black)
[ ] (optimization) history fetches for shared-count currently query all branches; if "upstream" only means trunk path, we can streamline to trunk-only (or server-side merge-base) and reduce API load. [Exploration]
[x] if a user has entered provider API token but hits a quota issue with the provider, we surface a generic errors. We need to detect this response for each provider and surface a clear user facing error.
[x] double check that we surface a clear user facing error if user tries a provider and has not entered an api token for that provider.

### Branches
[x] LLM config should be pinned to branch [Fixed - provider/thinking persisted per `projectId + branchName` storage keys]

### Merge
[x] merge modal has summary + payload selection -> is the summary injected into the context? This behaviour is not signalled to the user at all. It needs to be. [Fixed - merge modal explicitly states summary is injected into future LLM context]
[x] merge node content is tagged against user "developer" - this is not a known role - unknown consequences. user OR assistant only! [Fixed - no `developer` role usage found; merge nodes are `type: 'merge'`]

### Graph
[x] the graph loads anew each time the graph toggle is selected - it doesn't seem to cache in the browser (slow perf) [Fixed - graph histories cached in `graphHistories` and only refetched when branch list changes]
#### Starred
[x] when starring / unstarring a message, the graph sometimes bounces. That is, the unstarred nodes disappears (expected) but then blinks –> re-appears and disappears once more. Race condition somewhere?? [Likely fixed - optimistic stars + stable `starredNodeIds` key + graph update guard to avoid thrash]



## Notes (PG mode)

- Likely root cause for “inherited messages are incomplete”: the ref’s `refs.tip_commit_id` points into an older history, but `commit_order` for that `ref_name` is missing the inherited prefix (only contains nodes appended after the branch was created). Reads use `commit_order → nodes` joins, so missing rows look like missing ancestry in the UI even though the commit DAG has the parent chain.
- Fix approach: add a self-repair RPC that rebuilds `commit_order` by walking the `parent1_commit_id` chain from the ref tip, and invoke it opportunistically during writes/switches.
  - Migration: `supabase/migrations/2025-12-19_0021_rt_rebuild_commit_order_v1.sql`
  - After applying: run `select pg_notify('pgrst', 'reload schema');` and wait ~30–60s.
