// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import fs from 'node:fs';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function globalSetup(config: FullConfig) {
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

  const authDir = path.join(__dirname, '.auth');
  const storageStatePath = path.join(authDir, 'state.json');
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login#existing-user`, { waitUntil: 'domcontentloaded' });

  const signInButton = page.getByRole('button', { name: 'Sign in' });
  if (await signInButton.isVisible()) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await signInButton.click();
  }

  const baseUrlPattern = new RegExp(`^${escapeRegex(baseURL)}/?$`);
  await page.waitForURL(baseUrlPattern, { timeout: 60_000 });

  const seedResponse = await page.context().request.put(`${baseURL}/api/profile`, {
    data: { openaiToken: openaiKey, geminiToken: geminiKey, anthropicToken: anthropicKey }
  });
  if (!seedResponse.ok()) {
    throw new Error(`Failed to seed profile token (status ${seedResponse.status()}).`);
  }

  await page.context().storageState({ path: storageStatePath });
  await browser.close();
}
