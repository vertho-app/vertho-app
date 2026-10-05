/**
 * Tratamento dos relatórios de violação de CSP (`/api/csp-report`).
 *
 * A política está em modo RELATÓRIO (`lib/csp-politica.mjs`): o navegador manda um POST a
 * cada violação que bloquearia. O endpoint é público (o navegador não manda sessão de
 * propósito) e grava só em log, então o cuidado é duplo:
 *
 *  1. NÃO logar o que identifica gente. `document-uri` e `source-file` trazem a URL com a
 *     query string, e em `/entrar`, `/auth/callback` e `/r/<token>` ela carrega token (link
 *     de acesso, relatório compartilhado). Aqui sai a query inteira, e todo trecho de caminho
 *     com cara de identificador vira `:id`. A amostra do script é cortada em 22 caracteres
 *     (o prefixo basta para reconhecer o script inline do Next; o resto é dado da página).
 *  2. NÃO deixar a tempestade virar custo. Uma página tem dezenas de scripts inline e cada um
 *     gera um relatório, para cada pessoa, a cada navegação. Deduplica por (diretiva,
 *     bloqueado, página, amostra) numa janela de 10 minutos por instância e loga só a
 *     primeira, com a contagem de repetições da janela anterior.
 */

export interface RelatorioCsp {
  /** Diretiva efetiva: `script-src-elem`, `connect-src`... */
  diretiva: string;
  /** `inline`, `eval`, `data`, `blob`, ou a ORIGEM bloqueada (sem caminho nem query). */
  bloqueado: string;
  /** Host + caminho da página, sem query e com identificadores trocados por `:id`. */
  pagina: string;
  /** Primeiros 22 caracteres do script, em uma linha (`self.__next_f.push([1,` tem exatamente 22). */
  amostra: string;
  /** Origem + caminho do arquivo que originou a violação, sem query. */
  arquivo: string;
  /** `report` (modo relatório) ou `enforce`. */
  disposicao: string;
}

const TAMANHO_AMOSTRA = 22;
const JANELA_MS = 10 * 60_000;
const MAXIMO_DE_CHAVES = 500;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function texto(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** `https://x.vertho.ai/r/abc...?t=segredo#f` -> `x.vertho.ai/r/:id`. Vazio se não for URL. */
export function redigirPagina(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const caminho = u.pathname
      .replace(UUID, ':id')
      .split('/')
      .map((trecho) => (/^[A-Za-z0-9_~.%-]{16,}$/.test(trecho) || /^\d{6,}$/.test(trecho) ? ':id' : trecho))
      .join('/');
    return `${u.host}${caminho}`;
  } catch {
    return '';
  }
}

/** O que foi bloqueado: palavra-chave do CSP ou só a origem (nunca o caminho, que pode ter token). */
function bloqueadoRedigido(bruto: string): string {
  if (!bruto) return '';
  if (['inline', 'eval', 'data', 'blob', 'self', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink'].includes(bruto)) return bruto;
  if (/^(data|blob):/i.test(bruto)) return bruto.split(':')[0].toLowerCase();
  try {
    return new URL(bruto).origin;
  } catch {
    return bruto.slice(0, 40);
  }
}

function umRelatorio(c: Record<string, unknown>): RelatorioCsp {
  const diretiva = texto(c['effective-directive'] ?? c.effectiveDirective ?? c['violated-directive'] ?? c.violatedDirective, 80)
    .split(/\s+/)[0];
  const amostra = texto(c['script-sample'] ?? c.sample ?? c.scriptSample, 200).replace(/\s+/g, ' ').trim().slice(0, TAMANHO_AMOSTRA);
  return {
    diretiva,
    bloqueado: bloqueadoRedigido(texto(c['blocked-uri'] ?? c.blockedURL ?? c.blockedUri, 300)),
    pagina: redigirPagina(texto(c['document-uri'] ?? c.documentURL ?? c.documentUri, 500)),
    amostra,
    arquivo: redigirPagina(texto(c['source-file'] ?? c.sourceFile, 500)),
    disposicao: texto(c.disposition, 20),
  };
}

/**
 * Aceita os dois formatos que o navegador manda:
 *  · legado (`report-uri`, `application/csp-report`): `{ "csp-report": { ... } }`;
 *  · Reporting API (`report-to`, `application/reports+json`): `[{ type: 'csp-violation', body: { ... } }]`.
 * Qualquer outra coisa devolve lista vazia. No máximo 20 relatórios por requisição.
 */
export function normalizarRelatorios(corpo: unknown): RelatorioCsp[] {
  const itens: Array<Record<string, unknown>> = [];
  if (Array.isArray(corpo)) {
    for (const r of corpo.slice(0, 20)) {
      if (r && typeof r === 'object' && (r as Record<string, unknown>).type === 'csp-violation') {
        const b = (r as Record<string, unknown>).body;
        if (b && typeof b === 'object') itens.push(b as Record<string, unknown>);
      }
    }
  } else if (corpo && typeof corpo === 'object') {
    const legado = (corpo as Record<string, unknown>)['csp-report'];
    if (legado && typeof legado === 'object') itens.push(legado as Record<string, unknown>);
  }
  return itens.map(umRelatorio).filter((r) => r.diretiva !== '');
}

/** Lê o corpo até `max` bytes. `null` se passar do teto (o chamador responde 204 sem processar). */
export async function lerCorpoLimitado(req: Request, max: number): Promise<string | null> {
  const declarado = Number(req.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > max) return null;
  const leitor = req.body?.getReader();
  if (!leitor) return '';
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(partes));
}

const vistos = new Map<string, { desde: number; repeticoes: number }>();

/** Só para teste. */
export function reiniciarDeduplicacao(): void {
  vistos.clear();
}

export function chaveDoRelatorio(r: RelatorioCsp): string {
  return [r.diretiva, r.bloqueado, r.pagina, r.amostra].join('|');
}

/**
 * Loga o relatório se for novo na janela. Devolve `true` quando logou, para o teste.
 * `agora` é injetável pelo mesmo motivo.
 */
export function registrarRelatorio(r: RelatorioCsp, agora: number = Date.now()): boolean {
  const chave = chaveDoRelatorio(r);
  const anterior = vistos.get(chave);
  if (anterior && agora - anterior.desde < JANELA_MS) {
    anterior.repeticoes++;
    return false;
  }
  if (vistos.size >= MAXIMO_DE_CHAVES) vistos.clear();
  vistos.set(chave, { desde: agora, repeticoes: 0 });
  console.warn('[csp-report]', JSON.stringify({ ...r, repeticoesNaJanelaAnterior: anterior?.repeticoes ?? 0 }));
  return true;
}
