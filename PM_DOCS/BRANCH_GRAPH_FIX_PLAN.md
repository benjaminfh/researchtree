# Branch Graph Bug Investigation & Fix Plan

## Trigger / Scope
This plan addresses PR bug report **"[BUG] Branch graph is messy"** and focuses on:
1. Preventing text/graphics collisions.
2. Supporting configurable text alignment modes.
3. Improving or proving lane placement crossing quality while keeping render performance bounded.

## Investigation Findings (Current Code)

### 1) Label placement is coupled to lane occupancy, not true rendered geometry
`labelTranslateX` is currently computed from lane indices (`lane`, `rightMostAtRow`) and fixed constants (`LABEL_ROW_GAP`, `LABEL_BASE_OFFSET`). This does not account for actual edge path shape, stroke width, icon width variation, or edge labels. In dense/merge-heavy rows, labels can still overlap graphics because the algorithm estimates right bounds instead of measuring them. 

Relevant code:
- Label constants and transform usage in node rendering.
- `labelTranslateX` calculation in both fallback and main layout paths.
- `Vertex.getMaxReservedX()` proxy heuristic.

### 2) Horizontal anchor consistency is fragile
The main layout path applies a hardcoded `-20` x-offset (`x = lane * laneSpacing - 20`), while fallback uses `x = lane * laneSpacing`. This introduces two coordinate systems and makes collision math brittle when fallback activates.

### 3) Crossing minimization objective is implicit and unmeasured
`GitGraphLayout` uses an iterative path-building process with branch/color reuse and local decisions, but there is no explicit crossing-cost function, no crossing counter, and no post-layout score comparison. Therefore we cannot claim minimum crossings (or near-minimum) today.

### 4) Bounded iterations/fallback already exist (good base)
`layoutGraph` already enforces `maxIterations` and falls back to lane-per-branch on non-completion, which is aligned with the acceptance criterion to avoid infinite loops.

## Root-Cause Hypotheses

### Text collisions
- Right-boundary estimate is lane-occupancy-based, not geometry-based.
- Label origin does not include a measured max x across all rendered primitives at each row.
- Two layout coordinate paths (primary/fallback) can disagree on effective right boundary.

### Crossing quality ambiguity
- The current algorithm likely behaves as a heuristic (Git-like flow), but without metrics we cannot tune confidently.
- Merge-heavy sections can lock in early lane choices with no objective-driven refinement pass.

## Proposed Fix Strategy

## Phase 1 — Observability & Metrics (no UX change)
1. Add a deterministic **crossing counter** (`countEdgeCrossings(nodes, edges)` in layout space).
2. Add optional debug telemetry in development:
   - `iterations`
   - `crossings`
   - `maxLane`
   - whether fallback activated
3. Add a **row right-bound calculator** that measures the max occupied x in each row from:
   - node lane x
   - merge/curve edge projections for that row
   - icon footprint + stroke width buffers

Deliverables:
- Reusable utilities for crossing count and right-bound computation.
- Unit tests for known synthetic graphs.

## Phase 2 — Label Alignment Modes + Env Toggle
Introduce two explicit label modes:
- `hug` (default): each row label starts just to the right of that row's measured graphics bound.
- `left-aligned`: all labels start at `max(measuredRowBound)` + buffer.

Configuration:
- Env var: `NEXT_PUBLIC_GRAPH_LABEL_ALIGNMENT` (`hug` | `left-aligned`, default `hug`).
- Parse/validate in feature/config layer, then consume in `WorkspaceGraph`.

Implementation details:
- Replace raw `labelTranslateX` heuristic with `labelXStart` derived from measured bounds.
- Unify primary + fallback layout x-origin semantics (remove magic `-20` split behavior; use one base constant if needed).
- Maintain truncation and existing text styling.

## Phase 3 — Crossing Reduction Improvements
1. Keep current `GitGraphLayout` as baseline for compatibility.
2. Add optional local optimization pass (bounded):
   - attempt lane swaps in small windows,
   - accept swaps only when crossing count decreases,
   - cap passes/operations for predictable runtime.
3. Compare pre/post crossing counts; keep improved layout only if strictly better.
4. Respect current `maxIterations`-style safeguards for the optimization pass.

Note: exact minimum crossing is NP-hard in general layered graph variants; target should be **measurably reduced crossings under bounded runtime**, not a formal global optimum claim.

## Phase 4 — Validation

### Automated
- Unit tests for:
  - label x placement never below computed safe boundary,
  - mode switching (`hug`, `left-aligned`),
  - crossing counter correctness on canonical micro-graphs,
  - optimization pass monotonicity (never increases crossings).

### Manual / Visual
- Reproduce provided complex branch examples and confirm:
  - no text overlap with lines/nodes,
  - clear left-hugging behavior,
  - left-aligned mode lines up as expected,
  - no obvious perf regressions on large histories.

## Acceptance Criteria Mapping
- **No text collisions** → Phase 1 measured bounds + Phase 2 placement rewrite.
- **Left-hugging mode** → Phase 2 `hug`.
- **Optional left-aligned mode** → Phase 2 `left-aligned` + env toggle.
- **Env variable toggle** → Phase 2 config plumbing.
- **Minimum crossings while performant** → Phase 3 measurable reduction + bounded optimization/runtime caps.
- **Max iterations to avoid infinite loops** → already present; extend safeguards to optimization pass.

## Suggested Implementation Order (Small PR Stack)
1. Metrics/utilities + tests (crossing counter, row bounds).
2. Label placement refactor + env mode toggle.
3. Crossing optimization pass + benchmarks/tests.
4. Final polish + screenshot/regression verification.
