<!-- Copyright (c) 2025 Benjamin F. Hall
SPDX-License-Identifier: MIT -->

<div align="center">

# ResearchTree

<strong>Branchable contexts for human-led research.</strong>

![Docs](https://img.shields.io/badge/docs-pending-lightgrey)
![Release](https://img.shields.io/badge/release-pending-lightgrey)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
</div>

ResearchTree is a branchable workspace for LLM-powered resaearch: each workspace is a versioned reasoning tree with explicit branch/merge semantics. The premise is that git trees are the right storage pattern for building and refining context while exploring ideas, side quests, background questions.

The UI is built for exploring multiple lines of thought without poluting context, while keeping a retraceable breadcrumb trail of every message, branch, and merge.

## Highlights

- Branch-first chat + canvas with explicit merge summaries and diff previews.
- Graph view to explore the reasoning DAG and jump between nodes.
- Per-branch model/provider settings with optional thinking traces.
- Postgres (Supabase or local adapter) or git (local, deprecated) provenance backends.
- Electron desktop shell for local workflows.

## Documentation

- Docs site: pending.
- Release notes: pending.

## Product Tour (UI-First)

- Home (`/`)
  - Create a new workspace with a name + optional description.
  - Choose the default LLM provider for that workspace.
  - See recent workspaces, node counts, last touched time, and archive/unarchive to declutter the list.
- Workspace (`/projects/<id>`)
  - Chat stream with branch-aware history and a per-branch Canvas (editable markdown).
  - Branch controls: switch branches, create new ones, or branch directly from a message.
  - Merge flow: summarize what should come back to the target branch and preview the Canvas diff before merging.
  - Graph view: explore the reasoning DAG, jump to nodes, and pin Canvas diffs into context.
  - Stars: pin important messages; star filtering is supported in the graph view.
  - Thinking traces: show/hide model thinking content per message when available.
  - Provider controls: per-branch provider + model selection, plus a thinking mode selector.
  - Web search toggle (OpenAI search preview models) when enabled.
  - Share workspace (pg mode): invite collaborators as viewers or editors.
  - Edit locks (pg mode): branches can be locked to a single editor session to prevent write conflicts.
- Profile (`/profile`)
  - Store provider API keys for local use.
- Waitlist Admin (`/admin/waitlist`)
  - Review requests and approve emails when the invite gate is enabled.

## Quick Start

Prerequisites:
- Node.js 20+
- npm 10+
- git on PATH

Install:
```bash
npm install
```

### Configuration

`RT_STORE` is required. Choose one of the setups below and place it in `.env.local`.

Git-backed mode (lightweight, file-based):
```bash
RT_STORE=git
RESEARCHTREE_PROJECTS_ROOT=/absolute/path/to/data/projects
LLM_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Postgres mode (Supabase):
```bash
RT_STORE=pg
RT_PG_ADAPTER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RT_APP_ORIGIN=http://localhost:3000
RT_REF_LEASE_TTL_SECONDS=120
LLM_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Postgres mode (local adapter):
```bash
RT_STORE=pg
RT_PG_ADAPTER=local
LOCAL_PG_URL=postgresql://localhost:5432/youruser
RT_PG_BOOTSTRAP=1
RT_REF_LEASE_TTL_SECONDS=120
LLM_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Notes:
- `RT_PG_ADAPTER=local` must be used without Supabase env vars present.
- See `env.example` for the full list of optional toggles and defaults.

### Run the app

```bash
npm run dev
```

Then open:
```text
http://localhost:3000
```

## Architecture

### Ref Identity Tenets

Refs are mutable names pointing at commits; we rely on name-based refs by default to preserve git-like behavior.
When the app needs a stable join (e.g., artefact or lease tracking), use immutable `ref.id`.
Do not treat `ref.name` as an FK; resolve display labels from refs when needed.

### Conceptual Model

A workspace is a project with a versioned trail of nodes plus a per-branch Canvas.

- Nodes
  - Message nodes: user/assistant/system messages with optional thinking blocks and raw model payload.
  - State nodes: Canvas checkpoints.
  - Merge nodes: record source branch, summary, source commits, and Canvas diffs.
- Branches
  - Every message is tagged with the branch it was created on.
  - Branches carry their own provider/model/thinking defaults.
- Canvas
  - The markdown canvas is branch-local and never auto-merged.
  - Merges compute a diff; you can pin the diff into context intentionally.

### Storage Modes

ResearchTree supports two provenance backends, selected via `RT_STORE`:

- `git`
  - Each project is a git repo under `RESEARCHTREE_PROJECTS_ROOT`.
  - Files per project:
    - `nodes.jsonl` for the append-only message/merge/state log.
    - `artefact.md` for the Canvas.
    - `project.json` and `README.md` for metadata.
  - Git helpers live in `src/git` and are the canonical implementation for node + branch operations.
- `pg`
  - Uses Postgres for provenance, with Supabase PostgREST or a local adapter.
  - Supabase RPCs live under `src/store/pg` with migrations in `supabase/migrations`.
  - Collaboration features (members, invites, edit locks) are only available in pg mode.
  - Local mode (`RT_PG_ADAPTER=local`) connects directly to Postgres and auto-bootstraps migrations on first call.

### LLM Providers and Capabilities

Supported providers are OpenAI (chat or responses), Gemini, Anthropic, and Mock.

- Provider enablement and defaults are controlled via `LLM_ENABLE_*`, `LLM_DEFAULT_PROVIDER`, and model env vars.
- `OPENAI_USE_RESPONSES` defaults to true when unset; set it to false to force Chat Completions.
- Thinking modes are validated per provider/model based on shared capability metadata.
- Web search uses OpenAI Responses tools when enabled; if Responses is disabled, it falls back to OpenAI search-preview models.
- Optional server-side Canvas tool loop can be toggled with `RT_CANVAS_TOOLS`.

## Desktop App (Electron)

The Electron shell boots a local Next.js server and opens a native window.

- Dev mode: `npm run desktop:dev`
- Package: `npm run desktop:package`
- Build installers: `npm run desktop:make`

Desktop loads `.env.desktop` and then `.env.local` (excluding Supabase keys), so local Postgres is the default path.

## Repository Map

- `app/` Next.js route handlers and pages.
- `src/components/` UI components (workspace, graph, canvas, layout).
- `src/hooks/` data streaming and workspace state hooks.
- `src/git/` git-backed project store and node/branch helpers.
- `src/store/pg/` Postgres/Supabase store adapters and RPC access.
- `src/server/` auth, LLM streaming, request context, and utilities.
- `desktop/` Electron shell that hosts the Next.js app.
- `supabase/` database migrations for the Postgres store.
- `tests/` Vitest suites for git, store, and UI logic.

## Tests and Scripts

- `npm test` - run Vitest suites
- `npm run test:watch` - watch mode
- `npm run test:ui` - Vitest UI
- `npm run lint` - type-check and Supabase usage validation
- `npm run local:pg:bootstrap` - run local Postgres migrations manually

## Auth and Waitlist

Invite-gated auth is controlled by `RT_WAITLIST_ENFORCE`.

- When enabled, only allowlisted emails can sign up/sign in.
- `/admin/waitlist` is restricted to users listed in `RT_ADMIN_USER_IDS`.

## Troubleshooting

- `RT_STORE must be set to "git" or "pg"` means the env var is missing or misspelled.
- `RT_PG_ADAPTER=local cannot be used with Supabase env vars present` means you need to remove Supabase keys when using local mode.
- Provider errors usually indicate missing API keys; update them in `/profile`.

## Contributing

- Start by reading `AGENTS.md` for repo conventions.
- Open issues for bugs and feature requests; include clear repro steps and expected behavior.

## License

See `LICENSE`.

## Security

If you discover a security issue, please report it privately to the maintainers.
