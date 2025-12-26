# Thinking Data Model (Canonical + Raw) — 2025-12-23

This doc describes the **new thinking‑data model** and related flows added in this session. It is intended for engineers implementing new providers (e.g. `openai_responses`) who need to integrate with our canonical model, raw payload storage, context assembly, and UI.

Scope:
- Canonical storage (`contentBlocks`) vs raw provider payloads (`rawResponse`).
- Context building rules (same‑model uses raw, model‑break uses canonical).
- Streaming behavior (UI + server).
- Branch/provider/model locking.
- Key helpers, APIs, and schema changes.

## Core Concepts

### 1) Two data sources per assistant message
We store **both** of the following on assistant nodes:
- **Canonical blocks** (`contentBlocks`): provider‑agnostic, ordered list of blocks used primarily for UI display and fallback context after a model break.
- **Raw provider response** (`rawResponse`): exact payload (or SSE events) captured from the provider, used for same‑model context building.

Additional fields:
- `content`: plain text derived from blocks for legacy compatibility.
- `modelUsed`: the model name used to produce the assistant message.
- `createdOnBranch`: used for model‑break detection.

### 2) Ordering is sacred
We **never** reorder provider payloads or blocks. All blocks are persisted and streamed in the **exact order** received from the provider.

### 3) Branch‑locked model
Branches are locked to **provider + model** at branch creation time. When a provider/model changes, it must be a new branch. This ensures same‑model context assembly can faithfully reuse raw payloads.

## Canonical Block Types

Canonical blocks are stored as `ThinkingContentBlock[]` in `contentBlocks`. We support:

```
type ThinkingContentBlock =
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'thinking_signature'; signature: string }
  | { type: 'text'; text: string }
  | { type: string; [key: string]: unknown };
```

Important details:
- **Thinking text** lives in `type: 'thinking'` blocks.
- **Signatures** are stored as `type: 'thinking_signature'` (or `signature` on `thinking` for Anthropic, normalized by helpers).
- **UI** only shows thinking text (collapsed). Signatures are never displayed.
- When canonical blocks are derived from raw payloads, their order mirrors raw ordering.

Helper types: `src/shared/thinkingTraces.ts`
- `ThinkingContentBlock`, `ThinkingTrace`, `MessageContent`
- `getContentBlocksWithLegacyFallback`
- `deriveTextFromBlocks`, `deriveThinkingFromBlocks`

## Raw Response Storage

We capture full provider responses for assistant messages:
- **OpenAI (chat completions)**: raw stream chunks array.
- **Gemini**: `{ stream: [...], response: {...} }`.
- **Anthropic**: array of `{ event, data }` SSE events.

Raw responses live in:
- `node.rawResponse` (app node content JSON)
- Postgres `public.nodes.raw_response` (added in `supabase/migrations/2025-12-23_0001_rt_nodes_raw_response.sql`, but rolled back in prod as of now).

## Provider‑specific Semantics

### OpenAI (chat completions)
- No thinking text or signatures.
- Canonical blocks contain only text.
- Raw → canonical: parse `choices[].delta.content` (string or array blocks).

### Gemini
- Provides `thought` text blocks **and** a `thoughtSignature` (optional).
- Canonical blocks include:
  - `thinking` blocks for `thought: true` text.
  - `text` blocks for normal text.
  - `thinking_signature` blocks for `thoughtSignature`.
- Context rule: **same‑model context excludes Gemini `thinking` text blocks**, but includes final text + signatures.
- Full raw payload must be stored (for debugging / drift).

### Anthropic (Messages API with thinking)
- Streaming provides `thinking_delta` and `signature_delta` events.
- Canonical blocks include `thinking` blocks that may have `signature`, and `text` blocks.
- Context rule: if signatures are present, **strip thinking text and pass only signatures + text** to preserve continuity without leaking.

## Context Assembly Rules

