import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock
  })
}));

const originalFetch = global.fetch;

describe('CreateProjectForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    refreshMock.mockReset();
    vi.restoreAllMocks();
  });

  it('validates the project name field before submitting', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<CreateProjectForm />);

    await user.type(screen.getByLabelText('Project Name', { selector: 'input' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    expect(await screen.findByText('Project name is required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the projects API and refreshes the router on success', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ id: 'proj-123' })
      } as Response)
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<CreateProjectForm />);

    const nameInput = screen.getAllByLabelText('Project Name', { selector: 'input' })[0];
    const descriptionInput = screen.getAllByLabelText('Description (optional)')[0];
    await user.type(nameInput, 'New Project');
    await user.type(descriptionInput, 'Exploration work');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Project', description: 'Exploration work' })
        })
      );
    });

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getAllByLabelText('Project Name', { selector: 'input' })[0]).toHaveValue('');
    expect(screen.getAllByLabelText('Description (optional)')[0]).toHaveValue('');
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

    render(<CreateProjectForm />);

    const nameInput = screen.getAllByLabelText('Project Name', { selector: 'input' })[0];
    await user.type(nameInput, 'Broken Project');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
