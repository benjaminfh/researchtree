# Supabase Env Var Usage: Root Problem, Consequences, Fix Direction

## 1) Root Problem
The app currently calls `createSupabaseServerClient()` directly in multiple pages and API routes, even when running in local Postgres mode. Those calls assume Supabase env vars are present and complete. When they are missing or partial, the code throws at runtime (e.g., in `app/page.tsx`, `/api/projects`, `/projects/[id]`, `/api/projects/[id]/edit`).

In short: **Supabase usage is not centrally gated**, so it leaks into code paths that should be local‑only. The app’s auth/storage mode is implicit in scattered calls rather than enforced at a single boundary.

## 2) Consequences
### (a) Web App
- **Runtime failures if env vars are missing/partial.** Pages crash with “Supabase env missing” errors.
- **Fragile deployments.** A partial env setup yields inconsistent behavior and hard failures instead of a clear boot‑time error.
- **Security posture is unclear.** The app may “half‑enforce” auth depending on which call sites are hit, rather than a single, explicit rule.

### (b) Desktop App
- **Unexpected login redirects.** Middleware sees Supabase env vars and enforces auth when local PG is intended.
- **Hard 500s when .env.local is absent.** Direct Supabase calls in server components explode even though local PG is working.
- **User confusion and poor first‑run UX.** Desktop runs appear broken despite local PG being correctly configured.

## 3) Proposed Fixes (Directional, High Level)
### A. Centralize Supabase Access (Single Gateway)
- Introduce a small “data access boundary” that’s **mode‑aware** (Supabase vs Local PG).
- Prohibit direct `createSupabaseServerClient()` calls outside this boundary.
- Example: `getPgStoreAdapter()` or a `PgQuery` helper that routes queries to Supabase or local PG based on `RT_PG_ADAPTER`.

### B. Explicit Mode Gating (Fail Closed Early)
- Enforce a strict rule at startup (or in middleware):
  - If `RT_STORE=pg` and `RT_PG_ADAPTER=supabase`, Supabase env vars **must** be complete; otherwise fail fast with a clear error.
  - If `RT_PG_ADAPTER=local`, **disallow** Supabase client calls (either runtime guard or lint rule).

### C. Auth Enforcement Lives in One Place
- Middleware should enforce auth **only** when Supabase mode is explicitly configured.
- Local PG mode should bypass Supabase auth entirely and rely on the local auth stub.

### D. Desktop‑Safe Configuration Loading
- Load `.env.desktop` for desktop runs, and avoid inheriting Supabase envs by default.
- This should be an implementation detail of the desktop wrapper, not a change in web behavior.

---

**Outcome if implemented:**  
Web app deployments become deterministic and fail fast on misconfiguration. Desktop mode remains isolated from Supabase auth paths and avoids accidental login redirects or env‑missing crashes.
