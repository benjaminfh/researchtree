// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const useWebServer = process.env.E2E_NO_WEB_SERVER !== '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL,
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: useWebServer
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
    : undefined,
  globalSetup: 'tests/e2e/global-setup.ts'
});
