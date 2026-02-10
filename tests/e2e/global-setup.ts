// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type FullConfig } from '@playwright/test';

function hydrateEnvFromFile(filePath: string) {
  if (process.env.CI) return;
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2] ?? '';
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function globalSetup(config: FullConfig) {
  hydrateEnvFromFile(path.resolve(process.cwd(), '.env.local'));
  const baseURL = (config.projects[0]?.use?.baseURL as string | undefined) ?? 'http://localhost:3000';
  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD must be set to run Playwright smoke tests.');
  }
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openaiKey || !geminiKey || !anthropicKey) {
    throw new Error('OPENAI_API_KEY, GEMINI_API_KEY, and ANTHROPIC_API_KEY must be set for provider smoke.');
  }

  const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth');
  const storageStatePath = path.join(authDir, 'state.json');
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login#existing-user`, { waitUntil: 'domcontentloaded' });

  const signInButton = page.getByRole('button', { name: 'Sign in' });
  if (!(await signInButton.isVisible())) {
    const existingUserToggle = page.getByRole('button', { name: 'Existing User' });
    if (await existingUserToggle.isVisible()) {
      await existingUserToggle.click();
    }
  }
  await signInButton.waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name="password"][type="password"]').fill(password);
  await signInButton.click();

  const baseUrlPattern = new RegExp(`^${escapeRegex(baseURL)}/?$`);
  try {
    await page.waitForURL(baseUrlPattern, { timeout: 45_000 });
  } catch {
    // Ignore URL wait; we will fall back to checking the home page content.
  }

  try {
    await page.getByTestId('create-project-form').waitFor({ state: 'visible', timeout: 45_000 });
  } catch {
    const errorText = await page.locator('form p.text-red-700').first().textContent().catch(() => '');
    throw new Error(
      `Login did not complete within timeout. Check E2E_EMAIL/E2E_PASSWORD. ${errorText ? `Form error: ${errorText}` : ''}`.trim()
    );
  }

  const seedResponse = await page.context().request.put(`${baseURL}/api/profile`, {
    data: { openaiToken: openaiKey, geminiToken: geminiKey, anthropicToken: anthropicKey }
  });
  if (!seedResponse.ok()) {
    throw new Error(`Failed to seed profile token (status ${seedResponse.status()}).`);
  }

  await page.context().storageState({ path: storageStatePath });
  await browser.close();
}
