// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export function toJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}
