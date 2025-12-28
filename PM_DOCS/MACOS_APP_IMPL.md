# macOS App Implementation Plan (Next.js Wrapper)

## Goal
Package the existing Next.js app as a macOS desktop app by wrapping the server/client, with local Postgres support for technical users. This is a thin wrapper phase; we are not changing core app behavior.

## Non-Goals
- Bundling or managing a Postgres daemon inside the app.
- Replacing Next.js with a native UI stack.
- Automatic account sync, multi-user collaboration, or Supabase auth in desktop mode.

## Current Context (From Code)
- Local PG mode exists via `RT_PG_ADAPTER=local` + `LOCAL_PG_URL`.
- Local migrations are applied via `maybeBootstrapLocalPg()` against `supabase/migrations`.
- Local bootstrap toggle: `RT_PG_BOOTSTRAP` (default on).
- Store selection: `RT_STORE=pg` for Postgres-backed provenance.

## Proposed Desktop Architecture
### Wrapper choice
Use a minimal Electron shell that:
1) Spawns the Next.js server locally.
2) Opens a native BrowserWindow pointed at the local server.

This keeps the web app intact while providing a desktop window, local file paths, and native packaging.

### Runtime flow
1) Resolve config (env + local config file).
2) Start Next.js server on `127.0.0.1:<port>` (dynamic port).
3) Poll `/api/health` until ready.
4) Launch a BrowserWindow to the local URL.
5) On quit: terminate the server process.

### Local PG expectations
- Desktop mode runs with:
  - `RT_PG_ADAPTER=local`
  - `LOCAL_PG_URL=postgres://user:pass@localhost:5432/researchtree`
  - `RT_STORE=pg`
- `maybeBootstrapLocalPg()` runs migrations on first use.
- No Supabase env vars are allowed in local PG mode (see `assertLocalPgModeConfig()`).

## File/Package Layout (Suggested)
```
desktop/
  main.ts         # Electron main process
  preload.ts      # Optional: IPC bridge
  config.ts       # Load config / env
  server.ts       # Spawn Next.js server
  ui/             # First-run / settings UI (modal)
  build/          # Packager output (ignored)
```

## Build & Packaging Plan
1) **Next.js build**:
   - Set `next.config.js` to `output: 'standalone'` to bundle server output.
   - Run `pnpm build` and capture `.next/standalone` + `.next/static`.
2) **Electron wrapper**:
   - Add `electron` + `electron-builder` (or `@electron-forge`) dev deps.
   - `desktop/main.ts` spawns the Next server:
     - `node .next/standalone/server.js -p <port>`
3) **Bundle assets**:
   - Include `supabase/migrations` in the packaged app so local bootstrap can run.
   - Ensure `data/projects` or configured storage root is under the macOS user data dir.
4) **Package**:
   - Produce a signed `.app` and optionally a `.dmg`.
   - For local testing, unsigned builds are sufficient.

## Config & Data Locations
- **Config**: `~/Library/Application Support/ResearchTree/config.json`
  - Example keys:
    - `LOCAL_PG_URL`
    - `RT_STORE`
    - `RT_PG_ADAPTER`
- **Data**: `~/Library/Application Support/ResearchTree/projects`
  - Map `RESEARCHTREE_PROJECTS_ROOT` to this folder at runtime.

## Required App Changes
1) **Health endpoint**
   - Add `/api/health` returning:
     - `storage_mode`
     - `db_reachable`
     - `migration_status`
2) **Standalone Next server support**
   - Add `output: 'standalone'` to `next.config.js`.
3) **Config loading**
   - Add a small config loader for desktop that:
     - Reads `config.json` from the user data dir.
     - Applies env vars before spawning Next.js.
4) **First-run modal**
   - Desktop-only modal to collect `LOCAL_PG_URL` if missing.
4) **Port management**
   - Pick a port via `get-port` to avoid collisions.
   - Persist the chosen port for the runtime session.

## Developer Scripts (Proposed)
- `pnpm desktop:dev`
  - Builds Next in dev mode.
  - Starts Electron with live reload (optional).
- `pnpm desktop:build`
  - Runs `pnpm build` + electron packaging.
- `pnpm desktop:run`
  - Launches the packaged `.app` for quick QA.

## Testing Plan
- Smoke test in desktop mode:
  - Launch app with `RT_PG_ADAPTER=local`.
  - Verify `/api/health` returns ready.
  - Create a project and verify persistence.
- Local PG bootstrap:
  - Validate migrations apply from `supabase/migrations`.

## Risks & Mitigations
- **Migrations not bundled**: ensure `supabase/migrations` is packaged with the app.
- **Port conflicts**: prefer dynamic port selection.
- **Config drift**: centralize desktop config parsing in one module.
- **Local PG connectivity**: surface friendly error with instructions to install Postgres.app or Homebrew.

## Milestones
1) Add desktop wrapper skeleton (Electron) and local server spawn.
2) Add `output: 'standalone'` and package Next server output.
3) Wire config loading + health endpoint.
4) Package `.app`, verify local PG flow end-to-end.
5) Document setup and troubleshooting.

## Open Questions
- Use Electron Forge vs. Electron Builder?
- Fixed port vs. dynamic port + discovery? (decision: dynamic)
- Do we want a minimal first-run UI for entering `LOCAL_PG_URL`? (decision: yes)

## Modularity Requirement
- Desktop capability should be self-contained in `desktop/` with minimal touchpoints:
  - `next.config.js` for standalone output.
  - `/api/health` for readiness checks.
  - Optional config loader hook if needed by the server.
