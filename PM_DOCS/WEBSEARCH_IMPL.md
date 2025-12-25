# Web Search Implementation Plan

Goal: add web search support for OpenAI, Gemini, and Anthropic in our LLM stack with safe capability detection, per-provider request shapes, and clear fallbacks for models/APIs that do not support search.

References:
- `PM_DOCS/LLM_API_DOCS.md`
- `src/server/llm.ts`
- `src/server/llmConfig.ts`
- `src/server/providerCapabilities.ts`

## Current LLM wiring (baseline)
- All LLM calls are centralized in `src/server/llm.ts` with per-provider streaming implementations.
- Provider configs/models are resolved via `src/server/llmConfig.ts`.
- Capability-like behavior exists in `src/server/providerCapabilities.ts` (token limits, warmups).

This suggests web search should be modeled as a provider capability and threaded through `streamAssistantCompletion(...)` → `streamFromOpenAI/Gemini/Anthropic(...)`, with per-provider request shape and any response parsing handled inside each stream function.

## Proposed data flow
1) Add a web search option in the LLM call path (e.g. a `webSearch?: { enabled: boolean; ... }` on `LLMStreamOptions` or a separate tool selector).
2) Add a per-provider capability map (in `src/server/providerCapabilities.ts`) describing:
   - Whether web search is supported at all.
   - Which models support it (allow/deny lists).
   - Which API surface to use (OpenAI Responses vs Chat Completions, Gemini tool name, Anthropic tool name).
3) In each provider stream function:
   - If web search requested and supported: add the provider-specific tool config.
   - If not supported: either ignore or return a user-visible error (decision documented in this file).
4) Update config/validation to prevent selecting unsupported models when web search is enabled.

## Provider-specific implementation plan

### OpenAI
Facts from `PM_DOCS/LLM_API_DOCS.md`:
- Recommended web search via Responses API tools.
- Chat Completions supports `web_search_options` in some cases.

Plan:
- Decide whether to migrate OpenAI calls to Responses API or introduce a split path:
  - **Option A (preferred)**: move to Responses API for OpenAI when web search is enabled.
  - **Option B**: add `web_search_options` to Chat Completions with model-gated support.
- Add a capability definition for OpenAI:
  - `webSearch: { api: 'responses' | 'chat', tool: 'web_search' }`
  - `supportedModels: string[]` (initially conservative; refine when research is done).
- Implementation detail:
  - If Responses API is used, parse stream events to yield text chunks compatible with `LLMStreamChunk`.
  - If Chat Completions is used, append `web_search_options` to the request and continue parsing delta text.
  - **Temporary hack (current)**: when `webSearch` is enabled, force model to `gpt-4o-mini-search-preview` and skip `reasoning_effort` for OpenAI search models. This is isolated in `src/server/llm.ts` helpers (`getOpenAIModelForRequest`, `isOpenAISearchModel`) so it can be removed when we switch to Responses API.

Risks/notes:
- Not all OpenAI routes support tools or web search. Ensure our code checks route + model before enabling.
- Streaming response shapes differ between Responses API and Chat Completions.

### Gemini (Google)
Facts:
- Use `tools: [{ google_search: {} }]` for Gemini 2.0+.
- Legacy `google_search_retrieval` for Gemini 1.5.

Plan:
- Add a capability definition per model family:
  - If model name starts with `gemini-1.5`, use `google_search_retrieval`.
  - Otherwise use `google_search`.
- Update `streamFromGemini` to attach `tools` in the request when web search is enabled.
- Decide whether to parse and return citations:
  - Current `LLMStreamChunk` only yields text; if we need citations, add a new chunk type or a side-channel output.
  - Defer citation rendering; at least log/collect `groundingMetadata` for later UI integration.

Risks/notes:
- Some models may not support tools. Confirm which Gemini models in `LLM_ENDPOINTS` allow `generateContent` with tools.

### Anthropic
Facts:
- Use server-side tool `web_search_20250305` and it must be enabled in Anthropic Console.
- Only supported on specific models.

Plan:
- Add a capability definition:
  - `webSearch: { tool: 'web_search_20250305', requiresConsoleEnablement: true }`
  - `supportedModels: string[]`.
- Update `streamFromAnthropic` to include the tool in the request when enabled.
  - Add tool definitions to the `baseBody` with optional `allowed_domains` and `blocked_domains` (if we expose them).
  - Make sure we handle tool results if they come back in the stream. For now, yield only `text_delta` and ignore tool payloads.

Risks/notes:
- If tool is not enabled for the account, expect a 4xx error. Provide a clear error message.

## Capability source of truth
Add a dedicated capability map in `src/server/providerCapabilities.ts`:
- `webSearch: boolean | object` per provider.
- `supportedModels` allowlist for web search.
- `route` or `apiSurface` to describe how to build the request.

Then, add helper(s) like:
- `getWebSearchSupport(provider, model)` returning `{ supported: boolean, reason?: string, config?: {...} }`
- `assertWebSearchSupported(...)` to fail fast with a user-facing error.

This will integrate cleanly with `src/server/llmConfig.ts` to validate when web search is enabled.

## Open questions / pending research
- Exact model lists that support web search for each provider.
- OpenAI: which models support web search in Chat Completions vs Responses.
- Gemini: which models support tools for `google_search` vs legacy.
- Anthropic: which models support `web_search_20250305` and any account flags needed.

## Suggested next steps (once compatibility is known)
1) Add the web search option to `LLMStreamOptions` and thread it into `streamAssistantCompletion`.
2) Implement provider capability checks in `src/server/providerCapabilities.ts`.
3) Implement per-provider request changes in `src/server/llm.ts`.
4) Add tests (unit or integration) for capability gating and request construction.
