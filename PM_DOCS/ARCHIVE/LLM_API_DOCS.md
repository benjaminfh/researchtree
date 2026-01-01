Below is a ready-to-drop-in repo doc (suggested path: `docs/llm-providers.md`). It covers **model listing**, **web search**, **thinking controls**, and **chat app patterns** for **Gemini / OpenAI / Anthropic** with up-to-date doc links and concrete request shapes.

````md
# LLM Providers: APIs, Models, Web Search, Thinking Controls, Chat Patterns

This doc standardizes how our TS codebase interacts with:
- Google Gemini API
- OpenAI API
- Anthropic (Claude) API

For each provider, we document:
1) Endpoint to list available models
2) How to enable web search (if supported)
3) How to control “thinking” / reasoning effort (varies by provider + model family)
4) Patterns for building chat applications (streaming, tool use, state)

---

## Quick comparison

### Model listing endpoints
- **Gemini**: `GET https://generativelanguage.googleapis.com/v1beta/models` :contentReference[oaicite:0]{index=0}  
- **OpenAI**: `GET https://api.openai.com/v1/models` :contentReference[oaicite:1]{index=1}  
- **Anthropic**: `GET https://api.anthropic.com/v1/models` :contentReference[oaicite:2]{index=2}  

### Web search support
- **Gemini**: “Grounding with Google Search” via `tools: [{ google_search: {} }]` (or legacy `google_search_retrieval` for older models) :contentReference[oaicite:3]{index=3}
- **OpenAI**: Web search tool via `tools` (Responses API) and `web_search_options` in some Chat Completions requests :contentReference[oaicite:4]{index=4}
- **Anthropic**: Server-side web search tool `web_search_20250305` (must be enabled in Anthropic Console) :contentReference[oaicite:5]{index=5}

### Thinking / reasoning controls
- **Gemini**: `generationConfig.thinkingConfig` with `thinkingLevel` (Gemini 3) or `thinkingBudget` (Gemini 2.5) :contentReference[oaicite:6]{index=6}  
- **OpenAI**: `reasoning.effort` (Responses API) and `reasoning_effort` (Chat Completions) :contentReference[oaicite:7]{index=7}  
- **Anthropic**: `thinking: { type: "enabled", budget_tokens: number }` (extended thinking) :contentReference[oaicite:8]{index=8}  

---

# 1) Google Gemini API

## 1.1 List available models (endpoint)
**HTTP**
- `GET https://generativelanguage.googleapis.com/v1beta/models` :contentReference[oaicite:9]{index=9}

Notes:
- The response includes model metadata and supported actions (e.g., `generateContent`, embeddings). :contentReference[oaicite:10]{index=10}

**Example (cURL)**
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models" \
  -H "x-goog-api-key: $GEMINI_API_KEY"
````

## 1.2 Enable web search (Grounding with Google Search)

Gemini can ground responses with real-time Google Search by enabling the `google_search` tool on the request. ([Google AI for Developers][1])

**REST example**

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{"parts": [{"text": "Who won the euro 2024?"}]}],
    "tools": [{"google_search": {}}]
  }'
```

This returns `groundingMetadata` containing queries, sources, and citation info. ([Google AI for Developers][1])

Compatibility note:

* Gemini 1.5 uses a legacy tool name `google_search_retrieval` (dynamic threshold mode); for Gemini 2.0+ the docs recommend `google_search` as shown above. ([Google AI for Developers][1])

Billing note:

* Gemini 3 grounding billing begins **January 5, 2026** (per docs). ([Google AI for Developers][1])

## 1.3 Control “thinking” (Gemini 2.5 vs Gemini 3)

Gemini uses “dynamic thinking” by default; you can control it using `thinkingConfig`. ([Google AI for Developers][2])

### Gemini 3: `thinkingLevel`

For Gemini 3 models, set:

* `generationConfig.thinkingConfig.thinkingLevel` (e.g. `"low"`, `"minimal"`, etc. per the thinking guide) ([Google AI for Developers][2])

**REST example**

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{"parts": [{"text": "Provide a list of 3 famous physicists and their key contributions"}]}],
    "generationConfig": {
      "thinkingConfig": { "thinkingLevel": "low" }
    }
  }'
```

Docs note: Gemini 3 Pro can’t disable thinking; Flash has “minimal” which “likely will not think” but may still. ([Google AI for Developers][2])

### Gemini 2.5: `thinkingBudget`

