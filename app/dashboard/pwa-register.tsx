'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker da PWA com escopo /dashboard/.
 * Só roda em produção pra evitar conflito com Turbopack/HMR em dev.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/dashboard/' })
      .catch((err) => {
        console.warn('[pwa] falha ao registrar service worker:', err);
      });
  }, []);

  return null;
}
