/**
 * O que a tela da semana faz quando uma conversa (Evidências, Tira-Dúvidas, missão)
 * não responde como esperado (R-91, 04/10/2026).
 *
 * 🔴 POR QUE ISTO EXISTE. A tela chamava a rota e fazia `.then((r) => r.json())` sem
 * olhar o status: um 500, um 429, o limite diário e um 403 eram lidos como "resposta
 * sem `history`" e SUMIAM, sem uma palavra; a mensagem digitada ficava no histórico
 * local e desaparecia no F5 (nunca foi gravada); e em 504 do gateway (HTML) ou queda de
 * rede o `r.json()` lançava, o `setBusy(false)` nunca rodava e o "pensando" ficava
 * eterno com o campo travado.
 *
 * Aqui mora a parte que se testa sem tela: classificar a falha (status e código que a
 * rota devolve) e dizer a chave de i18n que a explica. A rota manda o TEXTO em pt-BR por
 * reserva, mas a tela só confia no `codigo` e no status: a mensagem sai no idioma da
 * pessoa.
 *
 * Fora de `'use server'` de propósito.
 */

export type TipoFalhaConversa =
  /** O `fetch` rejeitou: sem rede, DNS, CORS. A mensagem pode nem ter saído. */
  | 'rede'
  /** Resposta sem JSON (504 ou 502 do gateway, em HTML). O servidor pode ter gravado: ver a mensagem. */
  | 'sem-corpo'
  | 'sessao'
  | 'sem-permissao'
  /** O tutor exige a abertura do conteúdo gravada, e ela não está. */
  | 'conteudo-nao-aberto'
  | 'semana-bloqueada'
  | 'limite-diario'
  | 'muitas-seguidas'
  /** Leitura do servidor que não respondeu (503): tentar de novo resolve. */
  | 'indisponivel'
  /** A IA não respondeu (500): tentar de novo resolve. */
  | 'ia'
  /** A gravação da abertura do conteúdo falhou ANTES da pergunta (só do cliente). */
  | 'consumo-nao-gravado'
  | 'generica';

export interface FalhaDaConversa {
  tipo: TipoFalhaConversa;
  /** `limite-diario`: perguntas por dia. */
  limite?: number;
  /** `muitas-seguidas`: quanto esperar. */
  esperaSegundos?: number;
}

/** Código estável que as rotas põem no corpo (ver `app/api/temporada/*`). */
export const CODIGO_CONVERSA = {
  CONTEUDO_NAO_ABERTO: 'conteudo-nao-aberto',
  SEMANA_BLOQUEADA: 'semana-bloqueada',
  LIMITE_DIARIO: 'limite-diario',
  INDISPONIVEL: 'indisponivel',
  IA: 'ia',
} as const;

/**
 * Status + corpo → falha. O `codigo` vence o status quando existe: é a rota dizendo
 * qual dos 403 (ou dos 429) foi.
 */
export function classificarFalhaHttp(
  status: number,
  corpo: Record<string, any> | null,
  retryAfterSeg?: number | null,
): FalhaDaConversa {
  const codigo = typeof corpo?.codigo === 'string' ? corpo.codigo : null;

  if (status === 401) return { tipo: 'sessao' };
  if (status === 429) {
    if (codigo === CODIGO_CONVERSA.LIMITE_DIARIO) {
      const limite = Number(corpo?.limite);
      return { tipo: 'limite-diario', ...(Number.isFinite(limite) && limite > 0 ? { limite } : {}) };
    }
    const espera = Number(corpo?.esperaSegundos ?? retryAfterSeg);
    return { tipo: 'muitas-seguidas', ...(Number.isFinite(espera) && espera > 0 ? { esperaSegundos: Math.ceil(espera) } : {}) };
  }
  if (status === 403) {
    if (codigo === CODIGO_CONVERSA.CONTEUDO_NAO_ABERTO) return { tipo: 'conteudo-nao-aberto' };
    if (codigo === CODIGO_CONVERSA.SEMANA_BLOQUEADA) return { tipo: 'semana-bloqueada' };
    return { tipo: 'sem-permissao' };
  }
  if (codigo === CODIGO_CONVERSA.IA) return { tipo: 'ia' };
  if (status === 503 || codigo === CODIGO_CONVERSA.INDISPONIVEL) return { tipo: 'indisponivel' };
  if (status >= 500) return { tipo: 'indisponivel' };
  return { tipo: 'generica' };
}

/**
 * `ok: true` traz `dados`; `ok: false` traz `falha`. Não é uma união discriminada de
 * propósito: o projeto roda com `strict: false`, e sem `strictNullChecks` o `if (!r.ok)`
 * não estreita a união (o `tsc` reclamava de `r.falha` no ramo de erro).
 */
export interface ResultadoConversa {
  ok: boolean;
  dados?: Record<string, any>;
  falha?: FalhaDaConversa;
}

/**
 * Faz a chamada e devolve SEMPRE um resultado: nunca lança, e por isso quem chama pode
 * pôr o `setBusy(false)` na linha seguinte sem medo de ele não rodar.
 */
export async function chamarConversa(pedido: () => Promise<Response>): Promise<ResultadoConversa> {
  let resposta: Response;
  try {
    resposta = await pedido();
  } catch {
    return { ok: false, falha: { tipo: 'rede' } };
  }
  const corpo: unknown = await resposta.json().catch(() => null);
  const objeto = corpo && typeof corpo === 'object' ? (corpo as Record<string, any>) : null;
  if (!objeto) return { ok: false, falha: { tipo: 'sem-corpo' } };
  if (!resposta.ok) {
    return { ok: false, falha: classificarFalhaHttp(resposta.status, objeto, Number(resposta.headers?.get?.('Retry-After'))) };
  }
  return { ok: true, dados: objeto };
}

/**
 * Chave de i18n (`SeasonWeek.chatError.*`) e parâmetros da falha, e se vale oferecer
 * "tentar de novo". Não oferece onde repetir o mesmo pedido não muda nada (sessão
 * vencida, sem permissão, limite do dia, semana bloqueada).
 */
export function chaveDaFalha(falha: FalhaDaConversa): { chave: string; params: Record<string, number>; repetir: boolean } {
  switch (falha.tipo) {
    case 'rede': return { chave: 'chatError.network', params: {}, repetir: true };
    case 'sem-corpo': return { chave: 'chatError.timeout', params: {}, repetir: true };
    case 'sessao': return { chave: 'chatError.session', params: {}, repetir: false };
    case 'sem-permissao': return { chave: 'chatError.forbidden', params: {}, repetir: false };
    case 'conteudo-nao-aberto': return { chave: 'chatError.contentNotOpened', params: {}, repetir: true };
    case 'consumo-nao-gravado': return { chave: 'chatError.consumptionNotSaved', params: {}, repetir: true };
    case 'semana-bloqueada': return { chave: 'chatError.weekLocked', params: {}, repetir: false };
    case 'limite-diario': return { chave: 'chatError.dailyLimit', params: { limit: falha.limite ?? 10 }, repetir: false };
    case 'muitas-seguidas': return { chave: 'chatError.tooFast', params: { seconds: falha.esperaSegundos ?? 10 }, repetir: true };
    case 'indisponivel': return { chave: 'chatError.unavailable', params: {}, repetir: true };
    case 'ia': return { chave: 'chatError.ai', params: {}, repetir: true };
    default: return { chave: 'chatError.generic', params: {}, repetir: true };
  }
}
