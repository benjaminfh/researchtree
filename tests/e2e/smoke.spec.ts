// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { test, expect, type Page } from '@playwright/test';

async function saveCanvas(page: Page, text: string) {
  const editor = page.getByTestId('canvas-editor');
  await editor.fill(text);
  const responsePromise = page.waitForResponse((response) => {
    return response.url().includes('/artefact') && response.request().method() === 'PUT' && response.ok();
  });
  await responsePromise;
  await expect(editor).toHaveValue(text);
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
  await expect.poll(() => list.count()).toBeGreaterThan(previousCount);
}

async function expectActiveBranch(page: Page, branchName: string) {
  const branchButton = page.locator(`[data-testid="branch-switch"][data-branch-name="${branchName}"]`);
  await expect(branchButton).toHaveClass(/bg-primary\/15/);
}

async function switchToBranch(page: Page, branchName: string) {
  const branchButton = page.locator(`[data-testid="branch-switch"][data-branch-name="${branchName}"]`);
  await branchButton.click();
  await expectActiveBranch(page, branchName);
}

test('workspace smoke flow', async ({ page }) => {
  const stamp = Date.now();
  const projectName = `PW Smoke ${stamp}`;
  const trunkCanvas = `Main canvas ${stamp}`;
  const branchCanvas = `Branch canvas ${stamp}`;
  const regularBranch = `branch-regular-${stamp}`;
  const assistantBranch = `branch-assistant-${stamp}`;
  const editBranch = `branch-edit-${stamp}`;
  const message1 = `Hello ${stamp}`;
  const message2 = `Branch message ${stamp}`;
  const message3 = `Assistant branch msg ${stamp}`;
  const message4 = `Edit branch msg ${stamp}`;

  await page.goto('/');
  await page.getByTestId('create-project-name').fill(projectName);
  await page.getByTestId('create-project-description').fill('Playwright smoke test');
  await page.getByTestId('create-project-provider').selectOption('openai');
  await page.getByTestId('create-project-submit').click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-message-list')).toBeVisible();

  const trunkButton = page.locator('[data-testid="branch-switch"][data-branch-trunk="true"]');
  const trunkName = await trunkButton.getAttribute('data-branch-name');
  if (!trunkName) {
    throw new Error('Trunk branch name not found in branch list.');
  }

  const initialCount = await page.getByTestId('chat-message-list').locator('article').count();
  await page.getByPlaceholder('Ask anything').fill(message1);
  await page.getByLabel('Send message').click();
  await expect(page.getByText(message1)).toBeVisible();
  await waitForAssistantResponse(page, initialCount);

  await saveCanvas(page, trunkCanvas);

  await page.getByTestId('branch-new-button').click();
  await expect(page.getByTestId('branch-popover')).toBeVisible();
  await page.getByTestId('branch-provider-select-popover').selectOption('gemini');
  await page.getByTestId('branch-form-popover-input').fill(regularBranch);
  await page.getByTestId('branch-form-popover-submit').click();
  await expect(page.locator(`[data-testid="branch-switch"][data-branch-name="${regularBranch}"]`)).toBeVisible();
  await expectActiveBranch(page, regularBranch);

  await saveCanvas(page, branchCanvas);

  await switchToBranch(page, trunkName);
  await expect(page.getByTestId('canvas-editor')).toHaveValue(trunkCanvas);
  await switchToBranch(page, regularBranch);
  await expect(page.getByTestId('canvas-editor')).toHaveValue(branchCanvas);

  const geminiCount = await page.getByTestId('chat-message-list').locator('article').count();
  await page.getByPlaceholder('Ask anything').fill(message2);
  await page.getByLabel('Send message').click();
  await expect(page.getByText(message2)).toBeVisible();
  await waitForAssistantResponse(page, geminiCount);

  await page.getByRole('button', { name: 'Create branch from message' }).last().click();
  await expect(page.getByTestId('branch-popover')).toBeVisible();
  await page.getByTestId('branch-provider-select-popover').selectOption('anthropic');
  await page.getByTestId('branch-form-popover-input').fill(assistantBranch);
  await page.getByTestId('branch-form-popover-submit').click();
  await expect(page.locator(`[data-testid="branch-switch"][data-branch-name="${assistantBranch}"]`)).toBeVisible();
  await expectActiveBranch(page, assistantBranch);

  const anthropicCount = await page.getByTestId('chat-message-list').locator('article').count();
  await page.getByPlaceholder('Ask anything').fill(message3);
  await page.getByLabel('Send message').click();
  await expect(page.getByText(message3)).toBeVisible();
  await waitForAssistantResponse(page, anthropicCount);

  await page.getByRole('button', { name: 'Edit message' }).last().click();
  await expect(page.getByTestId('edit-modal')).toBeVisible();
  await page.getByTestId('edit-branch-name').fill(editBranch);
  await page.getByTestId('edit-content').fill(`${message3} updated`);
  await page.getByTestId('edit-submit').click();
  await expect(page.getByTestId('edit-modal')).toBeHidden();
  await expect(page.locator(`[data-testid="branch-switch"][data-branch-name="${editBranch}"]`)).toBeVisible();
  await expectActiveBranch(page, editBranch);

  const editCount = await page.getByTestId('chat-message-list').locator('article').count();
  await page.getByPlaceholder('Ask anything').fill(message4);
  await page.getByLabel('Send message').click();
  await expect(page.getByText(message4)).toBeVisible();
  await waitForAssistantResponse(page, editCount);

  await page.getByRole('button', { name: 'Star node' }).last().click();
  await expect(page.getByRole('button', { name: 'Unstar node' }).last()).toBeVisible();

  await page.getByRole('button', { name: 'All' }).click();
  const graphLabel = message1.slice(0, 30);
  await page.getByTestId('graph-panel').getByText(graphLabel).click();
  await page.getByRole('button', { name: 'Jump to message' }).click();
  await expect(page.getByText(message1)).toBeVisible();

  await switchToBranch(page, regularBranch);
  await page.getByTestId('merge-open-button').click();
  await expect(page.getByTestId('merge-modal')).toBeVisible();
  await page.getByTestId('merge-target').selectOption({ value: trunkName });
  await page.getByTestId('merge-summary').fill(`Merge ${regularBranch} into trunk`);
  await expect(page.getByTestId('merge-diff')).toContainText(branchCanvas);
  await page.getByTestId('merge-submit').click();
  await expect(page.getByTestId('merge-modal')).toBeHidden();
  await expect(page.getByText('Merged from')).toBeVisible();

  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page).toHaveURL(/\/$/);

  const projectCard = page.locator('li', { hasText: projectName });
  await projectCard.getByTestId('archive-workspace').click();
  await projectCard.getByTestId('archive-workspace').click();

  await page.getByRole('button', { name: 'Archived' }).click();
  const archivedCard = page.locator('li', { hasText: projectName });
  await archivedCard.getByTestId('unarchive-workspace').click();
  await archivedCard.getByTestId('unarchive-workspace').click();
});
