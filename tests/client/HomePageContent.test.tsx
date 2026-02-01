// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePageContent } from '@/src/components/home/HomePageContent';
import { storageKey } from '@/src/config/app';

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

vi.mock('@/src/components/projects/CreateProjectForm', () => ({
  CreateProjectForm: () => <div data-testid="create-project-form" />
}));

vi.mock('@/src/components/auth/AuthRailStatus', () => ({
  AuthRailStatus: () => null
}));

vi.mock('@/src/components/layout/RailPageLayout', () => ({
  RailPageLayout: ({ renderRail, renderMain }: { renderRail: (ctx: any) => React.ReactNode; renderMain: (ctx: any) => React.ReactNode }) => {
    const ctx = { railCollapsed: false, toggleRail: () => {} };
    return (
      <div>
        <div data-testid="rail">{renderRail(ctx)}</div>
        <div data-testid="main">{renderMain(ctx)}</div>
      </div>
    );
  }
}));

const projects = [
  {
    id: 'p1',
    name: 'Alpha Workspace',
    description: 'Alpha description',
    createdAt: '2025-01-01T00:00:00.000Z',
    branchName: 'main',
    nodeCount: 3,
    lastModified: Date.UTC(2025, 0, 15, 12, 0, 0)
  },
  {
    id: 'p2',
    name: 'Beta Workspace',
    description: 'Beta description',
    createdAt: '2025-01-02T00:00:00.000Z',
    branchName: 'main',
    nodeCount: 1,
    lastModified: Date.UTC(2025, 0, 16, 12, 0, 0)
  }
];

const providerOptions = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' }
] as const;

describe('HomePageContent archive behavior', () => {
  const archiveKey = storageKey('archived-projects');
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ llmTokens: { openai: { configured: true } } })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('archives a project after confirmation and persists localStorage', async () => {
    const user = userEvent.setup();
    render(<HomePageContent projects={projects} providerOptions={providerOptions} defaultProvider="openai" />);

    const alphaLink = await screen.findByRole('link', { name: /Alpha Workspace/ });
    const alphaItem = alphaLink.closest('li');
    expect(alphaItem).not.toBeNull();

    const archiveButton = within(alphaItem as HTMLElement).getByRole('button', { name: 'Archive workspace' });
    await user.click(archiveButton);
    const confirmButton = within(alphaItem as HTMLElement).getByRole('button', { name: 'Confirm archive' });
    await user.click(confirmButton);

    const archivedToggle = screen.getByRole('button', { name: 'Archived' });
    await user.click(archivedToggle);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Alpha Workspace/ })).toBeNull();
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.getByText('Alpha Workspace')).toBeInTheDocument();
    });

    const stored = window.localStorage.getItem(archiveKey);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual(['p1']);
  });

  it('unarchives a project after confirmation and updates localStorage', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(archiveKey, JSON.stringify(['p1']));

    render(<HomePageContent projects={projects} providerOptions={providerOptions} defaultProvider="openai" />);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Alpha Workspace/ })).toBeNull();
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    const archivedToggle = screen.getByRole('button', { name: 'Archived' });
    await user.click(archivedToggle);

    const unarchiveButton = screen.getByRole('button', { name: 'Unarchive workspace' });
    await user.click(unarchiveButton);
    const confirmButton = screen.getByRole('button', { name: 'Confirm unarchive' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Alpha Workspace/ })).toBeInTheDocument();
    });

    const stored = window.localStorage.getItem(archiveKey);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual([]);
  });
});
