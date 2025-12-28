# Node-Environment Tests (Server Routes)

## Why
Current tests run under Vitest `jsdom` (browser-like) by default. That is great for UI, but server routes run on Node in production. A small Node-only test suite catches runtime mismatches:
- Node-only modules (`fs`, `path`, `crypto`, `Buffer`) behave differently or are missing in `jsdom`.
- `Request`/`Response`/`fetch` semantics differ between browser and Node.
- `process.env` and other Node globals are real in Node, not shimmed.
- Next server utilities (`next/headers`, `next/server`) can behave differently outside a browser-like environment.

## What to add
1) A separate Vitest config (ex: `vitest.node.config.ts`) with `environment: 'node'`.
2) A new test folder (ex: `tests/server-node/`) for route tests that should run in Node.
3) A `test:node` script that runs only the Node suite.
4) Optional `tests/setup-node.ts` for per-suite setup (env defaults, mocks).

## Minimal example (conceptual)
```ts
// vitest.node.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/server-node/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup-node.ts']
  }
});
```

```json
// package.json
{
  "scripts": {
    "test:node": "vitest -c vitest.node.config.ts"
  }
}
```

## Suggested first tests to move or clone
- `tests/server/projects-route.test.ts`
- `tests/server/edit-route.test.ts`

## Scope guidance
Keep the Node suite small and targeted. The goal is to catch runtime differences, not duplicate the entire test suite.
