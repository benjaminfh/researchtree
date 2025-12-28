# Canvas Tools Implementation Plan (v2.2)

## 1. Goals

* Enable the LLM to **inspect and edit the canvas safely and incrementally** via tool-calling.
* Avoid whole-canvas rewrites that amplify small model errors, obscure change intent, and degrade iterative stability.
* Eliminate brittle exact-text (“needle”) replacement.
* Preserve existing chat UX and content-block rendering.
* Support **all existing LLM providers** (OpenAI Chat, OpenAI Responses, Gemini, Anthropic) with **uniform tool semantics**.
* Provide **deterministic, race-free canvas editing** under streaming, retries, and user interruption.
* Keep canvas tool integration **modular and removable** (feature-flagged, low coupling).

---

## 2. Core Design Principles

### 2.1 Selection before generation

* Locating *where* to edit is harder and more failure-prone than generating replacement text.
* The model must **never be required to reproduce the target text verbatim**.
* All edits are **addressed** (line ranges, sections, grep results), not substring-based.

---

### 2.2 Markdown-first, structure-aware

* The canvas source format is **Markdown**.
* Headings, lists, and code fences act as **structural anchors**.
* JSON / block-AST representations are explicitly out of scope for v2.x.

---

### 2.3 Git-style failure semantics

* Writes are **all-or-nothing**.
* Partial or fuzzy patch application is disallowed.
* Failures must be surfaced to the model to force re-selection.

---

### 2.4 Exclusive canvas lease

* All canvas interactions (reads *and* writes) require an **exclusive lease**.
* The lease prevents interleaving user edits and agent edits.
* Leases are **short-lived**, auto-expiring, and renewed via heartbeat.
* User interaction always takes precedence.
* Canvas tooling can be disabled cleanly (no behavior changes to base chat flow).

---

## 3. Use Case Context

* The assistant reasons over a **canvas artefact** (Markdown document).
* Current system injects the full canvas into the prompt, but:

  * cannot inspect selectively
  * cannot edit incrementally
  * cannot retry edits safely
* Product intent: allow the assistant to behave like a **careful editor**, not a typist.

---

## 4. Canvas Lease Model (Critical)

### 4.1 Overview

Canvas access is governed by a **short-lived exclusive lease**.

Properties:

* One lease per canvas at a time
* Required for *all* canvas tools (read and write)
* Automatically expires
* Best-effort check-in
* Immediately cancelled by user action

This deliberately trades some parallelism for **deterministic correctness** in v2.

---

### 4.2 Lease Lifecycle

#### Acquire

Tool: `canvas_check_out`

Returns:

* `lease_id`
* `revision_id_at_checkout`
* `canvas_epoch`
* `expires_at`

Rules:

* If a lease is already held, checkout fails with `LOCK_NOT_AVAILABLE`.
* The model must not call any other canvas tools without a valid lease.

---

#### Renew (Heartbeat)

Tool: `canvas_renew_lease`

* Lease TTL is **15 seconds**.
* Lease renewal occurs on **server-observed agent activity**, not client streaming alone.

Heartbeat sources:

* tool call received
* tool result returned
* internal tool-loop step start/end
* streamed assistant chunk (if applicable)

This ensures:

* non-streamed tool loops do not lose the lease
* long-running edits remain safe

---

#### Release

Tool: `canvas_check_in` (best effort)

Release triggers:

1. Explicit `canvas_check_in`
2. Tool loop completion (server-side)
3. Lease TTL expiry
4. User message or user stream cancel (immediate, forced)

---

### 4.3 User Preemption (Hard Rule)

Any of the following **immediately cancels the lease**:

* a new user message
* user stream cancel / abort

Effects:

* lease invalidated
* `canvas_epoch` incremented
* any in-flight or subsequent canvas writes from the agent fail with `STALE_EPOCH`

This guarantees **user always wins**.

---

## 5. Tool Set and Semantics

### 5.1 Tool Inventory

#### `canvas_check_out`

Acquire exclusive canvas lease.

---

#### `canvas_renew_lease`

Renew existing lease (heartbeat).

---

#### `canvas_check_in`

Release lease early (best effort).

---

#### `canvas_grep`

Locate candidate edit regions.

Inputs:

* `lease_id`
* `query` (string or regex)

Outputs:

* matched lines:

  * line numbers (1-based)
  * matched text
* `revision_id`

---

#### `canvas_read_lines`

Inspect a bounded region.

Inputs:

* `lease_id`
* `start_line` (1-based, inclusive)
* `end_line` (1-based, inclusive)

Outputs:

* text
* `revision_id`

---

#### `canvas_read_all`

Read entire canvas (discouraged fallback).

Inputs:

* `lease_id`

---

#### `canvas_apply_patch`

Apply edits.

Inputs:

* `lease_id`
* `patch` (unified diff)
* optional `base_revision_id`

Semantics:

* All hunks must apply cleanly
* No fuzzy matching
* No partial application

Outputs:

* `ok` (boolean)
* `applied_hunks`
* `new_revision_id`

Failure codes:

* `LOCK_NOT_OWNED`
* `LEASE_EXPIRED`
* `STALE_EPOCH`
* `PATCH_REJECTED`

---

## 6. Addressing Rules (Mandatory)

Allowed:

* line ranges
* section headers (`##`, `###`)
* list item indices within a section
* grep-derived locations

Disallowed:

