'use client';

import { useEffect } from 'react';

const INTERACOES = ['pointerdown', 'touchstart', 'keydown', 'scroll'] as const;
const ESPERA_VISIVEL_MS = 2_500;

/**
 * Registra a PRIMEIRA abertura verificada do convite (versão B).
 *
 * O robô de preview do WhatsApp busca o link sem rodar JavaScript, e é por isso
 * que o registro mora aqui e não no servidor. Mesmo assim ele espera um sinal de
 * gente: a primeira interação, ou a página visível e com foco por alguns
 * segundos. Leitor de link que roda JavaScript sozinho (verificador de
 * antivírus, navegador automatizado) não interage nem declara foco, e
 * `navigator.webdriver` denuncia o automatizado.
 *
 * Também recarrega a página quando ela volta do cache do navegador (o botão
 * Voltar depois de abrir uma visão): sem isso, o marco "Visto" da visão que a
 * pessoa acabou de ver ficaria de fora até um recarregamento manual.
 */
export default function AberturaBeacon({ passe }: { passe: string }) {
  useEffect(() => {
    const aoMostrar = (evento: PageTransitionEvent) => {
      if (evento.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', aoMostrar);

    const automatizado = (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
    const preRenderizado = (document as Document & { prerendering?: boolean }).prerendering === true;
    if (!passe || automatizado || preRenderizado) {
      return () => window.removeEventListener('pageshow', aoMostrar);
    }

    let enviado = false;
    let espera: number | undefined;
    const limpar = () => {
      for (const evento of INTERACOES) window.removeEventListener(evento, enviar);
      if (espera !== undefined) window.clearTimeout(espera);
    };
    function enviar() {
      if (enviado) return;
      enviado = true;
      limpar();
      void fetch('/auth/degustacao/abertura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passe }),
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => { /* registro de abertura nunca atrapalha a página */ });
    }

    for (const evento of INTERACOES) window.addEventListener(evento, enviar, { passive: true });
    espera = window.setTimeout(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) enviar();
    }, ESPERA_VISIVEL_MS);

    return () => {
      limpar();
      window.removeEventListener('pageshow', aoMostrar);
    };
  }, [passe]);

  return null;
}
