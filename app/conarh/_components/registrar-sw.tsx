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
    // 🔴 NUNCA registrar sem `scope`. O arquivo está na raiz de /public, então o
    // escopo PADRÃO seria '/' — o mesmo de `/sw.js`, o worker de push. Registrar
    // outro script no mesmo escopo SUBSTITUI a registration existente: o handler
    // de `push` sumiria e as inscrições parariam de entregar, sem erro nenhum.
    // E como este worker tem handler de `fetch` (modo avião da demo), ele
    // passaria a cachear o app inteiro para todo mundo.
    //
    // Havia aqui um fallback `.catch(() => register('/conarh-sw.js'))` sem scope.
    // Era correto quando foi escrito — o push não existia — e virou bomba quando
    // o vizinho mudou. Pedir escopo MAIS ESTREITO que o do script é sempre
    // permitido, então o registro abaixo não precisa de fallback: se ele falhar,
    // o browser não suporta e a demo segue com rede, que é o comportamento
    // desejado.
    navigator.serviceWorker
      .register('/conarh-sw.js', { scope: '/conarh' })
      .catch(() => {});
  }, []);

  return null;
}
