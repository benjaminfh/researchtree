// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import React from 'react';
import { useCommandEnterSubmit } from '@/src/hooks/useCommandEnterSubmit';

type CommandEnterFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  children: React.ReactNode;
  enableCommandEnter?: boolean;
};

export function CommandEnterForm({
  children,
  enableCommandEnter = true,
  onKeyDown,
  ...formProps
}: CommandEnterFormProps) {
  const handleCommandEnter = useCommandEnterSubmit({ enabled: enableCommandEnter });

  return (
    <form
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        handleCommandEnter(event);
      }}
      {...formProps}
    >
      {children}
    </form>
  );
}
