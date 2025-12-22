# Thinking Traces / Reasoning Content

This doc summarizes how major providers expose (or hide) model thinking traces and how we should handle them in ResearchTree. It also includes a 1-page implementation plan.

Note: I could not verify provider docs live due to restricted network access. Items below reflect best-effort understanding and should be confirmed against current provider documentation.

## Provider behavior summary (best-effort)

### OpenAI
- Reasoning models use hidden "reasoning" tokens; chain-of-thought is not returned to clients.
- Responses API provides reasoning controls (e.g., `reasoning.effort`) but does not expose full thinking traces.
- Practical impact: we only get final answer content plus metadata; no persistent trace to store.

### Google Gemini
- Models may return only a summary of thinking or none at all; full traces are not generally available.
- Some responses can include brief "thoughts" or reasoning summaries when enabled.
- Practical impact: treat any returned thinking content as partial and best-effort; store summaries when present.

### Anthropic Claude
- When "thinking" is enabled, responses can include a `thinking` content block.
- Output may be redacted or truncated depending on model and safety settings.
- Practical impact: store `thinking` blocks when provided, but do not assume they are complete or always present.

## Data model and storage

- Extend node records to include `thinking` metadata with:
  - `provider`: `openai | gemini | anthropic | unknown`
  - `availability`: `none | summary | full | redacted | partial`
  - `content`: string or array of content blocks
  - `raw`: provider-native payload (optional, if size allows)
- Persist thinking content alongside message content in `nodes.jsonl`.
- Treat thinking as non-authoritative: never re-inject into prompts automatically unless explicitly requested.

## 1-page implementation plan

### 1) Provider capability detection
- Map provider + model family to a `thinking_availability` enum.
- Default to `none` when unknown or unsupported.

### 2) Ingestion adapters
- OpenAI: parse response metadata only; leave `thinking` empty.
- Gemini: capture any "thoughts"/summary fields if present.
- Anthropic: capture `thinking` content blocks and mark `availability` as `partial` or `redacted` if flagged.

### 3) Persistence and limits
- Store thinking content with a size cap (e.g., 32-64 KB per node) to avoid repo bloat.
- If over cap, truncate and record `availability = partial`.
- Keep raw payloads behind a feature flag if needed.

### 4) UI/UX exposure
- Show thinking as a collapsible, read-only panel per node.
- Default hidden; add explicit "Include in context" toggle.
- Display a badge: `Hidden by provider`, `Summary only`, `Redacted`, `Partial`.

### 5) Context assembly rules
- Exclude thinking from prompt assembly by default.
- Allow manual inclusion for debugging or audit trails with clear warnings.

### 6) Telemetry and auditing
- Log availability stats per provider/model to confirm real-world behavior.
- Add a lightweight diagnostics view for trace availability coverage.

### 7) Verification checklist
- Confirm OpenAI: no chain-of-thought in Responses API for reasoning models.
- Confirm Gemini: whether "thoughts" summaries are supported and in which API fields.
- Confirm Anthropic: exact structure of `thinking` blocks, and whether redaction flags are provided.

