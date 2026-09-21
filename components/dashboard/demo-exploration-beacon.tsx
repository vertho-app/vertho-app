'use client';

import { useEffect } from 'react';
import { DEMO_PRESENTATION_TICKET_PARAM, DEMO_PRESENTATION_TICKET_STORAGE_KEY, getDemoPresentationRoleFromHostname } from '@/lib/demo/presentation';
import type { ExploracaoDegustacao } from '@/lib/demo/degustacao-metricas';

/** Montar só no ramo de sucesso, com dados. Navegação/clique/erro não contam. */
export default function DemoExplorationBeacon({ alvo }: { alvo: ExploracaoDegustacao }) {
  useEffect(() => {
    if (!getDemoPresentationRoleFromHostname(window.location.hostname)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible' || sent) return;
      timer = setTimeout(() => {
        try {
          const ticket = new URLSearchParams(window.location.search).get(DEMO_PRESENTATION_TICKET_PARAM)
            || sessionStorage.getItem(DEMO_PRESENTATION_TICKET_STORAGE_KEY);
          if (!ticket) return;
          sent = true;
          void fetch('/auth/degustacao/exploracao', { method: 'POST', credentials: 'same-origin', keepalive: true,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, alvo }) }).catch(() => {});
        } catch { /* Telemetria não bloqueia conteúdo nem navegação. */ }
      }, 2000);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule); };
  }, [alvo]);
  return null;
}
