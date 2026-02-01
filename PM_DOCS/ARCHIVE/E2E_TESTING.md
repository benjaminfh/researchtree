<!-- Copyright (c) 2025 Benjamin F. Hall
SPDX-License-Identifier: MIT -->

# E2E Testing (Playwright)

This repo already depends on `@playwright/test`, but no Playwright config or tests are wired yet.
This note captures the recommended first-pass setup and a smoke-test sketch.

## Recommended Setup

The API routes use `requireUser`, which only bypasses Supabase in local Postgres mode.
For E2E tests, prefer local PG mode (no Supabase dependency).

Environment prerequisites:
- `RT_STORE=pg`
- `RT_PG_ADAPTER=local`
- `LOCAL_PG_URL=postgresql://localhost:5432/youruser`
- `RT_PG_BOOTSTRAP=1` (auto-run migrations)
- `LLM_DEFAULT_PROVIDER=mock`
- Disable other providers for deterministic runs.

## Sample Config (Sketch)

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:3000'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      RT_STORE: 'pg',
      RT_PG_ADAPTER: 'local',
      LOCAL_PG_URL: 'postgresql://localhost:5432/youruser',
      RT_PG_BOOTSTRAP: '1',
      LLM_DEFAULT_PROVIDER: 'mock',
      LLM_ENABLE_OPENAI: 'false',
      LLM_ENABLE_GEMINI: 'false',
      LLM_ENABLE_ANTHROPIC: 'false'
    }
  }
});
```

## Smoke Test (Sketch)

Create `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('workspace smoke flow', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Workspace Name').fill('Playwright Smoke');
  await page.getByRole('button', { name: 'Create Workspace' }).click();

  await expect(page).toHaveURL(/\/projects\//);

  await page.getByPlaceholder('Ask anything').fill('Hello from Playwright');
  await page.keyboard.press('Meta+Enter');

  await expect(page.getByText('Hello from Playwright')).toBeVisible();

  await page.getByRole('button', { name: 'Branches' }).click();
  await page.getByRole('menuitem', { name: 'New branch' }).click();
  await page.getByLabel('Branch name').fill('pw-branch');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: 'Merge' }).click();
  await page.getByLabel('Summary').fill('Bring back pw work');
  await page.getByRole('button', { name: 'Merge branch' }).click();

  await expect(page.getByText('Merge summary')).toBeVisible();
});
```

## Notes

- If local PG is not feasible, add a test-only auth bypass (env-guarded) so `requireUser` returns a fixed user in dev/e2e.
- Update selectors to match current UI labels (e.g., branch/merge menus may differ).
- Keep the first test short: create → chat → branch → merge.
