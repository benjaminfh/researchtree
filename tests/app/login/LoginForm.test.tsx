// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LoginForm } from '@/app/login/LoginForm';

vi.mock('@/app/login/actions', () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn()
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    useFormState: (_action: unknown, initialState: unknown) => [initialState, vi.fn()],
    useFormStatus: () => ({ pending: false })
  };
});

describe('LoginForm initial mode', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('defaults to sign-up mode when initialMode is signUp', () => {
    render(<LoginForm redirectTo="/" waitlistEnforced={false} initialEmail={null} initialMode="signUp" />);

    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument();
  });

  it('defaults to sign-in mode when initialMode is signIn', () => {
    render(<LoginForm redirectTo="/" waitlistEnforced={false} initialEmail={null} initialMode="signIn" />);

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('switches to sign-in mode when the URL hash indicates an existing user', async () => {
    window.location.hash = '#existing-user';

    render(<LoginForm redirectTo="/" waitlistEnforced={false} initialEmail={null} initialMode="signUp" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
