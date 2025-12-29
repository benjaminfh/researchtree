# ResearchTree Developer Guide

ResearchTree is a git-backed reasoning workspace. Each project is its own git repository containing:

- `nodes.jsonl` — append-only reasoning history (messages, state checkpoints, merge events)
- `artefact.md` — the “Canvas” markdown for the selected ref (branch-local, editable on any branch)
- `project.json` and `README.md` — metadata seeded at project creation

The TypeScript helpers under `src/git` provide all project, node, branch, and artefact operations with git as the single source of truth.
For a deeper dive into the ref-safe/no-checkout write path used by streaming, see `MVP_GIT_ARCH_README.md`.

## Prerequisites

- Node.js 20+
- npm 10+
- git available on your PATH

## Installation

```bash
npm install
```

This pulls in `simple-git`, `uuid`, and the development toolchain (TypeScript + Vitest).

## Running the Test Suite

Vitest writes throwaway repositories under `.test-projects/<suite-name>`. To run everything:

```bash
npm test
```

If you only want a subset of suites, use `npm test -- tests/git/branches.test.ts`.

To clean local branches that no longer exist on the remote (for example, `git branch -vv` shows `[origin/...: gone]`), run:

```bash
git fetch --prune
git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads \
  | awk '$2 == "" { print $1 }' \
  | xargs -r git branch -D
```

A branch will be deleted only if it lacks an upstream entry; tracked branches are left untouched. Replace `-D` with `-d` if you prefer Git’s “safely delete only if merged” behavior.

## Playing with the Git Helpers

Set a workspace root (defaults to `<repo>/data/projects`) with `RESEARCHTREE_PROJECTS_ROOT` and drive the helpers through `ts-node`:

```bash
RESEARCHTREE_PROJECTS_ROOT=~/tmp/researchtree-playground \
npx ts-node --esm ./scripts/playground.ts
```

Example `scripts/playground.ts`:

```ts
import { initProject, appendNode, updateArtefact, createBranch, listBranches } from '../src/git/index.js';

const run = async () => {
  const project = await initProject('Demo Project', 'CLI walkthrough');
  await appendNode(project.id, { type: 'message', role: 'system', content: 'Kickoff' });
  await appendNode(project.id, { type: 'message', role: 'user', content: 'What should we build?' });
  await updateArtefact(project.id, '# Demo Artefact\n\nInitial trunk draft.');

  await createBranch(project.id, 'research');
  console.log(await listBranches(project.id));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

This script shows how to initialize a project, append reasoning nodes, update the artefact on trunk, and branch for exploratory work. Clean up with `rm -rf ~/tmp/researchtree-playground`.

## ASCII AST: `src/git` Interactions

```
src/git/index.ts ──┬─> projects.ts ──┬─> utils.ts ──┬─> constants.ts
                   │                 │              └─> types.ts
                   │                 └─> types.ts
                   │
                   ├─> nodes.ts ─────┬─> utils.ts ──┬─> constants.ts
                   │                 │              └─> types.ts
                   │                 └─> types.ts
                   │
                   ├─> branches.ts ──┬─> nodes.ts
                   │                 └─> utils.ts ──> constants.ts/types.ts
                   │
                   └─> artefact.ts ──┬─> nodes.ts
                                     └─> utils.ts ──> constants.ts/types.ts
```

- `constants.ts` centralizes project locations, filenames, and default git config.
- `types.ts` defines all shared TypeScript types.
- `utils.ts` provides reusable helpers (project paths, git config enforcement, node parsing).
- Feature modules (`projects`, `nodes`, `branches`, `artefact`) compose those helpers to implement domain logic.
- `index.ts` re-exports everything so callers can simply `import { initProject } from './src/git/index.js';`.

## Common Scripts

- `npm run build` — compile TypeScript to `dist/`
- `npm run lint` — type-check the code with `tsc --noEmit`
- `npm test` — run Vitest across `tests/git/*.test.ts`

## Running the Dev Environment

The Next.js workspace lets you try the git-backed chat UI locally.

1. **Set environment variables** (create `.env.local`):
   ```
   LLM_DEFAULT_PROVIDER=openai        # openai / gemini / anthropic / mock
   OPENAI_API_KEY=sk-...      # required if using OpenAI
   GEMINI_API_KEY=xxx...      # required if using Gemini (Generative Language API)
   RESEARCHTREE_PROJECTS_ROOT=/absolute/path/to/data/projects
   ```
   Optional overrides:
   - `OPENAI_MODEL` (default `gpt-5.2`)
   - `GEMINI_MODEL` (default `gemini-3-pro-preview`; pick a model available to your API key)

   If you don't have API keys handy, set `LLM_DEFAULT_PROVIDER=mock` to use the built-in echo responder.

2. **Install dependencies** (once):
   ```bash
   npm install
   ```

3. **Launch the dev server**:
   ```bash
   npm run dev
   ```
   Next.js serves at http://localhost:3000 by default. The dashboard lists projects backed by git repos under `RESEARCHTREE_PROJECTS_ROOT`.

4. **Create or open a project**:
   - Visit `http://localhost:3000/` and use the **Create Project** form to spin up a git-backed workspace instantly. Projects appear in the list as soon as they’re created.
   - Prefer the CLI? `scripts/playground.ts` still works for scripted demos.
   - Open `/projects/<id>` to chat, stream responses, and view the artefact pane. The composer supports `⌘+Enter` to send plus `Shift+Enter` or `Option+Enter` for multi-line drafts, and the Stop button aborts long generations.
   - The Canvas (`artefact.md`) is edited per-branch (the UI autosaves to `?ref=<branch>`). Merges record a Canvas diff but do not auto-apply it; you can optionally “Add diff to context” on the merge node to persist the diff as an assistant message for future prompts.
   - Use **Quest graph** (Canvas/Graph toggle) to navigate the reasoning DAG:
     - Click a node to open the detail strip (with **Copy**, **Jump to message**, and merge-specific actions).
     - For merge nodes with Canvas changes, use **Add canvas changes** (then confirm) to pin the diff into chat context.
     - Press `Esc` or click empty graph space to clear the current selection.
   - Use the provider selector in the workspace header to switch between providers. The `LLM_DEFAULT_PROVIDER` env var sets the default. Provider choices persist per branch.
   - Branch UI: create/switch branches from the workspace header. When you’re on a non-trunk branch, the conversation shows shared history collapsed by default; expand to reveal upstream messages (muted) with a divider at the split.
   - Project list: each entry shows branch + node counts and a soft “Hide/Unhide” toggle (stored in localStorage) so you can temporarily remove noisy workspaces without deleting the repo.

Hot reload is enabled; API changes and UI tweaks are reflected immediately. Stop the server with `Ctrl+C`.

You now have everything needed to extend ResearchTree or embed the git helpers into another application. Happy hacking! 

## Local Postgres Mode (Desktop-Style)

To run against a local Postgres instance (no Supabase auth/RLS, single-user):

1. Install Postgres.app or Homebrew Postgres and create a local database.
2. Set `.env.local`:
   ```
   RT_PG_ADAPTER=local
   LOCAL_PG_URL=postgresql://localhost:5432/youruser
   RT_PG_BOOTSTRAP=1
   ```
3. Start the app as usual (`npm run dev` or your desktop bundle).

Notes:
- Local mode fails closed if any Supabase env vars are present.
- Migrations auto-run on first RPC call and are tracked in `local_migrations`.
- The app always uses the `threds` database and auto-creates it if missing.
- Use `npm run local:pg:bootstrap` if you want to run migrations manually.
