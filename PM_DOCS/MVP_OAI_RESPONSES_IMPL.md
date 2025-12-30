# MVP OpenAI Responses Migration (Implementation Plan)

Status: draft
Owner: TBD
Last updated: 2025-01-XX

Source reviewed: `PM_DOCS/OAI_RESPONSES_MIGRATION.md` (updated with API notes/snippets)

## MVP goal
Switch OpenAI calls from Chat Completions to Responses while keeping the app’s chat UX, persistence model, and streaming UI unchanged. Preserve a rollback path and isolate OpenAI-specific behaviors for easy removal or future refinement.

## MVP scope
- OpenAI only; Gemini/Anthropic unchanged.
- Streaming text output only (emit text; log non-text response items).
- Web search via Responses tools (remove the chat-completions web search hack once stable).
- Keep our existing chat history as source of truth (Option A wrapping).
- Track `previous_response_id` per branch to enable OpenAI server-side state while preserving branching semantics.
- Feature flag to enable/disable Responses path.

## Non-goals (MVP)
- Full support for all Responses output item types (images, tool payloads, etc.).
- Advanced structured output rendering in the UI (we will log events for visibility).
- UI changes beyond existing web search toggle behavior.

## Architecture sketch
We keep `LLMStreamChunk` as our common interface. OpenAI gets an adapter that converts:
`ChatMessage[]` -> Responses request payload, and Responses stream events -> `LLMStreamChunk`.

Key isolation points:
- `src/server/llm.ts` gets a new `streamFromOpenAIResponses(...)` and a feature-flagged switch in `streamFromOpenAI(...)`.
- OpenAI-specific translation and parsing live in one module block to be removable.

## Feature flags and config
Add env flag:
- `OPENAI_USE_RESPONSES=true|false` (default true; set false to rollback)

MVP default:
- Statefulness enabled when `previous_response_id` is available; stateless fallback when it is not.

## Request translation (MVP)
### Input shaping
Translate chat history into Responses input format (per doc/snippets):
- System messages: map to the Responses `instructions` argument.
- User/assistant messages: convert to Responses `input` items with `{ role, content: [{ type: "text", text }] }`.

MVP should:
- Preserve message order.
- Exclude empty messages.
- Keep max context handling unchanged (we already trim via `buildChatContext`).

### Reasoning / thinking
For OpenAI responses, use `reasoning.effort` (per migration doc) when supported.
- If we detect a model that does not support reasoning parameters, omit them.
- Keep the current `ThinkingSetting` mapping unchanged.

### Web search
When `webSearch` is enabled and Responses is active:
- Attach the web search tool in `tools`.
- Remove the chat-completions search-preview model routing once Responses is stable.

### State pointer
When available:
- Pass `previous_response_id` with the new user message to enable server-side state.
- When missing, send full context (stateless fallback).

## Streaming translation (MVP)
Implement a small stream parser that:
- Emits only text deltas as `LLMStreamChunk`.
- Logs all non-text items for visibility.
- Preserves current stream interruption semantics.

Expected event types (per doc snippets):
- Text delta events (e.g., `response.output_text.delta` or equivalent).
- Completion events (e.g., `response.completed`).

MVP behavior:
- For each text delta event, yield `{ type: "text", content: delta }`.
- On unhandled events, log a single-line entry with event type and response id.

## State strategy (MVP)
Default path is stateful when possible:
- Store `previous_response_id` per branch and pass it when present.
- Reset on branch fork or edit (as in migration doc).
- If no pointer is available, fall back to full-context stateless requests.

## Implementation steps (MVP)
1) Add feature flag in config:
   - `src/server/llmConfig.ts` or a small `getEnvFlag(...)` helper.
2) Add OpenAI Responses adapter:
   - `streamFromOpenAIResponses(...)` in `src/server/llm.ts`.
   - Input translation helper: `toOpenAIResponsesInput(messages)`.
   - Streaming event parser: `parseOpenAIResponseStream(...)`.
3) Add `previous_response_id` storage:
   - PG: migrate `public.refs` to include `previous_response_id` (nullable).
   - Git: store a per-branch map in a small JSON file in the project root (ignored by git) or in metadata.
   - Add store helpers to read/update/reset per branch.
4) Switch OpenAI path:
   - In `streamFromOpenAI(...)`, if flag is on, call Responses adapter.
   - Keep Chat Completions path intact for rollback.
5) Web search integration:
   - Use Responses tool config when `webSearch` is true.
   - Keep OpenAI chat-completions web search hack as fallback until Responses is stable, then remove.
6) Logging + metrics:
   - Log response id and unknown event types in debug mode.
7) Tests:
   - Unit test for input mapping (system/user/assistant).
   - Unit test for stream parsing (text delta + unknown events).
   - Unit test for `previous_response_id` reset on branch edit/fork.

## File-level plan
- `src/server/llm.ts`
  - Add `streamFromOpenAIResponses(...)`.
  - Add helpers for request shape + stream parsing.
  - Feature-flag switch in OpenAI provider path.
