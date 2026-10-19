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
import { ATRIBUTOS_MASCARADOS, limparEventoDeGravacao, urlTemCredencial } from '@/lib/sentry-replay';

/**
 * Liga a gravação de tela (Sentry Replay) para o lead da versão C.
 *
 * Grava a SESSÃO inteira, só onde monta: o início da C e a sala com um desafio
 * escolhido. O mapeamento (DISC) fica de fora de propósito. Desde 19/10/2026 o
 * app inteiro também tem Replay, mas só em ERRO e todo mascarado
 * (`lib/sentry-replay.ts`), e ele NÃO liga nas telas de início nem nos hosts da
 * sala: aqui quem grava é este componente, com a configuração dele.
 *
 * - Carrega o integrador da CDN do Sentry (`lazyLoadIntegration`), em vez de
 *   importá-lo: importar colocaria o replay no bundle de TODAS as telas.
 * - 🔴 Desde 19/10 o init tem `replaysOnErrorSampleRate: 1`, então o integrador
 *   nasce em modo BUFFER (só em erro). `replay.start()` não sai dele; o que
 *   converte é `flush()`: envia o que estava guardado e segue gravando a sessão
 *   (sem gravação nenhuma, ele começa uma). Antes era `if (!modo) start()`, que no
 *   modo buffer pularia e a degustação só gravaria quando desse erro.
 * - Campos de texto ficam mascarados e o que for da pessoa leva
 *   `data-sentry-mask` (nome no início, conversa do Beto). O conteúdo das telas é
 *   de demonstração, então o texto delas fica visível.
 * - 🔴 Nas rotas onde a pessoa ESCREVE (`rotaPermiteGravar`) a gravação PAUSA: o
 *   texto digitado reaparece na tela como mensagem, e máscara de campo não
 *   cobre o eco. Voltar a uma tela sem conversa retoma.
 * - 🔴 O código do convite (`/c/<código>`) e o ticket da sala viajam em URL, e a
 *   gravação as registra: o fluxo do rrweb (`beforeAddRecordingEvent`), a lista de
 *   páginas do resumo e os eventos de erro/transação (os dois últimos só um
 *   processador de eventos alcança). Medido em produção em 03/10/2026.
 * - 🔴 E o `href` da página no evento Meta do rrweb NÃO passa pelo gancho (a revisão
 *   de segurança de 19/10 apontou, conferido no SDK 10.76: o gancho só recebe eventos
 *   custom; a redação do `href` em `redigirEventoDeGravacao` nunca rodava). Por isso
 *   nada grava com credencial na barra (`esperarUrlSemCredencial`): o INÍCIO não é
 *   gravado desde 19/10, só a sala, depois que o seletor de papel limpa a URL. O
 *   `<input type="hidden">` com o passe fica coberto por `maskAttributes` (`value`).
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
 * Espera a URL ficar sem credencial (a sala a limpa logo depois de guardar o ticket), até `ms`.
 * Devolve se ficou limpa. Ver `urlTemCredencial` em `lib/sentry-replay.ts`.
 */
async function esperarUrlSemCredencial(ms = 2000): Promise<boolean> {
  const fim = Date.now() + ms;
  while (urlTemCredencial(window.location)) {
    if (Date.now() >= fim) return false;
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
  return true;
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
          // Atributos mascarados como no Replay do app (19/10): `value` cobre o `<input
          // type="hidden">` com o passe, que a máscara de campo do rrweb NÃO cobre, e
          // `href` cobre os links com o código do convite.
          maskAttributes: ATRIBUTOS_MASCARADOS,
          // As duas redações: a desta degustação e a dos erros (e-mail, telefone, credencial).
          beforeAddRecordingEvent: (evento) => redigirEventoDeGravacao(limparEventoDeGravacao(evento)),
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
        // 🔴 Credencial na barra, NÃO grava (nem carrega: o integrador nasce em buffer e já
        // grava a página). O início sempre tem (`/c/<código>`, `?passe=`); a sala tem
        // `?sala=`/`?volta=` só até o seletor de papel limpar a URL, por isso a espera curta.
        if (permitido && !(await esperarUrlSemCredencial())) return;

        const replay = await prepararReplay();
        if (!replay || cancelado) return;

        if (!permitido) {
          if (replay.getRecordingMode()) await replay.stop();
          return;
        }
        Sentry.setTag(GRAVACAO_TAG, await etiquetaDoConvite(codigo));
        Sentry.setTag('demo_versao', 'C');
        Sentry.setTag('demo_onde', onde);
        // buffer (só em erro) ou parado viram SESSÃO: ver o topo.
        if (replay.getRecordingMode() !== 'session') await replay.flush();
      } catch {
        /* sem gravação, a experiência segue igual */
      }
    })();
    return () => { cancelado = true; };
  }, [codigo, onde, pathname]);

  return null;
}
