# BACK END

# FRONT END
## HOME

## WORKSPACE / PROJECT
# CHAT
[ ] when creating a branch via the rail, inherited messages are incomplete
[ ] chat window inherited messages appears to be incomplete in general
[ ] when the user sends a message, the UI waits until the assistant message is received in full before rendering both. Correct behaviour: we have user message on send, so render immediately (expected behaviour for a chat app) and then once stream first arrices, render assistat box and stream the assistant message in.

## Notes (PG mode)

- Likely root cause for “inherited messages are incomplete”: the ref’s `refs.tip_commit_id` points into older history, but `commit_order` for that `ref_name` is missing the inherited prefix (only contains nodes appended after the branch was created). Reads use `commit_order → nodes` joins, so missing rows look like missing ancestry in the UI even though the commit DAG has the parent chain.
- Manual repair tool: `rt_rebuild_commit_order_v1` (migration `supabase/migrations/2025-12-19_0021_rt_rebuild_commit_order_v1.sql`) rebuilds a ref’s `commit_order` from the `parent1_commit_id` chain at the ref tip.
  - After applying: run `select pg_notify('pgrst', 'reload schema');` and wait ~30–60s.
