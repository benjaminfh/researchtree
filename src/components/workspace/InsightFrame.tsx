import React from 'react';
import type { ReactNode } from 'react';

interface InsightFrameProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}

export function InsightFrame({ children, className, innerClassName }: InsightFrameProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl bg-[rgba(238,243,255,0.7)] p-4 ${className ?? ''}`.trim()}
    >
      <div
        className={`h-full min-h-0 overflow-hidden rounded-lg border border-divider/80 bg-white shadow-sm ${
          innerClassName ?? ''
        }`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
