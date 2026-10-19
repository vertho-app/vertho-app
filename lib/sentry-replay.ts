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
 * COTA: plano Team desde 19/10 (50 gravações incluídas, excedente ~US$ 0,004 cada, teto do dono
 * de US$ 200/mês). Só em erro, o consumo segue o volume de erros de tela (17 erros de todo tipo em 30
 * dias, medido em 19/10). O guard está em `degustacao-gravacao.test.ts`.
 *
 * 🔑 A SALA DA DEGUSTAÇÃO É DA GRAVAÇÃO DA DEGUSTAÇÃO (religada em 19/10, `GRAVACAO_LIGADA`). Ela
 * grava a sessão inteira com o texto visível (só o que se digita mascarado), e o SDK só aceita UM
 * Replay por página: se este carregasse antes, o componente da degustação o reaproveitaria e tudo
 * sairia em asteriscos. Por isso este nem liga nos hosts das salas de demonstração
 * (`getDemoPresentationRoleFromHostname`: usuario-demo, gestor-sinal, professor-escolas...), além
 * das telas de início dela, que já estão em `ROTAS_SEM_REPLAY`.
 */
import { PARAMETROS_SECRETOS, scrubDados } from './sentry-scrub-pii';
import { getDemoPresentationRoleFromHostname } from './demo/presentation';

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

/**
 * Esta página pode ligar o Replay? Lido no carregamento, a partir de `window.location`, ANTES de o
 * cliente do Supabase limpar a URL. Confere a query E o fragmento: o login por link do Supabase
 * entrega `#access_token=...&refresh_token=...`, e o `href` gravado pelo rrweb leva o fragmento.
 * Nos hosts das salas de demonstração quem grava é a degustação (ver o topo).
 */
export function podeGravarReplay(loc: { pathname?: string; search?: string; hash?: string; hostname?: string } | null | undefined): boolean {
  if (!loc) return false;
  if (loc.hostname && getDemoPresentationRoleFromHostname(loc.hostname)) return false;
  const caminho = String(loc.pathname || '/');
  if (ROTAS_SEM_REPLAY.some((r) => caminho === r || caminho.startsWith(`${r}/`))) return false;
  return !urlTemCredencial(loc);
}

/**
 * A URL ATUAL carrega credencial? Query e fragmento (`PARAMETROS_SECRETOS`) ou o código do convite no
 * caminho (`/c/<código>`). É a régua de QUALQUER gravação, a do app e a da degustação: o rrweb grava o
 * `href` da página no evento Meta, que não passa por gancho nenhum (medido no SDK 10.76: o
 * `beforeAddRecordingEvent` só recebe eventos custom), então a única defesa é não gravar enquanto a
 * credencial estiver na barra.
 */
export function urlTemCredencial(loc: { pathname?: string; search?: string; hash?: string } | null | undefined): boolean {
  if (!loc) return true;
  if (/^\/c\/[^/]+/.test(String(loc.pathname || ''))) return true;
  const temSegredo = (texto: string) => {
    for (const chave of new URLSearchParams(texto).keys()) {
      if (PARAMETROS_SECRETOS.includes(chave.toLowerCase())) return true;
    }
    return false;
  };
  return temSegredo(String(loc.search || '')) || temSegredo(String(loc.hash || '').replace(/^#/, ''));
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
