'use client';

import { useEffect, useRef } from 'react';

/**
 * Polling que só roda com a aba VISÍVEL — e que atualiza na hora em que ela
 * volta a aparecer.
 *
 * 🔴 POR QUE ISTO EXISTE (medido em 15/08/2026): quem atende reclamou que as
 * respostas demoravam a aparecer. O webhook não era o culpado — ele grava em
 * **2-3 segundos** (`recebida_em` × `created_at` no banco). A demora era da
 * tela: um `setInterval` de 15s, igual para tudo, rodando mesmo com a aba
 * escondida.
 *
 * Duas correções num mecanismo só:
 *
 * 1. **Voltar para a aba dispara uma atualização imediata.** É o gesto que a
 *    pessoa faz quando quer ver se chegou algo — esperar mais 15s depois de
 *    olhar para a tela é o que produz a sensação de "não chega nunca".
 * 2. **Aba escondida não consulta.** Antes, uma janela aberta e esquecida
 *    batia no banco a cada 15s indefinidamente; com a caixa da equipe isso
 *    eram várias consultas por ciclo, sem ninguém olhando.
 *
 * O callback vai numa ref de propósito: assim mudar a função (ela depende da
 * conversa aberta) NÃO recria o timer. Um timer recriado a cada render é um
 * timer que nunca dispara — o `clearInterval` chega sempre antes do prazo, e o
 * polling simplesmente não acontece, sem erro nenhum.
 */
export function useIntervaloVisivel(callback: () => void, ms: number, ligado = true) {
  const fn = useRef(callback);
  fn.current = callback;

  useEffect(() => {
    if (!ligado) return;

    const visivel = () => typeof document === 'undefined' || document.visibilityState === 'visible';

    const id = setInterval(() => { if (visivel()) fn.current(); }, ms);

    const aoVoltar = () => { if (visivel()) fn.current(); };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [ms, ligado]);
}