- `src/server/llmState.ts` (new, suggested)
  - Read/write/reset `previous_response_id` per branch for PG and git modes.
- `src/store/pg/*`
  - RPCs to read/update `previous_response_id` on refs.
- `supabase/migrations/*`
  - Add column + update RPCs.
- `src/shared/llmCapabilities.ts`
  - Ensure thinking -> `reasoning.effort` mapping still valid for Responses.
- `app/api/projects/[id]/chat/route.ts`
  - No change for MVP (request shape already includes `webSearch` + `thinking`).

## Rollback strategy
- Toggle `OPENAI_USE_RESPONSES=false` to return to Chat Completions.
- Keep both paths until Responses is stable in production.

## MVP acceptance criteria
- OpenAI requests use Responses API when flag is enabled.
- Streaming text output matches current UX.
- Web search works via Responses tools.
- `previous_response_id` is stored and respected per branch.
- No regressions in Gemini/Anthropic behavior.

## Open questions / decisions
- What is the exact event/type mapping for streaming in Responses (confirm with doc snippet)?
- Should we log unhandled events in production or only in dev?


---

# MVP OpenAI Responses Migration — Handover
Summary
We agreed to implement OpenAI Responses as a separate provider (openai_responses) rather than intermingling it with Chat Completions. The selection is controlled via feature flag: if OPENAI_USE_RESPONSES=true, the backend maps openai to openai_responses under the hood (no UI change).

We must also support branching parity by storing:

responseId on each assistant message node, and
previous_response_id per branch (ref), updated to the latest assistant response ID, reset on branch edit/fork.
We cannot change environment context in this session, so no further code changes can be made here. The steps below are precise enough to execute.

Ground Rules / Decisions
Responses is a separate provider: openai_responses will be its own provider path like Gemini/Anthropic.
Statefulness is required: we must use previous_response_id to preserve branching parity.
System prompt mapping: system messages must be sent via Responses instructions argument.
Logging: log all non-text event types in Responses streaming.
Feature flag: OPENAI_USE_RESPONSES=true|false toggles between OpenAI Chat Completions and Responses (defaults true).
Already Changed (in researchtree_codex)
These changes were made via python edits and are present locally:

✅ types.ts
Added responseId?: string to MessageNode.
Updated MessageNodeInput to include responseId.
✅ context.ts
Added lastAssistantResponseId?: string | null to ChatContext.
Computed lastAssistantResponseId by scanning nodes for last assistant message with responseId.
Returned it with systemPrompt + messages.
✅ llmCapabilities.ts
Added buildOpenAIResponsesThinkingParams(...) returning { reasoning: { effort } }.
✅ llmConfig.ts
Added getOpenAIUseResponses() boolean helper.
✅ llm.ts
Imports updated for buildOpenAIResponsesThinkingParams and getOpenAIUseResponses.
LLMStreamChunk widened to include a { type: 'meta'; responseId?: string } variant (for capturing response IDs).
No Responses path yet and previousResponseId is not wired.
Critical Missing Pieces (MVP)
1) Add new provider ID
File: llmProvider.ts
Change:

export const LLM_PROVIDERS = ['openai', 'openai_responses', 'gemini', 'anthropic', 'mock'] as const;
Also update any zod enum in schemas.ts and any provider option lists to include openai_responses (but do not expose in UI dropdown — this should be internal only).

2) Provider name / key mapping
We should treat openai_responses as using the OpenAI API key, same as openai.

Update these areas:

llmUserKeys.ts
labelForProvider() should map openai_responses -> "OpenAI".
envVarForProvider() should map openai_responses -> OPENAI_API_KEY.
userLlmKeys.ts
KeyedProvider (Exclude<LLMProvider,'mock'>) may now include openai_responses. The RPC expects 'openai' so we should normalize openai_responses -> openai when calling the RPCs.
Suggested: create a helper normalizeProviderForKeys(provider) and use it in both key status and key read/write.
3) Provider options in UI (do NOT expose)
openai_responses should not be shown in UI.
In page.tsx, where providerOptions are built, filter it out:

const providerOptions = getEnabledProviders()
  .filter((id) => id !== 'openai_responses')
  .map(...)
4) Resolve provider mapping based on flag
In llm.ts (or llmConfig.ts), map openai to openai_responses when the flag is on:

Either modify resolveLLMProvider to do:
if (requested === 'openai' && getOpenAIUseResponses()) return 'openai_responses';
Or do this mapping in route.ts before calling resolveLLMProvider.
5) Add branch-level previous_response_id storage (PG)
DB changes:

Add nullable column previous_response_id text to public.refs.
Update RPCs:
rt_create_ref_from_ref_v1: copy previous_response_id from source ref to new ref.
rt_create_ref_from_node_parent_v1: set previous_response_id based on the assistant response ID for the target node’s parent (if applicable), otherwise null.
If there’s no assistant response, set null.
Add RPCs:
rt_get_ref_previous_response_id_v1(p_project_id, p_ref_name) -> text|null
rt_set_ref_previous_response_id_v1(p_project_id, p_ref_name, p_previous_response_id) -> void
rt_clear_ref_previous_response_id_v1(...) convenience (optional)
Note: PG nodes store content_json in nodes table. We can extract responseId from content_json for assistant nodes in SQL, or do it in TS by querying nodes.

