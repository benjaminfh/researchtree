# **Updated OpenAI Responses API Migration Plan (Draft)**

*Status: draft*
*Owner: TBD*
*Last edited: 2025-12 (updated with current API facts)*

This updated plan incorporates official and community knowledge of the *Responses API*, especially regarding statefulness, native tools, structured outputs, and streaming. Any claims below are cited from OpenAI docs and credible tutorials.

---

## **Executive Summary (Updated)**

We are migrating from the legacy **Chat Completions** interface (`openai.chat.completions.create(...)`) to the **Responses API**, which unifies and extends prior conversation and assistant APIs into a single, flexible endpoint with **better integrated tooling support, optional state management, and native streaming**. ([OpenAI Platform][1])

Because Responses supports **both stateless and stateful** patterns, along with *structured output types* and tool orchestration internal to a single call, we should refine how we integrate and adapt our current architecture rather than treat this as a like-for-like swap. ([Ragwalla][2])

Key decisions:

* **Leverage Responses’ strengths** (built-in tools, structured outputs) where beneficial.
* **Preserve our existing UX, streaming model, and history semantics**.
* Migrate incrementally with feature flags to reduce risk.

---

## **Current State (Repo Context)**

* We call OpenAI Chat Completions (`openai.chat.completions.create(...)`) with our own streaming adapter.
* Conversation history is stored client-side and replayed each call.
* Providers (Gemini, Anthropic) are unified under a stateless model.
* We cheat web search currently via hacky integrations documented in `WEBSEARCH_IMPL.md`.

---

## **Migration Goals (Updated)**

1. **Replace Chat Completions with the Responses API** while preserving UX and our streaming interface.
2. **Use Responses API’s built-in tool and structured output capabilities**, especially for web­search and reasoning integration.
3. **Preserve our streaming behavior** via Responses streaming events.
4. Maintain compatibility with our abstraction for other providers.
5. Minimize code churn; maintain rollback safety.

---

## **Key Changes in the API to Understand**

### ✅ **Responses API Unified & Extended Endpoint**

* The *Responses API* replaces the older Chat Completions and Assistants APIs with one interface.
* Supports **optional stateful sessions** (via conversation IDs or `previous_response_id`) **and stateless usage** (full history replay). ([Ragwalla][2])

---

### ✅ **Stateful vs Stateless Behavior**

**Stateless**

* You can continue to send full history on every call, exactly like Chat Completions.
* This preserves your existing workflow without using server state. ([Ragwalla][2])

**Stateful**

* The API supports carrying **conversation context/state server side**, referenced via `previous_response_id` or a dedicated conversation ID.
* This means you may send *only new messages*, reducing tokens and cost. ([LangChain Forum][3])

---

### ✅ **Native Tools and Structured Outputs**

The Responses API has native tool orchestration:

* Built-in tools (web search, file search, etc.) are supported natively.
* Models can return function/tool calls which are part of the stream.
* Structured tool responses and final answers can be encoded with JSON schema. ([DataCamp][4])

This contrasts with Chat Completions, where tools must be manually orchestrated by parsing fields and responding separately.

---

### ✅ **Streaming Is First-Class**

The Responses API supports streaming of output items including:

* Text tokens
* Tool calls and return points
* Structured item types as events

Streaming is enabled with `stream=True` and returns server-sent events (SSE). ([OpenAI Platform][5])

---

## **Challenges Refined**

### 📌 State Management

* **We can do stateless replay and keep existing history model**, or
* **Use server-state for more efficient incremental requests**, but must handle edits and forks carefully.
* Using state side-by-side with our own history model requires good consistency rules (see below). ([Ragwalla][2])

---

### 📌 Request & Response Shapes

Responses defines rich **output item types** not just text:

* Plain text
* Tool calls
* Structured outputs
* Reasoning/support trace items

These can’t be safely ignored without loss of semantic content. ([DataCamp][4])

---

### 📌 Common Interface Pressure

* Gemini/Anthropic will remain **stateless**.
* Responses can operate both **statelessly and statefully**.
* Our abstraction should treat Responses as a superset of Chat Completions.

---

## **Option Analysis (Updated)**

### 🔷 **Option A: Wrap Responses into Chat-like Interface**

* Send **full history each request** (stateless) if `previous_response_id` is absent.
* Parse streaming events into simple text chunks.
* Cache tool invocations or structured outputs where needed.

**Pros**

* Minimal product changes.
* Preserves existing behavior.

**Cons**

* May underutilize native statefulness or tools.
* Needs careful streaming parsing.

Used behind feature flag for safe rollback.

---

