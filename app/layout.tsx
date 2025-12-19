import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { AuthStatusPill } from '@/src/components/auth/AuthStatusPill';

export const metadata: Metadata = {
  title: 'SideQuest',
  description: 'Git-backed reasoning workspace'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-text antialiased">
        {children}
        <Suspense fallback={null}>
          <AuthStatusPill />
        </Suspense>
      </body>
    </html>
  );
}
