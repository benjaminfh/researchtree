# FE / BE AUDIT — Critical Logic Placement (APSEC)

## Goal

Determine how much *critical app logic* is enforced in the **frontend** versus the **backend**, and identify any logic that is **unsafe** when implemented client-side (because it can be bypassed by calling APIs directly).

## Definitions

### “Critical app logic”

Logic is **critical** if it impacts any of the following:

- **Authorization / permissions**: role checks, ownership checks, tenant boundaries, admin-only actions.
- **Authentication integrity**: session/JWT handling, token refresh, CSRF, logout, account linking.
- **Data integrity**: invariants, state machines/workflow transitions, write ordering, transactional boundaries.
- **Financial impact**: pricing, billing, credits/quotas, entitlement checks, metering.
- **Irreversible side effects**: deletes, exports, notifications, webhooks, emails, external API calls.
- **Compliance / privacy**: PII access controls, retention rules, redaction, audit logging.
- **Abuse prevention**: rate limiting, idempotency, anti-automation, replay protection.

### “Frontend logic” vs “Backend logic”

- **Frontend (FE)**: browser/client code (routing, UI state, client validation, request construction).
- **Backend (BE)**: API handlers, services, jobs/workers, webhooks, middleware, DB constraints, and any server-side validation/authorization.

### Classification (what we’re measuring)

For each critical rule, classify where enforcement exists:

- **BE source-of-truth (good)**: enforced on the server; FE may mirror for UX only.
- **Duplicated (usually OK)**: FE mirrors for UX; BE enforces for safety.
- **FE-only (unsafe)**: enforcement exists only in FE; bypassable.
- **Missing/unknown (critical gap)**: neither side clearly enforces; requires investigation.

## Scope

In scope (as applicable to this repo):

- Web frontend(s) and shared UI packages
- API/backend service(s)
- Background jobs/queues/workers and scheduled tasks
- Webhook receivers and third-party integrations
- Data layer: ORM models, migrations, DB constraints
- Observability that impacts security: audit logs, event logs, metrics for abuse detection

Out of scope (unless explicitly included later):

- Infrastructure configuration (Kubernetes/IaC) beyond what affects authz/network exposure
- Third-party services where source code isn’t in this repo (we’ll note assumptions)

# AUDIT TODOs

Use this as an execution checklist while performing the FE/BE logic placement audit.

### Setup and orientation

- [x] Identify FE(s) and BE(s) directories/packages in this repo (monorepo vs single app).
- [x] List runtime entrypoints for FE and BE (build/start commands, env vars, config files).
- [x] Identify data stores and external dependencies (DB, cache, object storage, payments, email, analytics).
- [x] Enumerate user roles, tenant model, and any “admin” capabilities (document assumptions if unclear).
- [x] Decide audit “critical flows” for this app (pick top 5–10).

Notes (repo-specific):

- FE: Next.js App Router pages in `app/**/page.tsx` + client components in `src/components/**` and hooks in `src/hooks/**`.
- BE: Next.js route handlers in `app/api/**/route.ts`, server actions in `app/**/actions.ts`, server modules in `src/server/**`.
- Domain/store backends:
  - `pg` mode: Supabase Postgres + RLS + `security definer` RPC (see `supabase/migrations/**` and `src/store/pg/**`).
  - `git` mode: on-disk git repos under `data/projects` (see `src/git/**`).
