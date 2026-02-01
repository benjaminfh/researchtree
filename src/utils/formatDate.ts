// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC'
});

/**
 * Format a timestamp consistently across server and client to avoid hydration mismatches.
 */
export const formatDateTime = (value: number | string) => dateTimeFormatter.format(new Date(value));
