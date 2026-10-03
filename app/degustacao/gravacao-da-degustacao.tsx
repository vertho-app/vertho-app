'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import {
  GRAVACAO_LIGADA,
  GRAVACAO_TAG,
  GRAVACAO_TAMANHO_DA_ETIQUETA,
  entradaDaEtiqueta,
  redigirEventoDeGravacao,
  redigirEventoDoSentry,
  rotaPermiteGravar,
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
 *   `data-sentry-mask` (nome no início, conversa do Beto). O conteúdo das telas é
 *   de demonstração, então o texto delas fica visível.
 * - 🔴 Nas rotas onde a pessoa ESCREVE (`rotaPermiteGravar`) a gravação PAUSA: o
 *   texto digitado reaparece na tela como mensagem, e máscara de campo não
 *   cobre o eco. Voltar a uma tela sem conversa retoma.
 * - 🔴 O código do convite (`/c/<código>`) e o ticket da sala viajam em URL, e a
 *   gravação as registra em três lugares: o fluxo do rrweb (`beforeAddRecordingEvent`),
 *   a lista de páginas do resumo e os eventos de erro/transação (os dois últimos
 *   só um processador de eventos alcança). Medido em produção em 03/10/2026.
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

/**
 * Carrega e instala o replay UMA vez por página, mesmo com várias montagens do
 * componente (início e sala rodam em hosts diferentes, mas a sala re-renderiza a
 * cada navegação). Sem o singleton, duas montagens adicionariam o integrador e o
 * processador duas vezes.
 */
let preparando: Promise<ReturnType<typeof Sentry.getReplay>> | null = null;
function prepararReplay() {
  if (!preparando) {
    preparando = (async () => {
      let replay = Sentry.getReplay();
      if (!replay) {
        const fabrica = await Sentry.lazyLoadIntegration('replayIntegration');
        Sentry.addIntegration(fabrica({
          maskAllInputs: true,
          maskAllText: false,
          blockAllMedia: false,
          mask: ['[data-sentry-mask]', 'textarea', '[contenteditable="true"]'],
          beforeAddRecordingEvent: redigirEventoDeGravacao,
        }));
        Sentry.addEventProcessor(redigirEventoDoSentry);
        replay = Sentry.getReplay();
      }
      return replay;
    })().catch((erro) => {
      preparando = null;
      throw erro;
    });
  }
  return preparando;
}

export default function GravacaoDaDegustacao({ codigo, onde }: {
  /** Código do convite; sem ele (ou fora da C) nada é gravado. */
  codigo: string | null;
  onde: 'inicio' | 'sala';
}) {
  const pathname = usePathname();

  useEffect(() => {
    // Interruptor geral (`degustacao-gravacao.ts`): desligado, nem o integrador carrega.
    if (!GRAVACAO_LIGADA) return;
    if (!codigo) return;
    let cancelado = false;
    void (async () => {
      try {
        // Navegador automatizado e leitor de link não são o lead: não gastam a cota.
        if ((navigator as Navigator & { webdriver?: boolean }).webdriver === true) return;
        if (!Sentry.getClient()) return;

        const permitido = rotaPermiteGravar(pathname);
        // Rota com conversa e nada gravando ainda: não carrega nem o integrador.
        if (!permitido && !Sentry.getReplay()) return;

        const replay = await prepararReplay();
        if (!replay || cancelado) return;

        if (!permitido) {
          if (replay.getRecordingMode()) await replay.stop();
          return;
        }
        Sentry.setTag(GRAVACAO_TAG, await etiquetaDoConvite(codigo));
        Sentry.setTag('demo_versao', 'C');
        Sentry.setTag('demo_onde', onde);
        if (!replay.getRecordingMode()) replay.start();
      } catch {
        /* sem gravação, a experiência segue igual */
      }
    })();
    return () => { cancelado = true; };
  }, [codigo, onde, pathname]);

  return null;
}