- Runtime entrypoints: `package.json` scripts (`npm run dev|build|start|test|lint`), env documented in `env.example`.
- External dependencies:
  - Supabase Auth + Postgres (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
  - LLM providers (OpenAI/Gemini/Anthropic) via server fetch/SDKs
  - Vercel/Edge middleware behavior (if deployed)
- Roles/tenancy:
  - Primary isolation is per-project membership via `project_members` + RLS (see `supabase/migrations/2025-12-19_0001_rt_provenance_schema.sql`).
  - “Admin” is env-configured allowlist via `RT_ADMIN_EMAILS` (see `src/server/admin.ts`).
- Critical flows (current app):
  - Auth: login/signup/logout, password reset, auth callback (`app/login/*`, `app/auth/*`, `app/forgot-password/*`, `app/reset-password/*`)
  - Waitlist gating + admin allowlist management (`middleware.ts`, `src/server/waitlist.ts`, `app/admin/waitlist/*`)
  - Project lifecycle: create/list (`app/api/projects/route.ts`, `src/components/projects/CreateProjectForm.tsx`)
  - Workspace: history, chat streaming, artefact read/write, branching, edit message, merge, stars, graph (`app/api/projects/[id]/**`)
  - Profile: per-user LLM key management (`app/api/profile/**`)

### Frontend inventory (surface area)

- [x] List FE routes/pages/screens and their route guards (if any).
- [x] Locate API client code (fetch wrapper/GraphQL client) and request interceptors.
- [x] Locate client-side auth handling (token storage, refresh flow, logout).
- [x] Identify global state/caching layers (Redux/Zustand/Context, React Query/Apollo) that may embed logic.
- [x] Identify any local persistence (localStorage/indexedDB) used for auth or business state.

Notes (repo-specific):

- FE routes/pages:
  - `/` (`app/page.tsx`)
  - `/projects/[id]` (`app/projects/[id]/page.tsx`)
  - `/profile` (`app/profile/page.tsx`)
  - `/login` (`app/login/page.tsx`), `/check-email` (`app/check-email/page.tsx`)
  - `/forgot-password` (`app/forgot-password/page.tsx`), `/reset-password` (`app/reset-password/page.tsx`)
  - `/waitlist` (`app/waitlist/page.tsx`)
  - `/admin/waitlist` (`app/admin/waitlist/page.tsx`)
  - Auth routes: `/auth/callback` (`app/auth/callback/route.ts`), `/auth/signout` (`app/auth/signout/route.ts`)
- Route guard (server-side): `middleware.ts` enforces “signed in” for non-public paths when Supabase env is configured; also enforces waitlist for page access.
- API client layer: plain `fetch()` + SWR (`src/hooks/useProjectData.ts`, `src/hooks/useChatStream.ts`, and direct `fetch('/api/...')` in `src/components/**`).
- Client auth: no Supabase browser client in use; no token storage in localStorage (good). Auth is cookie/session-based via server-side Supabase clients.
- Client persistence: local UI prefs only (no auth/permissions):
  - `localStorage`: UI collapse, archived projects, provider/thinking prefs, pane widths (`src/components/**`)
  - `sessionStorage`: composer draft text (`src/components/workspace/WorkspaceClient.tsx`)

### Backend inventory (surface area)

- [x] List BE endpoints (REST/GraphQL) and map to handlers/controllers.
- [x] List BE middleware/policies (authn/authz, validation, CSRF, rate limiting, input sanitization).
- [x] List background jobs/workers/cron tasks and what triggers them.
- [x] List webhook receivers and idempotency strategy (signatures, replay protection).
- [x] Identify where domain/business logic lives (service layer, “use cases”, model methods, stored procedures).

Notes (repo-specific):

- API endpoints (Next route handlers):
  - Auth: `GET /api/auth/me` (`app/api/auth/me/route.ts`)
  - Projects: `GET|POST /api/projects` (`app/api/projects/route.ts`)
  - Workspace (per project): `POST /api/projects/:id/chat`, `GET /history`, `GET|PUT|PATCH /artefact`, `GET|POST|PATCH /branches`, `POST /edit`, `POST /merge`, `POST /merge/pin-canvas-diff`, `GET /graph`, `GET|POST /stars`, `POST /interrupt`
  - Profile: `GET|PUT /api/profile` and `GET /api/profile/llm-keys`
- Server actions:
  - Login/signup/signout: `app/login/actions.ts`
  - Forgot/reset password: `app/forgot-password/actions.ts`, `app/reset-password/actions.ts`
  - Waitlist request: `app/waitlist/actions.ts`
  - Waitlist admin approve/remove: `app/admin/waitlist/actions.ts`
- Authn/authz primitives:
  - `requireUser()` (`src/server/auth.ts`) validates Supabase session server-side.
  - `requireProjectAccess()` (`src/server/authz.ts`) enforces per-project membership (relies on Supabase RLS).
  - `requireAdminUser()` (`src/server/admin.ts`) enforces admin role via `RT_ADMIN_EMAILS`.
  - Middleware gate: `middleware.ts` enforces signed-in for pages and applies waitlist gate for page access.
- Validation:
  - Zod request schemas in `src/server/schemas.ts` (projects/chat/merge/branch/edit/artefact).
  - Additional server-side checks in route handlers (branch existence, node type checks, etc.).
- Concurrency control:
  - In-process locks in `src/server/locks.ts` + DB transaction/locking within Supabase RPC functions (pg mode).
  - Stream cancellation registry in `src/server/stream-registry.ts`.
- Background jobs/workers/webhooks: none found in repo.
- Domain logic locations:
  - Provenance store: `src/store/pg/**` (Supabase RPC wrappers) and `supabase/migrations/**` (RLS + RPC).
  - Git store: `src/git/**` (on-disk git repos).
  - LLM execution + streaming: `src/server/llm.ts`, `src/server/context.ts`.

### Route + flow mapping

- [x] Build a mapping: `FE route/page → API call(s) → BE endpoint/handler → service → DB`.
- [x] For each critical flow, record the client-controlled inputs and server trust boundary.
- [x] Note where FE constructs derived fields (totals, permissions flags, next-state values).

Notes (repo-specific mapping highlights):

- `/` (`app/page.tsx`) → server-side list projects via Supabase (pg) or git (`src/git/projects.ts`) → DB via RLS (pg) / filesystem (git).
- `/projects/[id]` (`app/projects/[id]/page.tsx`) → client fetches:
  - `GET /api/projects/:id/history` → `app/api/projects/[id]/history/route.ts` → `src/store/pg/reads.ts` or `src/git/utils.ts`
  - `POST /api/projects/:id/chat` → `app/api/projects/[id]/chat/route.ts` → `src/server/llm.ts` + `src/store/pg/nodes.ts` or `src/git/nodes.ts`
  - `GET|PUT /api/projects/:id/artefact` → `app/api/projects/[id]/artefact/route.ts` → `src/store/pg/drafts.ts` / `src/git/artefact.ts`
  - `GET|POST|PATCH /api/projects/:id/branches` → `app/api/projects/[id]/branches/route.ts` → `src/store/pg/branches.ts` + `src/store/pg/prefs.ts` / `src/git/branches.ts`
  - `POST /api/projects/:id/edit` → `app/api/projects/[id]/edit/route.ts` → `src/server/llm.ts` + store writes
  - `POST /api/projects/:id/merge` → `app/api/projects/[id]/merge/route.ts` → `src/store/pg/merge.ts` / `src/git/branches.ts`
  - `POST /api/projects/:id/merge/pin-canvas-diff` → `app/api/projects/[id]/merge/pin-canvas-diff/route.ts` → node append
  - `GET /api/projects/:id/graph` → `app/api/projects/[id]/graph/route.ts` → read RPCs / git reads
  - `GET|POST /api/projects/:id/stars` → `app/api/projects/[id]/stars/route.ts` → `src/store/pg/stars.ts` / `src/git/stars.ts`
  - `POST /api/projects/:id/interrupt` → `app/api/projects/[id]/interrupt/route.ts` → `src/server/stream-registry.ts`
- `/profile` (`app/profile/page.tsx` + `src/components/profile/ProfilePageClient.tsx`) → `GET|PUT /api/profile`, `GET /api/profile/llm-keys` → `src/store/pg/userLlmKeys.ts` (Supabase RPC + Vault compat)

### Critical logic cataloging (the core of the audit)

- [x] Find FE-only gating logic (UI hides buttons, route guards, client-side “role” checks).
- [x] Find FE-only validation that appears to be relied upon for correctness or security.
- [x] For each rule, locate corresponding BE enforcement (or confirm it’s missing).
- [x] Classify each rule: **BE source-of-truth / Duplicated / FE-only / Missing**.
- [x] Capture evidence pointers (file paths + symbols) for both FE and BE locations.

Notes (repo-specific classifications):

- Project membership:
  - BE source-of-truth: Supabase RLS on `projects` + explicit checks in `src/server/authz.ts` (`requireProjectAccess()`).
- Request validation:
  - Duplicated: FE validates some required fields for UX (e.g. workspace name in `src/components/projects/CreateProjectForm.tsx`), BE validates via Zod (`src/server/schemas.ts`).
- Waitlist gating:
  - Mixed; see findings under `# FINDINGS` (middleware gate behavior + API coverage).
- “Edit any message” feature:
  - FE-only gate in `src/components/workspace/WorkspaceClient.tsx` using `src/config/features.ts`; BE currently permits editing any message node type (see findings).

### Authentication checks

- [x] Verify BE validates session/JWT on every protected request (not only on the FE).
- [ ] If cookie-based auth: verify CSRF protections on state-changing requests.
- [ ] Confirm token/session invalidation on logout and on credential reset (where applicable).
- [x] Confirm FE storage choices for tokens are consistent with threat model (document risks).

Notes (repo-specific):

- BE auth checks: all `app/api/**` routes call `requireUser()` (`src/server/auth.ts`) and project routes call `requireProjectAccess()` (`src/server/authz.ts`).
- FE token storage: none observed (no `createSupabaseBrowserClient()` usage; no auth token in localStorage).

### Authorization checks (must be BE-enforced)

- [x] For each sensitive endpoint, verify BE authorization checks (role/ownership/tenant scoping).
- [x] Attempt to identify IDOR risks: endpoints that accept IDs without ownership validation.
- [x] Verify server rejects privilege escalation attempts (e.g., changing `role`, `ownerId`, `tenantId`).
- [x] Ensure “admin-only” endpoints are protected beyond FE UI hiding.

Notes (repo-specific):

- Per-project APIs uniformly call `requireProjectAccess({ id: params.id })` (see `app/api/projects/[id]/**`).
- Admin waitlist UI and server actions require `requireAdminUser()` (see `app/admin/waitlist/page.tsx` and `app/admin/waitlist/actions.ts`).

### Data integrity / invariants

- [x] Identify workflow/state machine transitions and ensure BE enforces allowed transitions.
- [x] Confirm BE validates cross-field invariants (e.g., date ranges, totals consistency, required relationships).
- [x] Review DB constraints for critical invariants (FKs, uniques, not-null) and transaction usage.
- [x] Identify any BE operations that should be atomic but are split across requests.

Notes (repo-specific):

- pg mode write paths are consolidated into Supabase RPC calls (`security definer`) which take DB locks on refs (see `supabase/migrations/**` and `src/store/pg/**`).
- Merge/edit/chat handlers include additional server-side integrity checks (node type checks, branch existence, “cannot merge into self”, etc.).

### Financial / entitlement logic (if applicable)

- [x] Locate pricing/plan tier checks and confirm BE is source-of-truth.
- [x] Confirm quota enforcement is server-side (and cannot be bypassed via direct API calls).
- [x] Ensure payments/webhooks are verified (signatures) and idempotent.
- [x] Ensure client cannot set paid/entitled flags directly.

Notes (repo-specific):

- No billing/plan/payment logic found in this repo.

### Abuse prevention and operational security

- [x] Identify rate limiting on login, password reset, invitations, exports, expensive queries.
- [x] Verify idempotency keys or equivalent protections for retried writes and webhooks.
- [x] Review audit logging coverage for critical actions (who/what/when/tenant/result).
- [x] Check error handling for information leaks (stack traces, overly detailed auth errors).

Notes (repo-specific):

- No explicit rate limiting middleware found in `app/api/**` or `middleware.ts`.
- Chat/LLM usage is keyed per-user token (user bears provider cost), but DB write amplification is still possible.

### Findings write-up and prioritization

- [x] For each finding, write: impact, exploit/bypass narrative, root cause, fix recommendation.
- [x] Assign severity (Critical/High/Medium/Low) and affected components (FE/BE/DB).
- [x] Propose concrete refactors: move rules to BE, add validation schemas, add DB constraints, add policy layer.
- [x] Produce a “Must move to BE” shortlist (top risks first).
- [x] Summarize logic distribution metrics (counts by category and by enforcement classification).

# PAAS TODOs

Items that require you to verify or change configuration in Supabase/Vercel (or similar PaaS), because the repo alone can’t confirm them.

- [ ] Vercel env: confirm `RT_STORE=pg` in production (git mode is not multi-tenant safe as implemented; see findings).
- [ ] Vercel env: confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for all environments that should require auth.
- [ ] Vercel env: confirm `SUPABASE_SERVICE_ROLE_KEY` is set server-side and available to the runtime that executes `middleware.ts` (Edge vs Node runtime behavior differs).
- [ ] Vercel env: confirm `RT_WAITLIST_ENFORCE` and `RT_ADMIN_EMAILS` are set as intended in production, and that changes to allowlist/admin lists are controlled.
- [ ] Supabase SQL: confirm migrations are applied (especially RLS + RPC defs under `supabase/migrations/**`).
- [ ] Supabase Auth settings: verify allowed redirect URLs include `https://<your-domain>/auth/callback` and password reset redirects match `RT_APP_ORIGIN`.
- [ ] Supabase Auth providers: confirm there are no enabled flows (e.g., magic links / OAuth) that can create sessions without passing the app’s allowlist gate, unless you intentionally allow that.
- [ ] Cookie/CSRF posture: confirm Supabase auth cookie `SameSite` and domain settings match your threat model; decide whether explicit CSRF protections are required for `POST/PUT/PATCH` endpoints.

# FINDINGS

### F-001 (Critical) — Waitlist allowlist check fails open in middleware

- Impact: if Supabase REST queries fail (transient outage, bad URL/key, permission issues), blocked users may be treated as allowlisted and gain access to non-public pages.
- Evidence: `middleware.ts` `isEmailAllowlisted()` returns `true` when `res.ok` is false.
- Root cause: “fail open” behavior for allowlist enforcement.
- Recommendation: fail closed for allowlist checks when `RT_WAITLIST_ENFORCE` is on (or gate with an explicit env like `RT_WAITLIST_FAIL_OPEN=false`).

### F-002 (High) — Waitlist enforcement does not cover `/api/*` routes

- Impact: a user with a valid session can still call `app/api/**` endpoints even if they’re blocked from page access by the waitlist gate.
- Evidence: `middleware.ts` excludes `/api` from `config.matcher`, and API handlers do not call allowlist checks (they call `requireUser()` + `requireProjectAccess()` only).
- Root cause: waitlist is enforced at page navigation/auth time, not as a backend authorization predicate.
- Recommendation: enforce “allowlisted user” server-side for API calls as well (e.g., add an allowlist check in `src/server/auth.ts` or a shared API wrapper), or move allowlist enforcement into Supabase policies/hook so it’s not bypassable.

### F-003 (High) — `git` store mode bypasses per-project membership checks for server-rendered pages

- Impact: in `git` mode, `/projects/[id]` server rendering loads project metadata and branches from disk without verifying membership; this can leak project data if multiple users exist.
- Evidence: `app/projects/[id]/page.tsx` only calls `requireUser()` in `pg` mode; `git` branch uses `getProject()`/`listBranches()` without `requireProjectAccess()`.
- Root cause: authorization is implemented via Supabase RLS, but git mode reads from filesystem directly.
- Recommendation: treat `RT_STORE=git` as local-only/single-user, enforce `RT_STORE=pg` in production, or add explicit membership checks for git-mode server pages before loading project data.

### F-004 (High) — Service role key used in Edge middleware for allowlist checks

- Impact: increases blast radius if the service role key leaks (it bypasses RLS across the DB). Also complicates deployment because Edge/runtime handling of secrets differs.
- Evidence: `middleware.ts` reads `SUPABASE_SERVICE_ROLE_KEY` and uses it in an `authorization: Bearer ...` request.
- Root cause: middleware performs allowlist verification via Supabase REST using elevated credentials.
- Recommendation: avoid using service role in middleware; prefer a minimal-permission mechanism (e.g., RPC callable by authenticated users that returns boolean, or policy-based check) and/or move allowlist enforcement into the backend/API layer.

### F-005 (Medium) — UI-only feature gate for “edit any message”

- Impact: if product intent is “only user messages are editable” by default, the current restriction is bypassable by calling the edit API directly.
- Evidence:
  - FE gate: `src/components/workspace/WorkspaceClient.tsx` uses `features.uiEditAnyMessage` from `src/config/features.ts`.
  - BE behavior: `app/api/projects/[id]/edit/route.ts` only enforces “message node” type, not role or feature flag.
- Recommendation: if this is meant to be an integrity constraint (not just UI polish), enforce it server-side (e.g., reject edits to non-user messages unless an explicit server-side policy allows it).

### F-006 (Medium) — In-memory locks are not sufficient for distributed/serverless concurrency

- Impact: `src/server/locks.ts` prevents concurrent writes only within a single process; on Vercel/serverless with multiple instances it does not provide global mutual exclusion.
- Evidence: `src/server/locks.ts` uses in-memory `Map` keyed by project/ref.
- Recommendation: rely on DB-level locking for pg mode (already present in RPC), and avoid using git mode in serverless deployments; if git mode must be deployed, implement a distributed lock (DB advisory locks/Redis/etc.).

### F-007 (Low) — Branch/ref name validation is length-only

- Impact: may permit surprising ref names; in git mode this can lead to edge-case git errors and harder-to-debug behavior.
- Evidence: `src/server/schemas.ts` (`ref`, `fromRef`, `branchName`) uses `.max(120)` without a character/format constraint.
- Recommendation: add a server-side ref/branch name validator (allowlist characters, forbid `..`, `~`, `^`, `:`, etc.) aligned with Git ref rules.

## Logic Distribution Summary (This Repo)

- Mostly **backend-enforced**: authn (`src/server/auth.ts`), authz (`src/server/authz.ts` + Supabase RLS in `supabase/migrations/**`), request validation (`src/server/schemas.ts`), workflow integrity (route handlers + DB RPC).
- **FE-only gates observed**: 1 notable case (`NEXT_PUBLIC_RT_UI_EDIT_ANY_MESSAGE` in `src/components/workspace/WorkspaceClient.tsx`), which is bypassable unless enforced server-side (F-005).
- **Mixed / incomplete server enforcement**: waitlist gating is implemented, but currently bypassable in important edge cases (F-001, F-002).


### Authorization checks (must be BE-enforced)

- [ ] For each sensitive endpoint, verify BE authorization checks (role/ownership/tenant scoping).
- [ ] Attempt to identify IDOR risks: endpoints that accept IDs without ownership validation.
- [ ] Verify server rejects privilege escalation attempts (e.g., changing `role`, `ownerId`, `tenantId`).
- [ ] Ensure “admin-only” endpoints are protected beyond FE UI hiding.

### Data integrity / invariants

- [ ] Identify workflow/state machine transitions and ensure BE enforces allowed transitions.
- [ ] Confirm BE validates cross-field invariants (e.g., date ranges, totals consistency, required relationships).
- [ ] Review DB constraints for critical invariants (FKs, uniques, not-null) and transaction usage.
- [ ] Identify any BE operations that should be atomic but are split across requests.

### Financial / entitlement logic (if applicable)

- [ ] Locate pricing/plan tier checks and confirm BE is source-of-truth.
- [ ] Confirm quota enforcement is server-side (and cannot be bypassed via direct API calls).
- [ ] Ensure payments/webhooks are verified (signatures) and idempotent.
- [ ] Ensure client cannot set paid/entitled flags directly.

### Abuse prevention and operational security

- [ ] Identify rate limiting on login, password reset, invitations, exports, expensive queries.
- [ ] Verify idempotency keys or equivalent protections for retried writes and webhooks.
- [ ] Review audit logging coverage for critical actions (who/what/when/tenant/result).
- [ ] Check error handling for information leaks (stack traces, overly detailed auth errors).

### Findings write-up and prioritization

- [ ] For each finding, write: impact, exploit/bypass narrative, root cause, fix recommendation.
- [ ] Assign severity (Critical/High/Medium/Low) and affected components (FE/BE/DB).
- [ ] Propose concrete refactors: move rules to BE, add validation schemas, add DB constraints, add policy layer.
- [ ] Produce a “Must move to BE” shortlist (top risks first).
- [ ] Summarize logic distribution metrics (counts by category and by enforcement classification).

## Audit Method (Step-by-step)

### 1) Define audit criteria and boundaries

- List the “critical” categories that matter for this app (authz, billing, integrity, etc.).
- Identify environments (prod/staging/dev) and any feature flags that change behavior.
- Decide which user roles/tenants exist and what “admin” means.

**Output:** agreed criteria + list of critical flows and actors (roles).

### 2) Inventory FE/BE entrypoints and routes

Frontend inventory:

- App entrypoints (e.g., `src/main.*`), routing configuration, and page modules
- API client modules (fetch wrappers, GraphQL clients), interceptors, token handling
- State management (Redux/Zustand/Context), caching layers (React Query/Apollo/etc.)

Backend inventory:

- API surface (REST/GraphQL), controllers/handlers, routing tables
- Middleware (authn/authz, validation, rate limiting, CSRF)
- Service/domain layer, job processors, webhook handlers
- Data layer (models, repositories) and migrations/constraints

**Output:** route table mapping `FE route/page → API call(s) → BE handler(s)`.

### 3) Map end-to-end user flows (dataflow tracing)

Select flows by business criticality (examples):

- Signup/login/logout, password reset, SSO
- Create/update/delete core entities
- Sharing/collaboration, invitations
- Admin actions and role changes
- Exports/imports
- Billing/checkout/credits/quotas

For each flow, trace:

1. UI action and any FE gating/validation
2. Request payload construction (what fields are client-controlled)
3. Backend handler and service calls
4. DB writes/reads and transactional boundaries
5. Response shaping and FE assumptions

**Output:** per-flow sequence notes + list of “trust boundaries” (client-controlled inputs).

### 4) Locate business rules and validations

Systematically identify:

- Validation rules (beyond UX): required fields, ranges, formats, cross-field constraints
- Workflow/state transitions: “allowed next states”, approvals, publish/unpublish, etc.
- Eligibility/entitlement checks: feature access, quotas, plan tier checks
- Derived/calculated fields: totals, counts, pricing, permissions matrices
- Any “hidden UI” checks (FE-only role gating)

For each rule, record:

- Rule name/description
- Location(s): FE file/symbol, BE file/symbol, DB constraint/migration
- Enforcement classification (BE/duplicated/FE-only/missing)
- Bypass scenario (how an attacker could skip FE checks)
- Recommended fix (move/duplicate to BE, add constraint, etc.)

**Output:** a catalog (table) of critical rules and enforcement locations.

### 5) Audit authentication and authorization enforcement

Authentication:

- Session/JWT issuance, verification, rotation, logout invalidation
- CSRF protections (if cookie-based auth)
- Token storage in FE (avoid insecure patterns)

Authorization:

- Confirm every sensitive BE endpoint enforces permissions server-side
- Validate tenant scoping and object ownership checks
- Look for IDOR patterns (e.g., `GET /resource/:id` without ownership check)
- Ensure “admin-only” is enforced in BE (not just hidden in FE)

**Output:** list of protected resources + enforcement points + any gaps.

### 6) Assess data integrity and security risks

Focus checks:

- **Trusting client-controlled fields** for totals, pricing, permissions, or state
- **Mass assignment** or unsafe merges of request bodies into models
- **Missing validation** on BE (formats, cross-field invariants)
- **Missing idempotency** for payments/webhooks/retries
- **Rate limiting** and abuse controls on sensitive endpoints
- **DB constraints** missing for critical invariants (uniqueness, FK, not-null)
- **Logging**: ensure audit logs exist for critical actions and include actor/tenant

Risk scoring rubric (suggested):

- **Critical:** authz bypass, tenant escape, money loss, major data corruption/PII exposure
- **High:** privilege escalation prereq, impactful integrity issues, exploitable abuse
- **Medium:** partial bypass, requires other weaknesses, limited blast radius
- **Low:** defense-in-depth gaps, minor correctness issues

**Output:** prioritized findings list with exploit narratives + fixes.

### 7) Produce report and refactor plan

Deliver:

- **Logic distribution summary:** what % of critical rules are BE-enforced vs FE-only.
- **“Must move to BE” list:** rules that are FE-only or missing, with proposed BE implementations.
- **Architecture recommendations:** where to centralize domain rules (service layer, policies, validators).
- **Quick wins vs refactors:** staged plan with estimates and owners.

## Report Template (to fill during execution)

### Inventory

- FE entrypoints:
- FE routes/pages:
- FE API client layer:
- BE services/apps:
- BE endpoints/webhooks/jobs:
- Data stores:

### Critical Flows

- Flow:
  - FE modules:
  - API calls:
  - BE handlers/services:
  - DB writes:
  - Critical rules encountered:

### Findings (table fields)

- ID:
- Severity:
- Title:
- Description:
- Affected components (FE/BE/DB):
- Reproduction / bypass scenario:
- Root cause:
- Recommended fix:
- Owner:

## Success Criteria

- No **FE-only** enforcement for authz, billing/entitlements, workflow transitions, or destructive actions.
- BE validates and authorizes all client inputs for sensitive operations.
- Critical invariants are enforced at BE and/or DB layers (as appropriate).
- Audit outputs are actionable: clear owners, priorities, and implementation locations.
