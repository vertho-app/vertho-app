/**
 * Gravação de tela (Sentry Replay) da degustação versão C.
 *
 * Puro e sem `server-only`: o navegador (que grava) e o painel (que procura a
 * gravação de um lead) precisam derivar a MESMA etiqueta e aplicar a MESMA
 * redação de URL.
 *
 * 🔴 DUAS REGRAS, ambas porque o Sentry é um terceiro:
 *
 * 1. A etiqueta de busca é um HASH do código do convite, nunca o código. O código
 *    do link curto (`/c/<código>`) é credencial do convite: quem o tem abre a
 *    página e cria a sessão do lead. Nome, e-mail e o próprio código ficam fora
 *    das tags. O hash dá a ponte (a mesma etiqueta no início e na sala, e no
 *    cartão do painel) sem entregar a chave.
 *
 * 2. URL de gravação não leva credencial. O ticket da sala (`sala`), o código de
 *    volta (`volta`) e o passe viajam em query ou no caminho `/c/<código>`, e a
 *    gravação registra navegações. A redação cobre o que passa pelo gancho de
 *    gravação (breadcrumbs e spans de navegação); a lista de URLs do resumo da
 *    gravação não passa por ele (limite conhecido, ver `docs/AMBIENTE-DEMO.md`).
 *    🔴 Nem o `href` da página (evento Meta do rrweb): por isso, desde 19/10, nada
 *    grava com credencial na barra (`urlTemCredencial`, `lib/sentry-replay.ts`).
 */
import { PARAMETROS_SECRETOS } from '@/lib/sentry-scrub-pii';

/**
 * INTERRUPTOR da gravação de tela da degustação C. ✅ RELIGADO em 19/10/2026 (pedido
 * do dono, plano Team do Sentry: 50 gravações incluídas e excedente a ~US$ 0,004,
 * com teto de US$ 200/mês). Ficou desligado de 03/10 a 19/10 porque no plano
 * gratuito cada teste do dono gastaria uma das 50 gravações do mês, sem excedente.
 * Desligado, nada carrega o replay, a página não diz que registra telas e cliques e
 * o painel não mostra a etiqueta da gravação. A captura de ERROS segue ligada.
 *
 * Para desligar ou religar: troque o valor, confira a cota (`docs/AMBIENTE-DEMO.md`)
 * e suba. Tipado como `boolean` para o interruptor não virar código morto aos olhos
 * do compilador e do lint.
 *
 * 🔑 Convivência com o Replay do app (só em erro, todo mascarado, desde 19/10,
 * `lib/sentry-replay.ts`), resolvida antes de religar: (1) ele NÃO liga nas telas de
 * início nem nos hosts da sala, então aqui o integrador é sempre o deste componente,
 * com `maskAllText: false` e o `redigirEventoDoSentry`; (2) como o init tem
 * `replaysOnErrorSampleRate: 1`, o integrador nasce em buffer, e o componente
 * converte em sessão com `flush()` (o `start()` não sai do buffer). Guards em
 * `degustacao-gravacao.test.ts` e `sentry-replay.test.ts`.
 */
export const GRAVACAO_LIGADA: boolean = true;

/** Prefixo do que entra no hash: separa esta etiqueta de qualquer outro uso do código. */
export const GRAVACAO_PREFIXO_DA_ETIQUETA = 'degustacao:';
/** Hex de 12 caracteres: curto para colar na busca, longo para não colidir entre leads. */
export const GRAVACAO_TAMANHO_DA_ETIQUETA = 12;
/** Nome da tag no Sentry. */
export const GRAVACAO_TAG = 'demo_chave';

export function entradaDaEtiqueta(codigo: string): string {
  return `${GRAVACAO_PREFIXO_DA_ETIQUETA}${codigo}`;
}

/**
 * Rotas da sala onde a pessoa ESCREVE (conversa de evidências, avaliação,
 * simuladores, prática). Texto digitado reaparece na tela como mensagem, e
 * máscara de campo não cobre o eco. Nessas rotas a gravação PAUSA e volta quando
 * a pessoa sai delas. O guard de `degustacao-gravacao.test.ts` varre as páginas
 * do `/dashboard` com `<textarea>` e falha se uma rota nova não estiver aqui.
 */
