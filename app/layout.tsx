import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ResearchTree',
  description: 'Git-backed reasoning workspace'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-text antialiased">{children}</body>
    </html>
  );
}
