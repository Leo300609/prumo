import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    // o widget da Pluggy abre em iframe a partir de *.pluggy.ai
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.pluggy.ai",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.pluggy.ai",
      "connect-src 'self' https://*.pluggy.ai",
      "frame-src https://*.pluggy.ai",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const config: NextConfig = {
  // standalone é para o Docker; a Vercel empacota por conta própria
  output: process.env.VERCEL ? undefined : 'standalone',
  poweredByHeader: false,
  // as queries SQL são lidas do disco em runtime: precisam ir junto no build standalone
  outputFileTracingIncludes: { '/**': ['./db/**/*'] },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default config;
