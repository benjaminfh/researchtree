// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { createBrowserClient } from '@supabase/ssr';
import { assertSupabaseConfigured } from './env';

export function createSupabaseBrowserClient() {
  const { url, anonKey } = assertSupabaseConfigured();
  return createBrowserClient(url, anonKey);
}