### 🔷 **Option B: Provider-Specific Stateful Mode**

Use `previous_response_id` for incremental request payloads and leverage server state.
Requires:

* Tracking `conversation_id` and/or last response IDs per branch.
* Resetting state when history is edited.

**Pros**

* Lower token usage.
* Aligns with how Responses supports server state. ([LangChain Forum][3])

**Cons**

* More complex consistency logic.
* Different from how other providers behave.

---

### 🔷 **Option C: Hybrid**

Default to Option A, then progressively enable Option B for select traffic/features.

**Best path for risk mitigation.**

---

## **Proposed Architecture Changes**

### **1) Introduce Responses Adapter**

Add `streamFromOpenAIResponses(...)` analogous to Chat Completions adapter, exposing:

* streaming text chunks
* structured items handling (tool call events, JSON outputs)

---

### **2) Response Item Parser**

Instead of ignoring non-text output items, parse:

* text
* tool calls (function call outputs)
* structured response blocks

This preserves richer output semantics.

---

### **3) History & State Strategy**

* Track `previous_response_id` for incremental requests when flagged ON. ([LangChain Forum][3])
* Branch edit -> **reset state pointer** to avoid incorrect state.

---

## **Implementation Plan (Phased)**

### **Phase 0: Confirm API Details**

* Validate request/response shapes for streaming Responses. ([OpenAI Platform][5])
* Confirm tool invocation mechanism via official docs and tool schemas.

---

### **Phase 1: Adapter Scaffold**

* Build new adapter for Responses.
* Streaming parser that emits text and handles structured events.

---

### **Phase 2: Feature Flag**

* Add `OPENAI_USE_RESPONSES=true` to route new API.
* Maintain legacy path for rollback.

---

### **Phase 3: Tool Support Parity**

* Integrate built-in tools (web search, file search).
* Test structured outputs.

---

### **Phase 4: Cleanup**

* Remove web search hack.
* Sunsetting legacy endpoints once stable.

---

## **Open Questions to Address**

1. Should we **persist structured reasoning items** in our DB?
2. How do we reflect **tool call state and outputs** in UI?
3. Does server-state token cost/benefit justify complexity?
4. What safety/moderation behavior differences arise from streaming? ([OpenAI Platform][5])

---

## **Success Criteria (Updated)**

* Equivalent UX with Responses API vs Chat Completions.
* Web search/features working natively.
* Rollback via feature flag is trivial.
* Streaming parser handles structured items (tools/JSON) without loss.



[1]: https://platform.openai.com/docs/api-reference/responses?utm_source=chatgpt.com "Responses API reference"
[2]: https://ragwalla.com/blog/openai-assistants-api-vs-openai-responses-api-complete-comparison-guide?utm_source=chatgpt.com "In-Depth Analysis: OpenAI Assistants API vs. ..."
[3]: https://forum.langchain.com/t/how-can-i-pass-conversation-id-when-invoking-openais-responses-api-with-langchain/1935?utm_source=chatgpt.com "How can I pass conversation id when invoking OpenAi's ..."
[4]: https://www.datacamp.com/tutorial/openai-responses-api?utm_source=chatgpt.com "OpenAI Responses API: The Ultimate Developer Guide"
[5]: https://platform.openai.com/docs/guides/streaming-responses?utm_source=chatgpt.com "Streaming API responses"


---

Here are **practical code snippets** to guide your engineering team in implementing the Responses API (including streaming, structured output parsing, and tool support) using the official OpenAI JavaScript/TypeScript SDK.

These examples assume you’re using **the official `openai` SDK** and are familiar with Node.js/TypeScript (or JavaScript). They’re based on the documented API behavior from the OpenAI docs. ([OpenAI Platform][1])

---

## ✅ 1) **Installing & Initializing the SDK**

Install the official OpenAI SDK for Node.js:

```bash
npm install openai
```

Then import and initialize a client:

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Store API key securely
});
```

The primary API surface you’ll use for responses is `client.responses.create(...)`. ([OpenAI Platform][2])

---

## ✅ 2) **Simple Stateless Response (Non-Streaming)**

This is the basic Responses API call:

```js
const response = await client.responses.create({
  model: "gpt-5.2",
  input: "Explain how quantum entanglement works in simple terms.",
});

console.log(response.output_text);
```

Here `response.output_text` contains the final generated text. ([OpenAI Platform][1])

---

## ✅ 3) **Streaming Response Example**

To stream partial tokens as they’re generated:

```js
const stream = await client.responses.create({
  model: "gpt-5.2",
  input: "Tell me a creative story about AI in space.",
  stream: true,
});