* raw substring replacement
* “replace the paragraph that starts with…”

The model must:

1. Locate
2. Inspect
3. Edit

Never skip the locate step.

---

## 7. State and Revision Guarantees

* Every canvas tool operates against a **specific revision**.
* Tool responses always include `revision_id`.
* Line numbers are **not stable across revisions**.
* After any write:

  * the model must re-read if it needs to reason about new state
* Writes fail if:

  * lease invalid
  * epoch mismatched
  * hunks do not apply cleanly

---

## 8. Storage Backends

### 8.1 PG Mode

* Reads: `rt_get_canvas_v1`
* Writes: `rt_save_artefact_draft`
* Promotion (draft -> artefacts): `rt_append_node_to_ref_v1` with `attachDraft: true`
* Only promote when a **non-empty diff** exists between draft and last committed artefact
* Diff detection should be **hash-based** via a lightweight RPC returning both `draft_hash` and `artefact_hash`
* Lease + epoch stored in PG

---

### 8.2 Git Mode

* Canvas tools **disabled** in Git mode for v2.x.
* Canvas tool loop should short-circuit with a clear error if Git mode is active.

Backend differences are invisible to the model.

---

## 9. LLM Provider Tool Loops

### 9.1 Unified Internal Event Model

All provider outputs are normalized internally to:

```
{
  role,
  type,
  content,
  tool_name?,
  tool_result?,
  revision_id?,
  lease_id?
}
```

This avoids provider-specific leakage.

---

### 9.2 Provider Handling

* **OpenAI Chat Completions**

  * `tools`, `tool_calls`, `tool` role
* **OpenAI Responses**

  * parse `response.output[]`
  * handle `function_call` / `function_call_output`
* **Gemini**

  * `response.functionCalls()`
  * respond with `functionResponse` parts
* **Anthropic**

  * parse `tool_use`
  * respond with `tool_result`
  * preserve thinking ↔ tool ordering

Tool loop continues until:

* no tool calls remain, or
* max steps reached, or
* user interruption occurs

---

## 10. Streaming and Execution Strategy

* Default: **non-streamed tool loop**
* Streaming resumes after tool loop completes
* Lease is **not** held during narrative-only streaming

This keeps leases short and predictable.

---

## 11. Prompting and Context

System prompt must:

* Enumerate canvas tools
* Explain lease requirement
* Instruct:

  * “Do not retype target text”
  * “Always locate before editing”
  * unified diff expectations
* Warn about line-number drift
* State that user interruption cancels edits

Prompt must remain concise.

---

## 12. Canvas Updates in Context (Model-Break Safe)

Canvas changes must be persisted as **hidden user messages** that are safe to pass across provider/model boundaries.

Format:

* A short, fixed instruction header.
* The unified diff wrapped in **triple backticks**.

Example payload:

````
Canvas update (do not display to user). Apply this diff to your internal canvas state:
```diff
@@ -1,3 +1,3 @@
-old line
+new line
```
````

These messages are:

* Not rendered in the UI.
* Included in `buildChatContext` for all providers.
* Pure text only (no provider-specific thinking data).

---

## 13. Timing of Canvas Diff Messages

* User edits: append hidden diff **once** when the user sends a message (not on autosave).
* Assistant edits: append hidden diff **once** at the end of the assistant turn.
* Autosave continues to update `artefact_drafts` only.

---

## 14. UX Requirements

* While lease is held:

  * canvas shows **visual lock indicator** (e.g. red outline/shading)
  * tooltip: “Assistant editing canvas…”
* User edit attempts:

  * blocked
  * optional “Take control” action (sends cancel)
* Lease cancellation on user input is immediate and visible

---

## 15. Modularity and Rollback

* Canvas tools are feature-flagged and can be disabled without affecting base chat.
* Tool definitions and execution live in isolated modules.
* Chat route chooses tool-loop only when the feature is enabled.

---

## 16. Incremental Rollout Plan

Stage 0: Plumbing + visibility

* Feature flag and isolated canvas tool module (no lease enforcement).
* Persist hidden canvas-update user messages for user edits only.
* Include hidden canvas-update messages in `buildChatContext`.

Stage 1: Read-only tools

* Implement `canvas_grep`, `canvas_read_lines`, `canvas_read_all`.
* Include `revision_id` in tool responses (hash-based).

Stage 2: Write tools (no leases)

* Implement strict `canvas_apply_patch`.
* On success, append hidden diff message for assistant edits.
* Promote draft to artefacts **only if diff exists** (hash compare).

Stage 3: Lease schema + RPCs

* Add lease tables/RPCs (check-out, renew, check-in) + epoch handling.
* Gate enforcement behind feature flag.

Stage 4: Enforce leases + UX

* Require lease for all canvas tools.
* Auto-renew during tool loop; cancel on user interrupt.
* Add UI lock indicator and “Take control” action.

---

## 17. Non-Goals (v2.x)

* AST / schema-aware editing
* Block IDs in Markdown
* Multi-canvas edits
* Concurrent agent editors
* Streaming tool edits
* Semantic refactors
* Auto-commit from tool loop

---

## 18. Summary

This v2.2 design:

* Eliminates brittle needle matching
* Prevents interleaving edits via short-lived leases
* Treats the LLM as a **planner and editor**, not a typist
* Preserves provenance, locality of change, and user trust
* Provides a clean path toward block-level and multi-agent editing in v3