### Same‑model context (current branch, before any model break)
Use raw payloads to build context **without modification** (except provider‑specific redaction rules below). This avoids data loss and preserves API‑specific structure.

### Model‑break context (upstream branch with different provider/model)
Use **canonical plain text** only (derived from `contentBlocks`). This is intentionally lossy but safe.

### How model‑break is detected
We traverse from newest to oldest node and stop at the first assistant node whose `createdOnBranch` is locked to a different `{provider, model}` than the current branch. Everything **before** that point uses canonical text fallback.

Implementation: `src/server/context.ts`
- `buildCanonicalMask(...)` determines which nodes should use canonical fallback.
- `buildRawContextContent(...)` uses raw payloads for same‑model nodes.
- `buildLegacyContextContent(...)` uses canonical text for model‑break nodes.

### Provider‑specific context rules
Implemented in `src/server/llmContentBlocks.ts`:
- `buildContextBlocksFromRaw(...)` returns blocks for context:
  - **Gemini**: drop `thinking` blocks, keep `text` + `thinking_signature`.
  - **Anthropic**: strip `thinking` text if signatures are present (`stripThinkingTextIfSignature`).
  - **OpenAI**: keep text only.

## Streaming and Persistence Flow

### Stream to UI
Server emits NDJSON chunks with ordered blocks:
- `type: "thinking" | "thinking_signature" | "text"`
UI appends in order and renders thinking collapsed by default.

Paths:
- `app/api/projects/[id]/chat/route.ts`
- `app/api/projects/[id]/edit/route.ts`
- `src/hooks/useChatStream.ts`
- `src/components/workspace/WorkspaceClient.tsx`

### Persist assistant messages
On completion:
1) `rawResponse` is captured from the provider stream.
2) Canonical `contentBlocks` are built from raw (`buildContentBlocksForProvider`).
3) `content` text is derived for legacy uses (`deriveTextFromBlocks`).
4) Node is written with `content`, `contentBlocks`, `rawResponse`, and `modelUsed`.

Paths:
- `src/server/llm.ts` (provider streaming + raw capture)
- `src/server/llmContentBlocks.ts` (raw → canonical)
- `app/api/projects/[id]/chat/route.ts`
- `app/api/projects/[id]/edit/route.ts`
- `src/store/pg/nodes.ts` (PG RPC call)

## Branch/Model Locking

### Where provider+model live
**Postgres**:
- `public.refs` includes `provider`, `model` columns (see `supabase/migrations/2025-12-23_0002_rt_refs_llm_config.sql`).
- `rt_list_refs_v1` returns `provider`, `model`.
**Git mode**:
- `.git/rt-branch-config.json` stores `{ branchName: { provider, model } }`.
- Read/write helpers in `src/git/branchConfig.ts`.

### API changes
Branch creation now accepts optional provider/model in the request:
```
POST /api/projects/:id/branches
body: { name, fromRef, provider?, model? }
```
Edit branching also passes provider/model:
```
POST /api/projects/:id/edit
body: { ..., llmProvider?, llmModel?, ... }
```

Lock enforcement (chat):
- `app/api/projects/[id]/chat/route.ts` validates the requested provider against the branch lock.
- If mismatch, request fails and instructs to create a new branch.

### UI changes
Provider selection is now **branch‑scoped** and read‑only for existing branches. Provider/model are displayed but not switchable in the active chat header.

Paths:
- `src/components/workspace/WorkspaceClient.tsx`

## Helper Functions / Files (Quick Reference)

Canonical blocks + thinking helpers:
- `src/shared/thinkingTraces.ts`
  - `getContentBlocksWithLegacyFallback`
  - `deriveTextFromBlocks`, `deriveThinkingFromBlocks`
  - `stripThinkingTextIfSignature`

Raw → canonical / context blocks:
- `src/server/llmContentBlocks.ts`
  - `buildContentBlocksForProvider` (raw → canonical)
  - `buildContextBlocksFromRaw` (raw → context, provider‑specific redactions)