6) Branch-level previous_response_id storage (git mode)
We need a small storage mechanism for branch state. Proposal:

Add a JSON file under each git project root (not committed). Example:
branch_state.json
format: { "<branchName>": { "previousResponseId": "resp_..." } }
Add helper file llmState.ts:
getPreviousResponseId(projectId, branchName)
setPreviousResponseId(projectId, branchName, responseId)
clearPreviousResponseId(projectId, branchName)
For PG, these call RPCs; for git, read/write JSON file.
7) Store response ID on assistant nodes
Whenever we persist assistant messages (chat + edit), include responseId.

Places to update:

route.ts
route.ts
Implementation detail:

The Responses stream should emit a { type: 'meta', responseId } chunk once it knows the ID.
The server stream loop should capture this and store it in assistantNode.responseId, and update branch previous_response_id.
8) Responses adapter (separate provider path)
Add a new function:

streamFromOpenAIResponses(...) in llm.ts
This should:

Translate messages:
system -> instructions field (single string)
user/assistant -> input array with { role, content: [{ type: "text", text }] }
Include previous_response_id if available
Apply buildOpenAIResponsesThinkingParams
Apply tools for web search:
tools: [{ type: "web_search_preview" }]
Stream events from client.responses.create({ stream: true })
On response.output_text.delta, yield { type: 'text', content: ev.delta }
On response.completed or first event that includes ID, yield { type: 'meta', responseId: response.id }
Log all other event types (as per requirement)
Make sure this adapter is only used when provider == openai_responses.

9) Wire previousResponseId into LLM call
Update LLM stream options:

Add previousResponseId?: string | null in LLMStreamOptions (already started, but not wired).
In chat route, after buildChatContext, read previous response id (branch-level) from llmState and pass it in.
In edit route, after creating branch or editing, reset previous response id to null (or to a specific assistant node if we branch from one).
For edits from a specific node, set branch previousResponseId to the assistant response ID for that node if it exists.
10) Reset/copy branch state
Create branch from ref: copy previous response id from source branch.
Create branch from node parent (edit): should set to the assistant response ID associated with the parent message (if that parent is assistant).
Manual edit of a user message: reset to null unless you compute the assistant response ID for the node before it.
Where to Update Code (Precise Locations)
A) Providers / config / types
llmProvider.ts — add openai_responses
schemas.ts — include in llmProvider enums
llmConfig.ts — ensure getEnabledProviders doesn’t expose openai_responses in UI options
B) UI filtering
page.tsx — filter out openai_responses for dropdown
C) Key handling
llmUserKeys.ts — map openai_responses to openai env var + label
userLlmKeys.ts — normalize provider for RPC calls
D) LLM pipeline
llm.ts
add provider path openai_responses
add streamFromOpenAIResponses
route based on feature flag
emit meta chunk with response ID
E) Branch state
Add llmState.ts to manage previous response id for PG + git
Update route.ts
load prev id from llmState
pass into streamAssistantCompletion
capture meta chunk responseId and persist:
update branch previousResponseId
store in assistant node
Update route.ts
reset or set previousResponseId after edit/branch
F) Database migrations
Add migration to:

public.refs.previous_response_id text null
update relevant RPCs (rt_create_ref_from_ref_v1, rt_create_ref_from_node_parent_v1)
add rt_get_ref_previous_response_id_v1, rt_set_ref_previous_response_id_v1
Model / Event Handling Notes (from updated migration doc)
Streaming events include:
response.output_text.delta (text)
tool.call, tool.return, structured_output, etc.
We must log all non-text events initially.
Web search via:
tools: [{ type: "web_search_preview" }]
State usage:
previous_response_id: lastResponseId
Open Questions (if any)
Should we store Response IDs on assistant messages only (current plan) — this enables branching from assistant messages.
Do we need to store response IDs for user messages? Probably not.
Do we want to serialize tool events anywhere? For MVP: log only.
Current Branch State (this worktree)
Branch: codex/oai_responses
Committed: websearch doc move + updated OAI_RESPONSES_MIGRATION.md
Local uncommitted:
types.ts (responseId)
context.ts (lastAssistantResponseId)
llmCapabilities.ts (responses thinking param)
llmConfig.ts (flag helper)
llm.ts (imports, LLMStreamChunk type change)
MVP_OAI_RESPONSES_IMPL.md (this doc placeholder)
Suggested Next Steps (Execution Order)
Add openai_responses provider in types + schema + filter from UI
Normalize key handling for openai_responses
Add DB migration + RPCs for previous response ID
Add llmState helper for PG + git
Implement Responses adapter in llm.ts
Update chat + edit routes to use previousResponseId and persist responseId
Add logging for non-text events
Verify Typescript + run lint
Rollback Plan
Feature flag: OPENAI_USE_RESPONSES=false (set to roll back)
All changes isolated to openai_responses provider path, so Chat Completions path untouched.
