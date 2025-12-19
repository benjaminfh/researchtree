# BACK END

# FRONT END
## HOME

## WORKSPACE / PROJECT
### CHAT
[x] when creating a branch via the rail, inherited messages are incomplete
[x] chat window inherited messages appears to be incomplete in general
[ ] when the user sends a message, the UI waits until the assistant message is received in full before rendering both. Correct behaviour: we have user message on send, so render immediately (expected behaviour for a chat app) and then once stream first arrices, render assistat box and stream the assistant message in.

### Merge
[ ] merge modal has summary + payload selection -> is the summary injected into the context? This behaviour is not signalled to the user at all. It needs to be.
[ ] merge node content is tagged against user "developer" - this is not a known role - unknown consequences. user OR assistant only!

### Graph
[ ] the graph loads anew each time the graph toggle is selected - it doesn't seem to cache in the browser (slow perf)
#### Starred
[ ] when starring / unstarring a message, the graph sometimes bounces. That is, the unstarred nodes disappears (expected) but then blinks –> re-appears and disappears once more. Race condition somewhere??



## Notes (PG mode)

- Likely root cause for “inherited messages are incomplete”: the ref’s `refs.tip_commit_id` points into an older history, but `commit_order` for that `ref_name` is missing the inherited prefix (only contains nodes appended after the branch was created). Reads use `commit_order → nodes` joins, so missing rows look like missing ancestry in the UI even though the commit DAG has the parent chain.
- Fix approach: add a self-repair RPC that rebuilds `commit_order` by walking the `parent1_commit_id` chain from the ref tip, and invoke it opportunistically during writes/switches.
  - Migration: `supabase/migrations/2025-12-19_0021_rt_rebuild_commit_order_v1.sql`
  - After applying: run `select pg_notify('pgrst', 'reload schema');` and wait ~30–60s.