Context assembly:
- `src/server/context.ts`
  - `buildChatContext`
  - `buildCanonicalMask`

Branch config:
- `src/server/branchConfig.ts` (readable branch config map for both stores)
- `src/git/branchConfig.ts` (git storage in `.git`)

LLM streaming + raw capture:
- `src/server/llm.ts`
  - `streamAssistantCompletion(...)` now accepts `model` override.
  - Provider‑specific stream handling emits `raw_response` chunk.

## Data Flow Summary

### A) Provider response → storage
```
provider stream → rawResponse
rawResponse → contentBlocks (canonical)
contentBlocks → content (plain text)
node{ content, contentBlocks, rawResponse, modelUsed }
```

### B) Context for a new turn
```
current branch provider/model
→ scan nodes backward
→ before model break: rawResponse → provider-specific context blocks
→ after model break: contentBlocks → plain text
```

### C) UI rendering
```
contentBlocks (canonical) → render text + optional thinking (collapsed)
```

## Notes for New Provider (`openai_responses`)

You will need:
1) **Raw response capture**: store full Responses API payload (stream chunks + final response).
2) **Canonical block builder**: implement raw → `contentBlocks` mapping.
   - If Responses API returns structured content, map to `text` blocks and (if applicable) `thinking`/`thinking_signature`.
3) **Context block builder**: implement provider‑specific context rules in `buildContextBlocksFromRaw`.
4) **Branch lock**: ensure your provider uses branch‑locked `provider` + `model` and passes `model` to `streamAssistantCompletion`.
5) **UI**: no changes needed unless the provider introduces new block types.

Where to integrate:
- `src/server/llm.ts` (streaming + raw capture)
- `src/server/llmContentBlocks.ts` (raw → canonical + raw → context)
- `src/shared/llmProvider.ts` (add provider id)
- `src/shared/llmCapabilities.ts` (models + defaults)
- `src/server/llmConfig.ts` (env config)
- `src/server/context.ts` (provider-specific context rules, if required)

## Q&A (Design Decisions and Open Questions)

### Schema & Storage

Q: Is `public.nodes.raw_response` staying in the schema (re-apply the rolled-back migration), or should we gate raw storage behind feature flags until prod is ready?  
A: The intended state is **yes, keep `raw_response`** and re-apply the migration. If rollout risk is a concern, we can gate **writes** behind a feature flag while keeping the column available. Reads should tolerate `null`.

Q: What is the expected JSON shape/versioning for `rawResponse`, and do we need a formal schema to avoid drift?  
A: **No formal schema today.** `rawResponse` is stored as **provider-native, opaque JSON**. We rely on provider-specific handlers to interpret it. If drift becomes painful, we can add a lightweight envelope later (e.g. `{ provider, capturedAt, version, payload }`).

Q: For git mode, is `rt-branch-config.json` already present in prod repos, or do we need a backfill step?  
A: It is created for **new projects and new branches** only. Existing repos without the file will **fallback to defaults** via `resolveBranchConfig()`. A backfill is optional, not required for correctness.

Q: Do we also want `contentBlocks` persisted in PG as a first-class column?  
A: **No.** `contentBlocks` live inside `nodes.content_json`. That is the canonical store. A separate column would be pure duplication without clear payoff.

### Branch Locking & Migration

Q: How should existing branches be initialized with provider/model?  
A: If `refs.provider/model` are empty, `resolveBranchConfig()` uses defaults (env-configured provider + default model). There is **no inference from nodes** today.

Q: If a branch has no assistant messages yet, what should its lock be?  
A: It should still be locked at creation time to **provider + model**, using defaults or explicit input.

Q: When creating a branch from `fromRef`, should provider/model always inherit from the source branch unless explicitly overridden?  
A: **Yes.** That is how `resolveBranchConfig()` is used in `createBranch` and PG RPCs.

