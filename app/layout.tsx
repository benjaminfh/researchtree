import type { Metadata } from 'next';
import './globals.css';
import { APP_NAME } from '@/src/config/app';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Git-backed reasoning workspace'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-text antialiased">{children}</body>
    </html>
  );
}
