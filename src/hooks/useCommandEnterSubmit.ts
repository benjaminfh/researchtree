// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import { useCallback } from 'react';
import type React from 'react';

type UseCommandEnterSubmitOptions = {
  enabled?: boolean;
};

export function useCommandEnterSubmit({ enabled = true }: UseCommandEnterSubmitOptions = {}) {
  return useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      if (event.key !== 'Enter') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey) return;

      const target = event.currentTarget as HTMLElement | null;
      const form = target?.closest('form');
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      if (!form.checkValidity()) {
        event.preventDefault();
        form.reportValidity?.();
        return;
      }

      event.preventDefault();
      form.requestSubmit();
    },
    [enabled]
  );
}
