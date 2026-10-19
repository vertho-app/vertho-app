/**
 * Session Replay do Sentry, SÓ quando acontece um erro, e com a tela mascarada (19/10/2026).
 *
 * Para que serve: o "fiz e não aparece" e os defeitos de celular e do navegador do WhatsApp chegam
 * sem passo a passo. Com o Replay, o erro vem com os ~60 s de interação que o antecederam.
 *
 * 🔴 O QUE NUNCA PODE SAIR, e onde cada coisa é barrada:
 *  - TEXTO e CAMPOS da tela: `maskAllText` e `maskAllInputs` (viram asteriscos). Mídia
 *    (foto, vídeo, áudio, svg): `blockAllMedia`.
 *  - ATRIBUTOS: mascarar texto não cobre atributo, e a tela de acesso `/entrar/abrir` põe o token
 *    no `href` dos botões. Por isso `href`, `src`, `alt`, `value` e afins entram em
 *    `maskAttributes` (o padrão do SDK era só title, placeholder e aria-label).
 *  - A URL da PÁGINA: o rrweb grava o `href` da página num evento ("Meta") que NÃO passa por
 *    gancho nenhum do SDK (o `beforeAddRecordingEvent` só vê eventos custom). Então o Replay nem
 *    liga numa página carregada com credencial na URL (`PARAMETROS_SECRETOS`) ou nas telas de
 *    acesso (`/entrar`, `/degustacao`, `/auth`, `/c`), que é onde o token fica parado de propósito.
 *  - Navegação, chamadas de rede e console registrados durante a gravação (eventos custom): passam
 *    pelo mesmo scrub dos erros (`limparEventoDeGravacao`).
 *  - O `replay_event` (lista de URLs da sessão): o processador global do client chama o `scrubPII`.
 *  - Corpo e cabeçalho de requisição: não são capturados (`networkDetailAllowUrls` vazio, padrão).
 *
 * Amostragem: 0 sessão gravada por padrão e 100% das sessões que têm erro (`sentry.client.config.js`).
 *
 * COTA: o plano grátis do Sentry tem 50 gravações por mês, sem excedente pago. Até 19/10 elas
 * eram reservadas à gravação da degustação (desligada desde 03/10, `GRAVACAO_LIGADA`). Só em erro,
 * o consumo segue o volume de erros de tela (17 erros de todo tipo em 30 dias, medido em 19/10);
 * no plano pago a cota deixa de ser o limite. O guard está em `degustacao-gravacao.test.ts`.
 */
import { PARAMETROS_SECRETOS, scrubDados } from './sentry-scrub-pii';

/**
 * Telas de acesso: o token fica parado na URL e no DOM delas de propósito. `/c/<código>` é o link
 * curto do convite da degustação, com a credencial no próprio caminho.
 */
export const ROTAS_SEM_REPLAY = ['/entrar', '/degustacao', '/auth', '/c'];

/** Atributos mascarados na gravação. O padrão do SDK é `title`, `placeholder` e `aria-label`. */
export const ATRIBUTOS_MASCARADOS = [
  'title', 'placeholder', 'aria-label', 'alt',
  'href', 'src', 'srcset', 'action', 'value', 'content',
];

/** Esta página pode ligar o Replay? Lido no carregamento, a partir de `window.location`. */
export function podeGravarReplay(loc: { pathname?: string; search?: string } | null | undefined): boolean {
  if (!loc) return false;
  const caminho = String(loc.pathname || '/');
  if (ROTAS_SEM_REPLAY.some((r) => caminho === r || caminho.startsWith(`${r}/`))) return false;
  const params = new URLSearchParams(String(loc.search || ''));
  for (const chave of params.keys()) {
    if (PARAMETROS_SECRETOS.includes(chave.toLowerCase())) return false;
  }
  return true;
}

/** Evento custom da gravação (navegação, rede, console): mesmo scrub dos erros. */
export function limparEventoDeGravacao<T>(evento: T): T {
  return scrubDados(evento);
}

/** Opções do `replayIntegration`. */
export function opcoesDoReplay() {
  return {
    maskAllText: true,
    maskAllInputs: true,
    blockAllMedia: true,
    maskAttributes: ATRIBUTOS_MASCARADOS,
    networkDetailAllowUrls: [] as string[],
    beforeAddRecordingEvent: limparEventoDeGravacao,
  };
}
