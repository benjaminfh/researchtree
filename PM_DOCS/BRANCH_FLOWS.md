# Branch Flows

This doc summarizes how branching paths 1-4 behave across providers, provider switches, and stream vs non-stream mode.

Legend:
- Mode: whether the path uses the stream or non-stream handler.
- State carry: whether OpenAI Responses `previous_response_id` is preserved.
- Context: what is sent on the first completion on the new branch.
- Sigs in context: whether thinking signatures are preserved in the context payload.

Notes:
- OpenAI (non-Responses) does not use response IDs; full history is always replayed.
- Gemini: context drops thinking text but keeps signatures when raw blocks are available.
- Anthropic: if signatures exist, thinking text is stripped; signatures remain.
- Provider switches often fall back to plain text history, which drops signatures.
- Stream vs non-stream: Path 2 uses `/edit` (non-stream) or `/edit-stream` (stream). Other paths are non-stream today.

## Path 1: Branch from tip

| Provider | Flow | Mode | State carry | Context on first call | Sigs in context |
| --- | --- | --- | --- | --- | --- |
| OpenAI | same | non-stream | N/A | full history replay | N/A |
| OpenAI | switch | non-stream | N/A | full history replay | N/A |
| OpenAI Responses | same | non-stream | yes (branch `previous_response_id`) | last user only | N/A |
| OpenAI Responses | switch | non-stream | no | full history replay | N/A |
| Gemini | same | non-stream | N/A | full history replay | keep sigs, drop thinking |
| Gemini | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |
| Anthropic | same | non-stream | N/A | full history replay | keep sigs, drop thinking if sigs exist |
| Anthropic | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |

## Path 2: Edit user message (branch from parent)

| Provider | Flow | Mode | State carry | Context on first call | Sigs in context |
| --- | --- | --- | --- | --- | --- |
| OpenAI | same | non-stream | N/A | full history replay | N/A |
| OpenAI | switch | non-stream | N/A | full history replay | N/A |
| OpenAI Responses | same | non-stream | yes (parent assistant `responseId`) | last user only | N/A |
| OpenAI Responses | switch | non-stream | no | full history replay | N/A |
| Gemini | same | non-stream | N/A | full history replay | keep sigs, drop thinking |
| Gemini | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |
| Anthropic | same | non-stream | N/A | full history replay | keep sigs, drop thinking if sigs exist |
| Anthropic | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |
| OpenAI | same | stream | N/A | full history replay | N/A |
| OpenAI | switch | stream | N/A | full history replay | N/A |
| OpenAI Responses | same | stream | yes (parent assistant `responseId`) | last user only | N/A |
| OpenAI Responses | switch | stream | no | full history replay | N/A |
| Gemini | same | stream | N/A | full history replay | keep sigs, drop thinking |
| Gemini | switch | stream | N/A | full history replay | sigs likely dropped (fallback text) |
| Anthropic | same | stream | N/A | full history replay | keep sigs, drop thinking if sigs exist |
| Anthropic | switch | stream | N/A | full history replay | sigs likely dropped (fallback text) |

## Path 3: Branch after assistant message

| Provider | Flow | Mode | State carry | Context on first call | Sigs in context |
| --- | --- | --- | --- | --- | --- |
| OpenAI | same | non-stream | N/A | full history replay | N/A |
| OpenAI | switch | non-stream | N/A | full history replay | N/A |
| OpenAI Responses | same | non-stream | yes (selected assistant `responseId`) | last user only | N/A |
| OpenAI Responses | switch | non-stream | no | full history replay | N/A |
| Gemini | same | non-stream | N/A | full history replay | keep sigs, drop thinking |
| Gemini | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |
| Anthropic | same | non-stream | N/A | full history replay | keep sigs, drop thinking if sigs exist |
| Anthropic | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |

## Path 4: Ask question of assistant message (highlight + question)

Branch is created from the selected assistant message and adds a pre-baked user message
containing the highlight and question (flattened to plain text). If staying on OpenAI
Responses, it should carry `previous_response_id` from the touched assistant message.

| Provider | Flow | Mode | State carry | Context on first call | Sigs in context |
| --- | --- | --- | --- | --- | --- |
| OpenAI | same | non-stream | N/A | full history replay | N/A |
| OpenAI | switch | non-stream | N/A | full history replay | N/A |
| OpenAI Responses | same | non-stream | yes (selected assistant `responseId`) | last user only | N/A |
| OpenAI Responses | switch | non-stream | no | full history replay | N/A |
| Gemini | same | non-stream | N/A | full history replay | keep sigs, drop thinking |
| Gemini | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |
| Anthropic | same | non-stream | N/A | full history replay | keep sigs, drop thinking if sigs exist |
| Anthropic | switch | non-stream | N/A | full history replay | sigs likely dropped (fallback text) |
