'use client';

import { useEffect } from 'react';

/** Registra o service worker (instalação como app + página offline). */
export function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