// Each event is streamed as an async iterator
for await (const event of stream) {
  // `event.type` might be text chunks or other item types
  if (event.type === "response.output_text.delta") {
    // Emit each chunk of text
    process.stdout.write(event.delta);
  }
}
```

This uses **Server-Sent Events (SSE)** behind the scenes and lets you print output incrementally like ChatGPT. ([OpenAI Platform][3])

---

## ✅ 4) **Handling Structured Output or JSON Schema**

If you want the model to output JSON that conforms to a schema (e.g., for function arguments), you can define structured output requests.

Example pattern:

```js
const response = await client.responses.create({
  model: "gpt-5.2",
  input: "Summarize the following chat into JSON with fields summary & actionItems:",
  text: {
    // Tell the model how to structure the output
    output_schema: {
      fields: [
        { name: "summary", type: "string" },
        { name: "actionItems", type: "array", items: { type: "string" } },
      ],
    },
  }
});

console.log(response.output_parsed);
```

You’ll need to map fields manually from the API response; include your schema type hints according to your own use case. ([OpenAI Platform][4])

---

## ✅ 5) **Using Tools (e.g., Web Search)**

To enable built-in tools like web search, include them in the `tools` array:

```js
const response = await client.responses.create({
  model: "gpt-5.2",
  input: "Find the latest info on Mars rover missions.",
  stream: true,
  tools: [
    { type: "web_search_preview" },
  ],
});
```

Built-in tools like web search are passed this way, and the model can choose to invoke them internally. ([OpenAI Platform][5])

---

## ✅ 6) **Streaming + Tools Together**

You can **stream text plus tool invocation hints**:

```js
const stream = await client.responses.create({
  model: "gpt-5.2",
  stream: true,
  input: "Search for and summarize the latest stock market news",
  tools: [
    { type: "web_search_preview" },
  ],
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "tool.call") {
    console.log("\n📡 Tool invocation:", event.tool.name);
  }
}
```

This prints text chunks and detects when the model invokes a tool. ([OpenAI Platform][5])

---

## ✅ 7) **Incremental Stateful Usage with `previous_response_id`**

To reduce tokens (send only new content), capture the last response’s ID and reuse it:

```js
// First call
const first = await client.responses.create({
  model: "gpt-5.2",
  input: "Translate this into French: 'Hello world!'",
});
const lastId = first.id;

// Next call referencing the previous
const followup = await client.responses.create({
  previous_response_id: lastId,
  input: "Also say it politely like a letter opening.",
});

console.log(followup.output_text);
```

Using a state pointer can **avoid replaying full history** each time. You’ll still need logic to reset when history editing occurs. ([OpenAI Platform][1])

---

## 🛠 Tips for Implementation

### ✅ **Parsing Streaming Events**

Streaming returns items like:

* `response.output_text.delta` — text chunks
* `tool.call` / `tool.return` — tool call events
* `structured_output` — JSON blocks

Make sure your event loop checks event types, else you may silently drop structured content (e.g., tool output or JSON schema). ([OpenAI Platform][3])

---

### ✅ **Error Handling**

Wrap API calls in try/catch and emit partial data where possible. For streaming, catch errors inside the async loop to avoid breaking open streams.

---

### ✅ **Security & API Key Management**

Never hard-code API keys. Use environment variables and secure key stores. Production best practices also include rate limits and monitoring API quota usage. ([OpenAI Platform][6])

---

## 📌 Summary Code Reference

Here’s a compact outline you can reuse:

```js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Streaming with tools
const stream = await client.responses.create({
  model: "gpt-5.2",
  stream: true,
  input: "Your query here",
  tools: [{ type: "web_search_preview" }],
});

for await (const ev of stream) {
  if (ev.type === "response.output_text.delta") {
    process.stdout.write(ev.delta);
  }
  // Add structured handlers for tool calls / JSON blocks here
}
```



[1]: https://platform.openai.com/docs/api-reference/responses?utm_source=chatgpt.com "Responses | OpenAI API Reference"
[2]: https://platform.openai.com/docs/libraries?utm_source=chatgpt.com "Libraries | OpenAI API"
[3]: https://platform.openai.com/docs/guides/streaming-responses?utm_source=chatgpt.com "Streaming API responses"
[4]: https://platform.openai.com/docs/guides/structured-outputs?utm_source=chatgpt.com "Structured model outputs | OpenAI API"
[5]: https://platform.openai.com/docs/guides/tools-web-search?utm_source=chatgpt.com "Web search | OpenAI API"
[6]: https://platform.openai.com/docs/guides/production-best-practices?utm_source=chatgpt.com "Production best practices | OpenAI API"