For Gemini 2.5 models, use:

* `thinkingBudget` (token budget for thinking). ([Google AI for Developers][2])
  Docs also describe:
* `thinkingBudget = 0` disables thinking (when supported)
* `thinkingBudget = -1` enables dynamic thinking ([Google AI for Developers][2])

## 1.4 Chat application patterns (Gemini)

Gemini API is stateless by default; multi-turn chat is typically modeled by sending the prior turns back in `contents` (or using SDK session constructs). General patterns:

* Keep a server-side conversation store of turns (system/developer/user/assistant)
* Use streaming when rendering tokens live (`streamGenerateContent` exists) ([Google AI for Developers][3])
* For grounded answers: enable `google_search` tool and parse `groundingMetadata` into citations UI ([Google AI for Developers][1])

---

# 2) OpenAI API

## 2.1 List available models (endpoint)

**HTTP**

* `GET https://api.openai.com/v1/models` ([OpenAI Platform][4])

**Example (cURL)**

```bash
curl "https://api.openai.com/v1/models" \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

([OpenAI Platform][4])

## 2.2 Enable web search

OpenAI supports web search via a built-in tool, recommended through the **Responses API** (and “in some cases” via Chat Completions). ([OpenAI Platform][5])

### Responses API (recommended)

* Add the web search tool in `tools: [...]` ([OpenAI Platform][5])
  (Implementation details of the tool config live in the web search guide.)

### Chat Completions (when supported)

Chat Completions includes `web_search_options` as an optional object parameter. ([OpenAI Platform][6])

## 2.3 Control “thinking” / reasoning effort

There are two common surfaces:

### Responses API: `reasoning.effort`

For reasoning models, set `reasoning.effort` to guide how many reasoning tokens the model uses before answering (e.g. `low | medium | high`). ([OpenAI Platform][7])

### Chat Completions: `reasoning_effort`

Chat Completions exposes `reasoning_effort` with supported values including `none`, `minimal`, `low`, `medium`, `high`, `xhigh` (docs list these explicitly). ([OpenAI Platform][6])

(Provider note: OpenAI’s “Responses API” is the recommended primitive for new projects; Chat Completions remains supported.) ([OpenAI Platform][8])

## 2.4 Chat application patterns (OpenAI)

Recommended:

* Use the **Responses API** for chat/agentic apps, because it supports stateful interactions and built-in tools like web search. ([OpenAI Platform][9])
* Store conversation state in your own DB (or use response IDs + “conversation state” patterns if you adopt them)
* For web search experiences: include the tool, then render citations / sources from the response output items (per the tool’s output schema) ([OpenAI Platform][5])

---

# 3) Anthropic (Claude) API

## 3.1 List available models (endpoint)

**HTTP**

* `GET https://api.anthropic.com/v1/models` ([Claude][10])

(Models endpoint supports pagination via cursor params like `after_id`, `before_id`, `limit`.) ([Claude][10])

**Example (cURL)**

```bash
curl "https://api.anthropic.com/v1/models" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

## 3.2 Enable web search (server tool)

Anthropic provides a **server-side** web search tool. The docs state:

* Your org admin must enable web search in the Anthropic Console ([Claude][11])
* Include a tool definition like:

```json
{
  "type": "web_search_20250305",
  "name": "web_search",
  "max_uses": 5,
  "allowed_domains": ["example.com"],
  "blocked_domains": ["untrustedsource.com"]
}
```

([Claude][11])

Supported models are listed on the web search tool page (e.g. Sonnet/Opus/Haiku variants) ([Claude][11]).

## 3.3 Control “thinking” (extended thinking)

Anthropic supports “extended thinking” by adding:

```json
"thinking": { "type": "enabled", "budget_tokens": 10000 }
```

…and ensuring `budget_tokens < max_tokens`. ([Claude][12])

The response will include `thinking` content blocks (plus `text` blocks) when enabled. ([Claude][12])

**Example (cURL)**

```bash
curl "https://api.anthropic.com/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 16000,
    "thinking": { "type": "enabled", "budget_tokens": 10000 },
    "messages": [{ "role": "user", "content": "Solve X..." }]
  }'
