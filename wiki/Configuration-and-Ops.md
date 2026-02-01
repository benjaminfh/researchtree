# Configuration & Ops

## Core storage settings
- `RT_STORE=pg` (required for this wiki’s scope).
- `RT_PG_ADAPTER=supabase|local`.
- `LOCAL_PG_URL` (required for local PG adapter).

## Supabase settings
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for server-side token reads)

## Auth and admin
- `RT_ADMIN_USER_IDS` — comma-separated list of admin user IDs.
- `RT_WAITLIST_ENFORCE` — enable waitlist gating.

## LLM provider settings
- `LLM_ENABLE_OPENAI`, `LLM_ENABLE_GEMINI`, `LLM_ENABLE_ANTHROPIC`
- `OPENAI_USE_RESPONSES` — use OpenAI Responses API where supported.
- `OPENAI_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`
- `LLM_ALLOWED_MODELS_OPENAI`, `LLM_ALLOWED_MODELS_GEMINI`, `LLM_ALLOWED_MODELS_ANTHROPIC`

## Feature flags (UI)
- `NEXT_PUBLIC_RT_UI_EDIT_ANY_MESSAGE`
- `NEXT_PUBLIC_RT_UI_ATTACHMENTS`
- `NEXT_PUBLIC_RT_UI_RAIL_BRANCH_CREATOR`
- `NEXT_PUBLIC_RT_UI_COLLAPSED_BRANCH_TWO_NODES`
- `NEXT_PUBLIC_RT_UI_SHARE_MODE` (all/admins/hidden)
- `NEXT_PUBLIC_RT_GRAPH_EDGE_STYLE` (spline/orthogonal)

## Maintenance mode
- `RT_MAINTENANCE_MODE` (or `MAINTENANCE_MODE`) enables maintenance page/503.
- Admin users can bypass maintenance in UI.

## Local PG bootstrap
- `RT_PG_BOOTSTRAP=0` disables automatic local migrations.
- Health checks inspect `local_migrations` to confirm migration status.
