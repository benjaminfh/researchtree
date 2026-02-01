// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React from 'react';
import { getIconPaths, IconSize } from '@blueprintjs/icons';

export function BlueprintIcon({
  icon,
  className,
  title,
}: {
  icon: string;
  className?: string;
  title?: string;
}) {
  const paths = getIconPaths(icon as never, IconSize.STANDARD);
  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
      className={className}
      fill="currentColor"
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d: string, idx: number) => (
        <path key={`${icon}-${idx}`} d={d} />
      ))}
    </svg>
  );
}
