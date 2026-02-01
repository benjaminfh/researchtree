// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { maybeBootstrapLocalPg } from '@/src/server/localPgBootstrap';

maybeBootstrapLocalPg()
  .then(() => {
    console.log('[local-pg] Migrations complete.');
  })
  .catch((error) => {
    console.error('[local-pg] Migration failed:', error);
    process.exitCode = 1;
  });
