'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  GRAVACAO_TAG,
  GRAVACAO_TAMANHO_DA_ETIQUETA,
  entradaDaEtiqueta,
  redigirUrlDaGravacao,
} from '@/lib/demo/degustacao-gravacao';

/**
 * Liga a gravação de tela (Sentry Replay) para o lead da versão C.
 *
 * Existe porque o plano do Sentry dá 50 gravações por mês: gravar o app inteiro
 * as gastaria no primeiro dia, já que o mesmo código atende clientes reais. Por
 * isso `sentry.client.config.js` NÃO liga replay (taxas em 0) e este componente
 * é o único ponto que o liga, só onde monta: o início da C e a sala com um
 * desafio escolhido. O mapeamento (DISC) fica de fora de propósito.
 *
 * - Carrega o integrador da CDN do Sentry (`lazyLoadIntegration`), em vez de
 *   importá-lo: importar colocaria o replay no bundle de TODAS as telas.
 * - `replay.start()` grava em modo sessão independentemente das taxas.
 * - Campos de texto ficam mascarados e o que for da pessoa leva
 *   `data-sentry-mask`. O conteúdo das telas é de demonstração, então o texto
 *   delas fica visível (sem isso a gravação mostra só a moldura).
 * - Falha de carga (bloqueador de anúncio, rede) é silêncio: gravação nunca
 *   atrapalha a página nem vira erro para o lead.
 */

async function etiquetaDoConvite(codigo: string): Promise<string> {
  const bytes = new TextEncoder().encode(entradaDaEtiqueta(codigo));
  const resumo = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(resumo))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, GRAVACAO_TAMANHO_DA_ETIQUETA);
}

/** Gancho de gravação: tira a credencial das URLs que a gravação registra. */
function redigirEvento(evento: any) {
  try {
    const carga = evento?.data?.payload;
    if (carga && typeof carga === 'object') {
      for (const campo of ['description', 'message']) {
        if (typeof carga[campo] === 'string') carga[campo] = redigirUrlDaGravacao(carga[campo]);
      }
      const dados = carga.data;
      if (dados && typeof dados === 'object') {
        for (const campo of ['from', 'to', 'url', 'href']) {
          if (typeof dados[campo] === 'string') dados[campo] = redigirUrlDaGravacao(dados[campo]);
        }
      }
    }
  } catch {
    /* a redação nunca derruba a gravação */
  }
  return evento;
}

export default function GravacaoDaDegustacao({ codigo, onde }: {
  /** Código do convite; sem ele (ou fora da C) nada é gravado. */
  codigo: string | null;
  onde: 'inicio' | 'sala';
}) {
  useEffect(() => {
    if (!codigo) return;
    let cancelado = false;
    void (async () => {
      try {
        // Navegador automatizado e leitor de link não são o lead: não gastam a cota.
        if ((navigator as Navigator & { webdriver?: boolean }).webdriver === true) return;
        if (!Sentry.getClient()) return;

        let replay = Sentry.getReplay();
        if (!replay) {
          const fabrica = await Sentry.lazyLoadIntegration('replayIntegration');
          if (cancelado) return;
          Sentry.addIntegration(fabrica({
            maskAllInputs: true,
            maskAllText: false,
            blockAllMedia: false,
            mask: ['[data-sentry-mask]'],
            beforeAddRecordingEvent: redigirEvento,
          }));
          replay = Sentry.getReplay();
        }
        if (!replay || cancelado) return;

        Sentry.setTag(GRAVACAO_TAG, await etiquetaDoConvite(codigo));
        Sentry.setTag('demo_versao', 'C');
        Sentry.setTag('demo_onde', onde);
        replay.start();
      } catch {
        /* sem gravação, a experiência segue igual */
      }
    })();
    return () => { cancelado = true; };
  }, [codigo, onde]);

  return null;
}
