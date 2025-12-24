# OpenAI Responses API Migration Plan (Scoping Draft)

Status: draft
Owner: TBD
Last updated: 2025-01-XX

Note: I was not able to run web search in this environment (network restricted). This plan is grounded in our current repo usage and the existing `PM_DOCS/LLM_API_DOCS.md`, and should be updated with live API doc details once confirmed.

## Executive summary
We currently use OpenAI Chat Completions in `src/server/llm.ts` alongside Gemini and Anthropic. Migrating to OpenAI Responses requires new request/streaming shapes, different tool schemas, and a state model that can be server-managed by OpenAI. This introduces friction with our existing app model (client-side chat history in our DB) and a common interface shared by Gemini/Anthropic. We need to decide whether to wrap Responses to look like our current chat interface or to accept a provider-specific execution path.

Key decision: **wrap Responses into our existing chat interface** (keep our DB as source of truth) vs **adopt OpenAI server-side state for OpenAI only** (and translate on the edges). The first is safer for product consistency but may leave some Responses-native capabilities unused.

## Current state (repo context)
- OpenAI usage is in `src/server/llm.ts` via `openai.chat.completions.create(...)`.
- We stream tokens to the UI with a simple `LLMStreamChunk` of `{ type: 'text', content: string }`.
- We keep conversation state in our DB/Git backend (chat history stored server-side in our app).
- Provider selection and thinking settings are unified across providers.
- We already have a temporary OpenAI web search hack in `src/server/llm.ts` and documented in `WEBSEARCH_IMPL.md`.

## Migration goals
1) Move OpenAI requests to Responses API while preserving our current UX and state model.
2) Support web search via Responses tool (once we remove the chat completions hack).
3) Preserve streaming behavior and our `LLMStreamChunk` output.
4) Maintain compatibility with Gemini and Anthropic through a stable abstraction.
5) Minimize code churn and allow rollback.

## Key challenges
### 1) State model mismatch
Responses favors server-side state (conversation or response IDs) while our app stores message history and replays it on each request. This mismatch can cause:
- Duplicate or inconsistent state if we both store history and pass it into Responses.
- Increased friction when editing history or branching (we allow branch-based conversation editing).
However, we may be able to preserve branching by storing `previous_response_id` per branch and sending only new content with that pointer.

### 2) Different request/response shapes
Responses introduces:
- New request fields and tool schemas.
- Output items that are not plain text deltas.
- Potential tool or reasoning objects we do not currently handle.

### 3) Common interface pressure
Gemini and Anthropic are stateless in our current implementation. Responses is not. We need to decide if:
- We “wrap” Responses so it behaves like our current chat primitive.
- We allow OpenAI to behave differently and accept provider-specific branching logic.

## Option analysis: wrap vs provider-specific

### Option A: Wrap Responses into our chat-like interface (recommended default)
We treat Responses as a stateless primitive by:
- Sending our full chat history each request (or a subset with context windowing).
- Parsing Responses outputs into `LLMStreamChunk` text.
- Ignoring or minimally processing new response item types until we explicitly support them.

Pros:
- Keeps UX consistent across providers.
- Easier to integrate with existing branching/history logic.
- Minimizes UI changes and data model changes.

Cons:
- May forgo some Responses-native benefits (server-side state, reduced context replay).
- Requires careful parsing of response output items to avoid silently dropping important content.

### Option B: Provider-specific path (OpenAI uses server-side state)
We use OpenAI response state IDs and store them alongside our history (e.g., `previous_response_id` per branch).

Pros:
- Aligns with OpenAI’s recommended usage.
- Potentially reduces token usage and request size.

Cons:
- Introduces mismatched behavior across providers.
- Complicates branching/editing (our UI allows edits; OpenAI server state is immutable).
- Requires new data model fields (conversation/response IDs per branch or message).
  - Mitigation: track `previous_response_id` per branch and reset when a user edits history.

### Option C: Hybrid
Default to Option A but allow optional server-side state when explicitly enabled (feature flag).

Pros:
- Safe default with an escape hatch.
- Can test performance or cost improvements without full migration.