Q: If the client sends `llmProvider` without `llmModel`, should the server fill model from branch lock or default config?  
A: **Default config** for the chosen provider, unless it matches the source branch provider, in which case we **inherit the branch model**. This matches `resolveBranchConfig()` behavior.

### Streaming & UI Contract

Q: Is NDJSON “content block” streaming already in place on main, or is that an intended future change?  
A: It is **implemented in this branch** (`app/api/projects/[id]/chat/route.ts` + `useChatStream`). It emits NDJSON lines of content blocks. It is not on `main` unless merged.

Q: For streaming: should we emit canonical blocks only, or also a raw event stream for debugging?  
A: We **only emit canonical blocks** (thinking/text/signature). Raw streams are stored server-side (`rawResponse`) and **not** streamed to the client.

Q: What is the exact wire format for streaming chunks?  
A: NDJSON lines with:
```
{ "type": "text" | "thinking" | "thinking_signature", "content": string, "append"?: boolean }
```
`append` is used for thinking deltas; text deltas are appended implicitly client-side.

Q: If a stream is interrupted, do we persist partial `rawResponse` + partial `contentBlocks`, or drop raw and only keep accumulated text?  
A: We **persist partial contentBlocks and any captured rawResponse**. If raw capture is incomplete, it is still stored as-is and treated as opaque.

### OpenAI Responses Mapping

Q: Which Responses event types should be mapped into canonical blocks and stored?  
A: **At minimum:** text deltas → `text` blocks. If Responses exposes reasoning/thinking, map to `thinking`/`thinking_signature` blocks. Tool calls/results should be stored as **custom block types** (or left in raw only), depending on UI needs.

Q: For “store them but render only a whitelist”: what is the whitelist of block types to render?  
A: **Render:** `text` and `thinking` (thinking collapsed by default).  
**Never render:** `thinking_signature`.  
**Custom blocks:** do not render unless the UI explicitly supports them.

Q: If Responses emits reasoning or “thinking” content, should we store it as thinking blocks but exclude it from context assembly (like Gemini)?  
A: **Yes, by default.** Store full thinking for UI, but **strip** from context if signatures exist or if provider policy requires it. This mirrors Gemini/Anthropic behavior today.

Q: How should tool call outputs be represented canonically?  
A: Prefer **custom block types** (e.g. `tool_call`, `tool_result`) to preserve structure, but keep them **UI-hidden** unless explicitly handled. Raw payload remains the source of truth.

### Context Assembly & Statefulness

Q: For same-model context with Responses: do we plan to feed raw Responses output items back into input, or synthesize input from canonical blocks?  
A: **Raw payloads** should be used for same-model context to preserve structure. Canonical blocks are only used **after a model break**.

Q: Does `previous_response_id` live on assistant nodes, on branch config, or in a separate per-branch store?  
A: **Not implemented yet.** Preferred: store per-branch state (PG + git) or on the latest assistant node for that branch. Either is acceptable, but it must be branch-scoped.

Q: When a branch forks via edit, should `previous_response_id` reset to null even if provider/model stays the same?  
A: **Yes.** A fork is a new lineage; treat it as a fresh Responses chain unless we explicitly decide to clone that state.

Q: If Responses is enabled but `previous_response_id` is missing, do we always fall back to full context?  
A: **Yes.** Use full context assembly from history; do not attempt partial incremental with missing state.

### Provider Identity

Q: Should Responses be a new provider id (`openai_responses`) or remain under `openai` with feature flags?  
A: **Recommend a new provider id** (`openai_responses`) to keep payload handling and context rules explicit. Feature flags can still gate availability without conflating request/response shapes.

## Repo Notes: DB Migrations

- Migrations live in `supabase/migrations/` and are applied via GitHub Actions on **push to `master`** only.
- The workflow is `.github/workflows/supabase-migrations.yml` and uses `supabase db push`.
- PRs do **not** run migrations (no required status check). Migrations are applied **post-merge**.
