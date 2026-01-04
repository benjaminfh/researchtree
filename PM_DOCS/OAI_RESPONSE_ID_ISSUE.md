# OpenAI Responses `previous_response_id` handling — session summary

## What we fixed
- Branch creation now carries `previous_response_id` forward when the source and target branches both use `openai_responses`, covering PG RPCs and git mode. This prevents losing server-side state when forking or splitting branches.
- OpenAI Responses context prep is unified: when `previous_response_id` is **absent**, we replay the full user + assistant history as plain text; when it is **present**, we send only the latest user turn. Both streaming and tool paths now share this logic.
- Added unit coverage for the new context-prep helper and tightened branch-route tests to assert `previous_response_id` propagation.

## Remaining cautions / behavior
- Provider switches into `openai_responses` still reset `previous_response_id` by design; the fallback now sends full text history to avoid context loss on the first Responses call.
- The Responses API itself does not accept assistant turns as structured messages; we flatten assistant text during history replay.
- Ensure future migrations or branching flows keep the “copy when same provider, reset otherwise” rule to avoid state leakage across providers.

## Tests
- `npm test -- tests/server/branches-route.test.ts`
- `npm test -- tests/server/llm-openai-responses-input.test.ts`
