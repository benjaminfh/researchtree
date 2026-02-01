# Threds Web App Wiki

## What this wiki covers
- Web app only (Next.js app + API routes).
- Postgres storage (Supabase or local PG adapter).
- Auth, waitlist, workspace UI, and LLM pipeline.

## What this wiki does not cover
- Git-backed storage mode (`src/git/**`).
- Desktop/Electron app (`desktop/**`).

## Quick links
- User flows: `User-Flows`
- Web app architecture: `Web-App-Architecture`
- API reference: `API`
- Postgres data store: `Postgres-Data-Store`
- LLM pipeline: `LLM-Pipeline`
- Configuration & ops: `Configuration-and-Ops`

## High-level architecture
- **UI**: Next.js app routes under `app/` and React components in `src/components/`.
- **API**: Next.js route handlers under `app/api/`.
- **Server logic**: `src/server/` (auth, LLM, canvas, branch operations).
- **Data layer**: `src/store/pg/` (RPC wrappers) + Supabase clients in `src/server/supabase/`.

## Conventions to keep in mind
- All text forms submit on Cmd+Enter when valid (`useCommandEnterSubmit`).
- Icons are sourced through Blueprint icon helpers (`BlueprintIcon`, `HeroIcons`).
- Ref identity: prefer ref names for display; use ref IDs only for stable joins.

## Where this wiki came from
- Derived from code inspection as of 2026-02-01.
- See `PM_DOCS/WEB_UI_PATHS.md` and `PM_DOCS/WEB_CODE_WALKTHROUGH.md` for deeper notes.
