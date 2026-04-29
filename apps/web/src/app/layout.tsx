import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'NaturalShea ERP',
  description: 'NaturalShea Care — ERP platform',
  manifest: '/manifest.webmanifest',
  themeColor: '#8a6128',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-shea-50 text-shea-900 antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
