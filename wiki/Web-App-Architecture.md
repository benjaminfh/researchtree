# Web App Architecture

## Overview
- **Framework**: Next.js (app router, server components + route handlers).
- **UI**: React components in `src/components/`.
- **API**: Next.js route handlers in `app/api/`.
- **Server logic**: `src/server/` (auth, LLM, chat context, branching, merges, canvas tools).
- **Data layer**: `src/store/pg/` RPC wrappers + Supabase/local PG adapters.

## Request flow (typical)
1. UI triggers a route handler (e.g., `/api/projects/:id/chat`).
2. Route handler validates payload (`src/server/schemas.ts`).
3. Auth + authorization checks (`src/server/auth.ts`, `src/server/authz.ts`).
4. Server logic executes (locks, leases, LLM, merges, canvas tools).
5. Data stored via PG RPC wrappers (`src/store/pg/*`).
6. UI updates using SWR hooks and streaming NDJSON responses.

## UI structure
- **Rail layout**: `RailLayout` / `RailPageLayout` with collapsible rail.
- **Home**: `HomePageContent` + `CreateProjectForm`.
- **Workspace**: `WorkspaceClient` (chat, branches, graph, canvas, merge).
- **Profile**: `ProfilePageClient` (tokens + password).

## Data model conventions
- **Ref identity**: ref names are default identifiers; ref IDs are only for stable joins.
- **Branch config**: provider/model tracked per ref (PG reads + `branchConfig.ts`).
- **Canvas**: draft + artefact stored as PG artefacts (`canvas_md`).

## Security and auth
- **Middleware** (`middleware.ts`) enforces auth for protected pages and handles maintenance mode.
- **Supabase** sessions handled via SSR clients in `src/server/supabase/`.
- **Local PG mode** simulates auth with a fixed local user ID.

## Storage modes
- **PG mode (supported)**: Supabase or local PG adapter via `RT_PG_ADAPTER`.
- **Git mode**: exists but intentionally not covered in this wiki.