Cons:
- More complexity in configuration and QA.

Recommendation: Start with **Option A** to de-risk the migration and preserve current product behavior. Consider a feature-flagged Option C after the migration is stable.

## Proposed architecture changes
1) Introduce an OpenAI Responses adapter in `src/server/llm.ts`:
   - `streamFromOpenAIResponses(...)` returning `LLMStreamChunk`.
   - Translate our `messages[]` to a Responses input structure.
   - Parse streaming outputs and emit only text chunks initially.
2) Add a response item parser:
   - Recognize text content outputs and stream them.
   - Log or capture unsupported output types for visibility (for debugging).
3) Keep our current chat history in the app DB and pass it into Responses:
   - Avoid using server-side conversation state until explicitly needed.
4) Gate by feature flag:
   - Use env var (e.g. `OPENAI_USE_RESPONSES=true`) to switch between Chat Completions and Responses.
   - Allow quick rollback.

## Data model sketch (branch-aware `previous_response_id`)
Goal: allow OpenAI server-side state without breaking our branch/edit workflow.

Proposal:
- Store a `previous_response_id` per branch head (not per message), updated after each successful OpenAI Responses call.
- When a user edits history or forks a branch, **reset** `previous_response_id` for that branch to `null` so the next request replays full context.
- When switching providers away from OpenAI, we ignore this field.

Behavior rules:
- On new assistant response (OpenAI/Responses): set `branch.previous_response_id = response.id`.
- On edit or branch creation from a prior node: set `branch.previous_response_id = null`.
- On OpenAI request:
  - If `previous_response_id` exists, send only the new user message + `previous_response_id`.
  - If missing, send the full current context.

Storage placement (options):
- PG: add a nullable column on the branch/ref record.
- Git store: add a small metadata blob or branch config entry alongside branch refs.

This keeps the Responses state path optional and local to OpenAI while preserving our ability to branch and edit.

## API surface changes (to confirm with docs)
Placeholder topics to validate with current docs:
- Request shape for responses vs chat completions.
- How to pass system + user messages.
- Streaming response event types and payload.
- Tool schemas and web search config.
- How to enable reasoning effort (if supported).

## Implementation plan (phased)
### Phase 0: Research + validation
- Confirm exact Responses API request/streaming shapes.
- Confirm tool/web search config.
- Confirm how to represent system/developer messages.

### Phase 1: Adapter scaffold
- Add a new function in `src/server/llm.ts` for Responses.
- Parse streaming outputs into `LLMStreamChunk`.
- Add a debug mode to surface non-text outputs in logs.

### Phase 2: Feature flag and switch
- Add env flag to route OpenAI requests to Responses.
- Keep Chat Completions fallback for rollback.

### Phase 3: Tool support parity
- Add web search via Responses tool definitions.
- Ensure output items are handled gracefully.

### Phase 4: Clean up
- Remove chat completions hack for OpenAI web search.
- Remove legacy code path once stable.

## Open questions
- Do we need to store response IDs or conversation IDs at all for audits/traceability?
- If we adopt `previous_response_id` per branch, what is the reset behavior when users edit or fork messages?
- How should we handle non-text output items (e.g., tool call results, reasoning objects)?
- Do we want to expose citations from search tool output in the UI?
- Does Responses require special headers or beta flags?
- How do we reconcile OpenAI server-side state with our branch-based history?

## Risks and mitigations
- Risk: streaming parser misses some content types.
  - Mitigation: log unhandled response items and add tests for them.
- Risk: tool payloads introduce unexpected JSON shapes.
  - Mitigation: keep tool output handling isolated and guard parsing.
- Risk: mismatched behavior across providers.
  - Mitigation: keep the UI/LLM stream interface stable and treat Responses as an adapter.

## Success criteria
- OpenAI Responses API successfully powers chat without UI regressions.
- Web search works without the chat completions hack.
- Rollback path remains trivial (single env switch).

## Next actions
- Update this doc with verified Responses API details.
- Decide on Option A vs C after validating docs.
- Implement Phase 1 adapter behind a feature flag.
