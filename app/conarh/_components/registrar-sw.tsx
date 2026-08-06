'use client';

// CONARH 52 — registra o service worker que deixa a demo abrir em MODO AVIÃO.
//
// Fica só na rota /conarh: o resto do app é multi-tenant e autenticado, e um SW
// com escopo global cachearia tela de cliente.
//
// O registro é silencioso de propósito. Se falhar (Safari antigo, modo privado,
// política de rede), a demo continua funcionando com rede — o que não pode é a
// tela mostrar um erro de instalação na frente do visitante.

import { useEffect } from 'react';

export function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // `scope: /conarh` exige o header Service-Worker-Allowed OU o arquivo servido
    // de dentro do escopo. O arquivo está na raiz de /public, então o escopo
    // padrão seria '/' — pedimos o de /conarh explicitamente e, se o browser
    // recusar, caímos no registro simples (que ainda cacheia, com escopo maior).
    navigator.serviceWorker
      .register('/conarh-sw.js', { scope: '/conarh' })
      .catch(() => navigator.serviceWorker.register('/conarh-sw.js').catch(() => {}));
  }, []);

  return null;
}
