import React from 'react';
import { RailLayout, type RailLayoutContext } from '@/src/components/layout/RailLayout';

type RailPageLayoutProps = {
  renderRail: (ctx: RailLayoutContext) => React.ReactNode;
  renderMain: (ctx: RailLayoutContext) => React.ReactNode;
};

export function RailPageLayout({ renderRail, renderMain }: RailPageLayoutProps) {
  return (
    <RailLayout
      outerClassName="h-screen overflow-hidden bg-white text-slate-800"
      asideClassName="relative z-40 flex h-screen flex-col border-r border-divider/80 bg-[rgba(238,243,255,0.85)] px-3 py-6 backdrop-blur"
      mainClassName="h-screen min-h-0 min-w-0 overflow-hidden"
      renderRail={renderRail}
      renderMain={renderMain}
    />
  );
}