const ROTAS_COM_CONVERSA: readonly RegExp[] = [
  /^\/dashboard\/assessment(\/|$)/,
  /^\/dashboard\/praticar(\/|$)/,
  /^\/dashboard\/simulador-lideranca(\/|$)/,
  /^\/dashboard\/simulador-vendas(\/|$)/,
  /^\/dashboard\/treino-atendimento(\/|$)/,
  /^\/dashboard\/temporada\/(semana|sem14)(\/|$)/,
];

export function rotaPermiteGravar(pathname: string): boolean {
  const caminho = String(pathname || '').split('?')[0];
  return !ROTAS_COM_CONVERSA.some((rota) => rota.test(caminho));
}

/**
 * Parâmetros de query que carregam credencial. Desde 19/10/2026 é a lista GERAL do scrub
 * (`PARAMETROS_SECRETOS`, que já contém sala, volta, ticket e passe, além de `t`, `token`,
 * `code`, os `*_token` do login...): duas listas para a mesma pergunta divergem.
 */
const PARAMETROS_COM_CREDENCIAL = PARAMETROS_SECRETOS;

/**
 * Troca o valor das credenciais por `x`, em URL absoluta, relativa ou fragmento
 * de texto. Regex sobre o TEXTO de propósito: o gancho recebe string solta
 * (descrição de span, `from`/`to` de navegação), nem sempre uma URL inteira.
 */
export function redigirUrlDaGravacao(texto: string): string {
  const comParametros = new RegExp(`([?&](?:${PARAMETROS_COM_CREDENCIAL.join('|')})=)[^&#\\s]*`, 'gi');
  return String(texto)
    .replace(comParametros, '$1x')
    .replace(/(\/c\/)[A-Za-z0-9_-]{24}(?![A-Za-z0-9_-])/g, '$1x');
}

function redigirCampos(objeto: any, campos: readonly string[]): void {
  if (!objeto || typeof objeto !== 'object') return;
  for (const campo of campos) {
    if (typeof objeto[campo] === 'string') objeto[campo] = redigirUrlDaGravacao(objeto[campo]);
  }
}

/**
 * Evento da GRAVAÇÃO (o fluxo do rrweb). 🔴 `Medido 03/10/2026` em produção, com o
 * passaporte de QA: a URL inteira do início, com o código do convite, ficava no
 * `href` do evento de metadados (`data.href`) e no `page.view` da gravação, e a
 * primeira versão deste gancho só olhava os campos aninhados em `payload`.
 */
export function redigirEventoDeGravacao<T>(evento: T): T {
  try {
    const e: any = evento;
    redigirCampos(e?.data, ['href']);
    const carga = e?.data?.payload;
    redigirCampos(carga, ['description', 'message', 'href', 'url']);
    redigirCampos(carga?.data, ['from', 'to', 'url', 'href']);
  } catch {
    /* a redação nunca derruba a gravação */
  }
  return evento;
}

/**
 * Evento do SENTRY (resumo da gravação, erro, transação), via processador de
 * eventos. O resumo da gravação guarda a lista de páginas (`urls`) FORA do fluxo
 * do rrweb, então só um processador a alcança. Cobre também a URL da requisição,
 * os breadcrumbs de navegação e os spans: sem isso o código do convite ia para o
 * Sentry em cada erro ou transação da página.
 */
export function redigirEventoDoSentry<T>(evento: T): T {
  try {
    const e: any = evento;
    if (Array.isArray(e?.urls)) {
      e.urls = e.urls.map((url: unknown) => (typeof url === 'string' ? redigirUrlDaGravacao(url) : url));
    }
    redigirCampos(e?.request, ['url']);
    redigirCampos(e?.request?.headers, ['Referer', 'referer']);
    redigirCampos(e?.contexts?.trace?.data, ['url', 'http.url']);
    if (Array.isArray(e?.breadcrumbs)) {
      for (const breadcrumb of e.breadcrumbs) redigirCampos(breadcrumb?.data, ['from', 'to', 'url']);
    }
    if (Array.isArray(e?.spans)) {
      for (const span of e.spans) {
        redigirCampos(span, ['description']);
        redigirCampos(span?.data, ['url', 'http.url']);
      }
    }
  } catch {
    /* a redação nunca derruba o envio */
  }
  return evento;
}
