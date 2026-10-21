import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { RegisterSW } from '../components/RegisterSW.tsx';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prumo',
  description: 'Suas finanças no prumo.',
  applicationName: 'Prumo',
  appleWebApp: { capable: true, title: 'Prumo', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // conteúdo vai até as bordas; as margens seguras vêm do CSS (env(safe-area-inset-*))
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F3EC' },
    { media: '(prefers-color-scheme: dark)', color: '#0C1322' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const theme = jar.get('prumo_theme')?.value;
  const privacy = jar.get('prumo_privacy')?.value === '1';
  return (
    <html lang="pt-BR" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}
      className={privacy ? 'privacy' : undefined}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
