import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import { RegisterSW } from '../components/RegisterSW.tsx';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display-face', display: 'swap' });
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

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
    { media: '(prefers-color-scheme: light)', color: '#ECEFF3' },
    { media: '(prefers-color-scheme: dark)', color: '#090F1C' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const theme = jar.get('prumo_theme')?.value;
  const privacy = jar.get('prumo_privacy')?.value === '1';
  return (
    <html lang="pt-BR" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}
      className={[display.variable, body.variable, privacy ? 'privacy' : ''].filter(Boolean).join(' ')}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
