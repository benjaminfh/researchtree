import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';

const refreshMock = vi.fn();
const pushMock = vi.fn();
const providerOptions = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' }
] as const;
const defaultProvider = 'openai';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: pushMock
  })
}));

const originalFetch = global.fetch;

describe('CreateProjectForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    refreshMock.mockReset();
    pushMock.mockReset();
    vi.restoreAllMocks();
  });

  it('validates the project name field before submitting', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<CreateProjectForm providerOptions={providerOptions} defaultProvider={defaultProvider} />);

    await user.type(screen.getByLabelText('Workspace Name', { selector: 'input' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByText('Project name is required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the projects API and navigates to the new workspace on success', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ id: 'proj-123' })
      } as Response)
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<CreateProjectForm providerOptions={providerOptions} defaultProvider={defaultProvider} />);

    const nameInput = screen.getAllByLabelText('Workspace Name', { selector: 'input' })[0];
    const descriptionInput = screen.getAllByLabelText('Description (optional)')[0];
    await user.type(nameInput, 'New Project');
    await user.type(descriptionInput, 'Exploration work');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Project', description: 'Exploration work', provider: defaultProvider })
        })
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/projects/proj-123');
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('shows an error message when the API returns a failure', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: { message: 'Validation failed' } })
      } as Response)
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<CreateProjectForm providerOptions={providerOptions} defaultProvider={defaultProvider} />);

    const nameInput = screen.getAllByLabelText('Workspace Name', { selector: 'input' })[0];
    await user.type(nameInput, 'Broken Project');
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