```

([Claude][12])

## 3.4 Chat application patterns (Anthropic)

* Use the **Messages API** (`POST /v1/messages`) for conversational interactions ([Claude][13])
* Track conversation state yourself by replaying prior messages (stateless API style)
* For web search: include the web search tool definition and let Claude decide when to search; responses include cited sources ([Claude][11])
* For “thinking”: enable only for models that support it and budget appropriately (thinking tokens count toward output usage) ([Claude][12])

---

# 4) Implementation notes for our TS repo

## 4.1 Normalize provider capabilities behind an interface

Create a provider abstraction that supports:

* `listModels(): Promise<ModelInfo[]>`
* `chat({ messages, tools, webSearch, thinking, stream }): AsyncIterable<ChatDelta> | Promise<ChatResponse>`
* `capabilities` derived from provider + model metadata

## 4.2 Think in three layers

1. **Model selection**: dynamically load via list-models endpoints at startup / periodically
2. **Request shaping**: provider-specific request mapping:

   * Gemini: `contents`, `generationConfig`, `tools`
   * OpenAI: Responses `input` + `tools` and/or Chat `messages` + `web_search_options`
   * Anthropic: `messages` + `tools` + `thinking`
3. **UI rendering**:

   * streaming deltas
   * citations (Gemini: `groundingMetadata`; Anthropic/OpenAI: tool-based citations)
   * tool calls (function calling / server tools)

## 4.3 “Thinking” controls: treat as *model-family specific*

Do not assume “thinking: off” exists everywhere:

* Gemini 3 Pro: can’t disable thinking (per Gemini thinking guide) ([Google AI for Developers][2])
* OpenAI: `reasoning_effort` / `reasoning.effort` are for reasoning models ([OpenAI Platform][7])
* Anthropic: budgeted extended thinking via `thinking.budget_tokens` ([Claude][12])

## 4.4 Web search: treat as *tooling*

* Gemini: `google_search` tool ([Google AI for Developers][1])
* OpenAI: `web_search` tool (Responses; sometimes Chat) ([OpenAI Platform][5])
* Anthropic: `web_search_20250305` tool (Console enabled) ([Claude][11])

---

## References

* Gemini Models endpoint ([Google AI for Developers][14])
* Gemini Grounding with Google Search ([Google AI for Developers][1])
* Gemini Thinking guide ([Google AI for Developers][2])
* OpenAI Models endpoint ([OpenAI Platform][4])
* OpenAI Web search tool guide ([OpenAI Platform][5])
* OpenAI Chat Completions (`web_search_options`, `reasoning_effort`) ([OpenAI Platform][6])
* Anthropic Models endpoint ([Claude][10])
* Anthropic Web search tool ([Claude][11])
* Anthropic Extended thinking ([Claude][12])

```

If you want, I can also draft a **TS type-level capability map** (e.g. `supportsWebSearch`, `supportsThinkingBudget`, `supportsThinkingLevel`, `supportsReasoningEffort`) plus provider-specific request builders—but the doc above is the “single file” you asked for.
::contentReference[oaicite:58]{index=58}
```

[1]: https://ai.google.dev/gemini-api/docs/google-search "Grounding with Google Search  |  Gemini API  |  Google AI for Developers"
[2]: https://ai.google.dev/gemini-api/docs/thinking "Gemini thinking  |  Gemini API  |  Google AI for Developers"
[3]: https://ai.google.dev/api/all-methods "All methods  |  Gemini API  |  Google AI for Developers"
[4]: https://platform.openai.com/docs/api-reference/models/list "Models | OpenAI API Reference"
[5]: https://platform.openai.com/docs/guides/tools-web-search "Web search | OpenAI API"
[6]: https://platform.openai.com/docs/api-reference/chat?utm_source=chatgpt.com "Chat Completions | OpenAI API Reference"
[7]: https://platform.openai.com/docs/guides/reasoning?utm_source=chatgpt.com "Reasoning models | OpenAI API"
[8]: https://platform.openai.com/docs/guides/migrate-to-responses?utm_source=chatgpt.com "Migrate to the Responses API"
[9]: https://platform.openai.com/docs/api-reference/responses "Responses | OpenAI API Reference"
[10]: https://platform.claude.com/docs/en/api/models/list "List Models - Claude API Reference"
[11]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool "Web search tool - Claude Docs"
[12]: https://platform.claude.com/docs/en/build-with-claude/extended-thinking "Building with extended thinking - Claude Docs"
[13]: https://platform.claude.com/docs/en/api/overview?utm_source=chatgpt.com "API Overview - Claude Docs"
[14]: https://ai.google.dev/api/models "Models  |  Gemini API  |  Google AI for Developers"
