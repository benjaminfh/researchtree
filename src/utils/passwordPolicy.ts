// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

export const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export function getPasswordPolicyError(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    return 'Password must include lowercase and uppercase letters, a digit, and a symbol.';
  }
  return null;
}

export const PASSWORD_POLICY_HINT =
  'Minimum 10 characters. Use lowercase and uppercase letters, digits, and symbols.';
