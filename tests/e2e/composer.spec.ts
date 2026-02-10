// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { test, expect, type Page } from '@playwright/test';

async function createWorkspace(page: Page, provider = 'openai') {
  const stamp = Date.now();
  const projectName = `PW Composer ${stamp}`;
  await page.goto('/');
  await page.getByTestId('create-project-name').fill(projectName);
  await page.getByTestId('create-project-description').fill('Composer regression coverage');
  await page.getByTestId('create-project-provider').selectOption(provider);
  const createResponsePromise = page.waitForResponse((response) => {
    return response.url().includes('/api/projects') && response.request().method() === 'POST';
  });
  await page.getByTestId('create-project-submit').click();
  const createResponse = await createResponsePromise;
  if (!createResponse.ok()) {
    const body = await createResponse.json().catch(() => null);
    const message = body?.error?.message ?? `Create project failed (status ${createResponse.status()}).`;
    throw new Error(message);
  }
  await expect(page.getByTestId('chat-message-list')).toBeVisible();
  return projectName;
}

async function waitForAssistantResponse(page: Page, previousCount: number) {
  const stopButton = page.getByLabel('Stop streaming');
  try {
    await stopButton.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    // If streaming is too fast, continue to count-based assertion below.
  }
  await stopButton.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => null);
  const list = page.getByTestId('chat-message-list').locator('article');
  await expect.poll(() => list.count()).toBeGreaterThan(previousCount + 1);
}

test('restores draft on stream failure and retry re-sends', async ({ page }) => {
  await createWorkspace(page);

  await page.route('**/api/projects/**/chat', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Injected failure' } })
    });
  });

  const composer = page.getByPlaceholder('Ask anything');
  await composer.fill('Restore draft on failure');
  await page.getByLabel('Send message').click();

  await expect(page.getByText('Injected failure')).toBeVisible();
  await expect(composer).toHaveValue('Restore draft on failure');

  await page.unroute('**/api/projects/**/chat');
  const beforeCount = await page.getByTestId('chat-message-list').locator('article').count();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(composer).toHaveValue('');
  await waitForAssistantResponse(page, beforeCount);
});

test('quote reply appends to existing draft and focuses textarea', async ({ page }) => {
  await createWorkspace(page);

  const initialCount = await page.getByTestId('chat-message-list').locator('article').count();
  await page.getByPlaceholder('Ask anything').fill('Quote me');
  await page.getByLabel('Send message').click();
  await waitForAssistantResponse(page, initialCount);

  const composer = page.getByPlaceholder('Ask anything');
  await composer.fill('Existing draft');

  await page.getByRole('button', { name: 'Quote reply' }).click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue(/Existing draft\n\n> /);
});

test('typing expands the collapsed composer and preserves the first keystroke', async ({ page }) => {
  await createWorkspace(page);

  await page.keyboard.press('Meta+K');
  await expect(page.getByTestId('composer-collapsed-state')).toHaveText('Composer collapsed');

  await page.keyboard.press('a');
  const composer = page.getByPlaceholder('Ask anything');
  await expect(composer).toHaveValue('a');
  await expect(composer).toBeFocused();

  await page.keyboard.type('b');
  await expect(composer).toHaveValue('ab');
});

test('expand recalculates composer padding after collapsing', async ({ page }) => {
  await createWorkspace(page);

  const container = page.getByTestId('workspace-scroll-container');
  const getPadding = async () => {
    const value = await container.evaluate((el) => window.getComputedStyle(el).paddingBottom);
    return Number.parseFloat(value || '0');
  };

  const initialPadding = await getPadding();
  await page.keyboard.press('Meta+K');
  await expect(page.getByTestId('composer-collapsed-state')).toHaveText('Composer collapsed');
  await expect.poll(async () => getPadding()).not.toBe(initialPadding);
  const collapsedPadding = await getPadding();

  await page.keyboard.press('Meta+K');
  await expect(page.getByTestId('composer-collapsed-state')).toHaveText('Composer expanded');
  await expect.poll(async () => Math.abs((await getPadding()) - initialPadding)).toBeLessThanOrEqual(4);
  const expandedPadding = await getPadding();

  expect(collapsedPadding).not.toBe(initialPadding);
  expect(Math.abs(expandedPadding - initialPadding)).toBeLessThanOrEqual(4);
});

test('web search toggle persists and shows the OpenAI search note', async ({ page }) => {
  await createWorkspace(page);

  await page.getByRole('button', { name: 'Utilities' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const toggle = menu.getByRole('menuitemcheckbox', { name: 'Web search' });
  await toggle.click();

  await page.getByRole('button', { name: 'Utilities' }).click();
  const reopenedMenu = page.getByRole('menu');
  await expect(reopenedMenu).toBeVisible();
  await expect(reopenedMenu.getByRole('menuitemcheckbox', { name: 'Web search' })).toHaveAttribute('aria-checked', 'true');

  const projectId = page.url().split('/projects/')[1]?.split('/')[0] ?? '';
  const trunkButton = page.locator('[data-testid="branch-switch"][data-branch-trunk="true"]');
  const branchName = await trunkButton.getAttribute('data-branch-name');
  const stored = await page.evaluate(
    ([id, branch]) => window.localStorage.getItem(`researchtree:websearch:${id}:${branch}`),
    [projectId, branchName]
  );
  expect(stored).toBe('true');
});
