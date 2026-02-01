# Streaming Tool Loops (Interleaved Tool Calls)

## Summary

Goal: support "stream until tool call -> stop -> run tools -> resume streaming" across all providers, while preserving thinking/text blocks and existing NDJSON UI streaming.

This keeps the familiar chat experience without streaming during tool execution, which is not a standard provider pattern.

---

## Proposed Event Model (Provider-agnostic)

Internal event types emitted by a streaming tool loop:

- `text`
- `thinking`
- `thinking_signature`
- `tool_call`
- `tool_result`
- `end`
- `error`

The API route continues to emit NDJSON chunks for `text`, `thinking`, `thinking_signature`, and `error`.

---

## Provider-specific Streaming Adapters

### OpenAI Chat Completions

1. Stream until a tool call delta appears.
2. Stop stream.
3. Execute tools.
4. Send tool results and resume streaming.
5. Repeat until no tool calls remain.

### OpenAI Responses

1. Stream response output.
2. On `function_call`, stop.
3. Execute tools.
4. Send `function_call_output`, resume.

### Anthropic

1. Stream SSE events.
2. On `tool_use`, stop.
3. Execute tools.
4. Send `tool_result`, resume.
5. Preserve thinking ordering.

### Gemini

1. Stream candidates.
2. On function call parts, stop.
3. Execute tools.
4. Send `functionResponse`, resume.

---

## Buffering and Persistence

- Buffer content blocks as they stream to build final `contentBlocks` and `content` for persistence.
- When a tool call is hit, end the current assistant stream for the UI, run tools, then resume with a new assistant stream.
- At completion, persist:
  - `contentBlocks`
  - `rawResponse`
  - `responseId` (OpenAI Responses)

---

## Error and Retry Behavior

- Tool failure should produce a tool error block (or end with error) and stop the loop.
- Model retries can be allowed by continuing the loop after returning tool errors.

---

## Tests

Per provider:

- `text -> tool_call -> text` sequence
- Thinking blocks preserved across the tool boundary
- Final persisted `contentBlocks` include thinking + text

---

## Rollout Notes

- Can be feature-flagged under existing `RT_CANVAS_TOOLS`.
- Keep current non-stream tool loops as fallback if needed.
