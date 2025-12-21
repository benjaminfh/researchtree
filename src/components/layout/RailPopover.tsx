'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

type RailPopoverProps = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
  viewportPadding?: number;
  gap?: number;
};

export function RailPopover({
  open,
  anchorRef,
  children,
  ariaLabel,
  className,
  viewportPadding = 12,
  gap = 12,
}: RailPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [isPositioned, setIsPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setIsPositioned(false);
      setPopoverStyle({});
      return;
    }

    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;

    function updatePosition() {
      const anchorEl = anchorRef.current;
      const popoverEl = popoverRef.current;
      if (!anchorEl || !popoverEl) return;

      const anchor = anchorEl.getBoundingClientRect();
      const popoverRect = popoverEl.getBoundingClientRect();

      const maxHeight = Math.max(120, window.innerHeight - viewportPadding * 2);
      const effectiveHeight = Math.min(popoverRect.height, maxHeight);

      let top = anchor.top + anchor.height / 2 - effectiveHeight / 2;
      const maxTop = window.innerHeight - viewportPadding - effectiveHeight;
      top = Math.min(Math.max(top, viewportPadding), Math.max(viewportPadding, maxTop));

      let left = anchor.right + gap;
      const maxLeft = window.innerWidth - viewportPadding - popoverRect.width;
      left = Math.min(Math.max(left, viewportPadding), Math.max(viewportPadding, maxLeft));

      setPopoverStyle({
        position: 'fixed',
        top,
        left,
        maxHeight,
      });
      setIsPositioned(true);
    }

    function schedule() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updatePosition();
        raf = requestAnimationFrame(updatePosition);
      });
    }

    setIsPositioned(false);
    setPopoverStyle({});
    updatePosition();
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(schedule);
      if (popoverRef.current) resizeObserver.observe(popoverRef.current);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      resizeObserver?.disconnect();
    };
  }, [open, anchorRef, viewportPadding, gap]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className={[
        'z-50 overflow-y-auto rounded-2xl border border-divider/80 bg-white/95 shadow-lg backdrop-blur',
        'transition-opacity',
        isPositioned ? 'opacity-100' : 'pointer-events-none opacity-0',
        className ?? '',
      ].join(' ')}
      role="dialog"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
