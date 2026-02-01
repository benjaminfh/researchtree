# LLM Pipeline

## Overview
Chat, edits, and merges flow through the same LLM infrastructure. Providers are configured via env and per-branch settings.

## Key modules
- `src/server/llm.ts`: Provider routing, streaming completions, and tool loops.
- `src/server/llmConfig.ts`: Provider enablement, allowed models, defaults.
- `src/server/llmUserKeys.ts`: Fetches user API keys from PG vault.
- `src/server/llmState.ts`: Tracks previous response IDs (OpenAI Responses).
- `src/server/providerCapabilities.ts`: Computes token limits and caches them.
- `src/server/context.ts`: Builds chat context + system prompt.
- `src/server/llmContentBlocks.ts`: Converts raw provider responses into content blocks.
- `src/shared/llmCapabilities.ts`: Model lists + thinking validation.
- `src/shared/thinking.ts`: Thinking level translations by provider.

## Streaming model
- Chat and edit endpoints stream NDJSON chunks (`text`, `thinking`, `thinking_signature`, `error`).
- `useChatStream` consumes NDJSON and updates UI incrementally.

## Thinking levels
- Per-provider validation and translation.
- Gemini 3 vs Gemini 2.5 behavior differs (thinking level vs thinking budget).

## Canvas tools
- When enabled (`RT_CANVAS_TOOLS=true` in PG mode), the LLM can call:
  - `canvas_grep`, `canvas_read_lines`, `canvas_read_all`, `canvas_apply_patch`.
- Tools are implemented in `src/server/canvasTools.ts`.

## Merge/ack flows
- Merge endpoints optionally generate a hidden "Merge received" acknowledgment.
- This keeps the model’s context consistent with merge payloads.
