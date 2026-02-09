# Workspace typing performance baseline

## Scope
This baseline defines a repeatable scenario for workspace typing latency and render pressure in `WorkspaceClient` before any performance refactor.

## Repro scenario
1. Enable perf instrumentation in dev:
   - `NEXT_PUBLIC_PERF_DEBUG=1 npm run dev`
2. Open a workspace URL with deterministic long history fixture:
   - `http://localhost:3000/projects/<project-id>?perfFixtureNodes=5000`
3. In the composer, type continuously for 10 seconds (no submit).
4. Capture `[perf-debug] burst` console lines.

Notes:
- `perfFixtureNodes` supports `1000`, `5000`, `10000`.
- For offline artifact generation, use `node scripts/perf/generate-workspace-history-fixture.mjs <count>`.

## Acceptance metrics
- **Latency**: p95 keypress-to-next-paint <= **50ms** at `perfFixtureNodes=5000`.
- **Frames**: max dropped frames <= **5** during a 10-second typing burst at `perfFixtureNodes=10000`.
- **Render pressure**: `WorkspaceClient` render count per burst should remain within **2x** the keystroke count.

## Baseline snapshot (pre-refactor)
| Scenario | Keystrokes | Avg keypress->paint | p95 keypress->paint | WorkspaceClient renders | ChatNodeRow renders | Max dropped frames |
|---|---:|---:|---:|---:|---:|---:|
| 1k nodes / 10s burst | TBD | TBD | TBD | TBD | TBD | TBD |
| 5k nodes / 10s burst | TBD | TBD | TBD | TBD | TBD | TBD |
| 10k nodes / 10s burst | TBD | TBD | TBD | TBD | TBD | TBD |

Automation note: browser-container run in this environment could not access `E2E_EMAIL` / `E2E_PASSWORD`, so authenticated baseline capture is pending a credentialed run.
