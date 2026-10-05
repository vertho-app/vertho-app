/**
 * `/api/csp-report`: destino dos relatórios da CSP em modo relatório. A rota é PÚBLICA (o
 * navegador manda sem sessão) e só escreve em LOG, então o que se prova aqui é o que ela
 * NÃO deixa passar: token de acesso na URL, corpo gigante, repetição que enche o log.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const estado = vi.hoisted(() => ({ limitado: false }));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({
    check: async () => (estado.limitado ? new Response('limite', { status: 429 }) : null),
  }),
}));

const rota = await import('@/app/api/csp-report/route');
const {
  normalizarRelatorios, redigirPagina, registrarRelatorio, reiniciarDeduplicacao, lerCorpoLimitado,
} = await import('@/lib/csp-relatorio');

let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  estado.limitado = false;
  reiniciarDeduplicacao();
  aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => aviso.mockRestore());

const post = (corpo: unknown, tipo = 'application/csp-report', extra: Record<string, string> = {}) =>
  rota.POST(new Request('https://ibipeba.vertho.ai/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': tipo, ...extra },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  }));

const TOKEN = 'AbCdEfGhIjKlMnOpQrSt1234567890xyz';
const legado = (extra: Record<string, unknown> = {}) => ({
  'csp-report': {
    'document-uri': `https://ibipeba.vertho.ai/r/${TOKEN}?t=SEGREDO-DE-ACESSO&x=1#frag`,
    'effective-directive': 'script-src-elem',
    'violated-directive': "script-src-elem 'self'",
    'blocked-uri': 'inline',
    'script-sample': 'self.__next_f.push([1,"3:[\\"$\\",\\"div\\",null,{\\"nome\\":\\"Maria da Silva\\"}]"])',
    'source-file': `https://ibipeba.vertho.ai/r/${TOKEN}?t=SEGREDO-DE-ACESSO`,
    disposition: 'report',
    ...extra,
  },
});

const logado = () => aviso.mock.calls.map((c) => c.join(' ')).join('\n');

describe('POST /api/csp-report', () => {
  it('só existe POST', () => {
    expect((rota as any).GET).toBeUndefined();
    expect(Object.keys(rota).filter((k) => /^(GET|PUT|PATCH|DELETE)$/.test(k))).toEqual([]);
  });

  it('🔴 relatório legado: 204 e o log NÃO leva a query nem o token do caminho nem o resto do script', async () => {
    const r = await post(legado());
    expect(r.status).toBe(204);
    expect(aviso).toHaveBeenCalledTimes(1);
    const log = logado();
    expect(log).toContain('[csp-report]');
    expect(log).toContain('script-src-elem');
    expect(log).toContain('"bloqueado":"inline"');
    expect(log).toContain('ibipeba.vertho.ai/r/:id');
    // 22 caracteres: o prefixo de um script inline do Next, sem o dado da página que vem depois.
    expect(log).toContain('"amostra":"self.__next_f.push([1,"');
    expect(log).not.toContain('SEGREDO-DE-ACESSO');
    expect(log).not.toContain(TOKEN);
    expect(log).not.toContain('Maria da Silva');
    expect(log).not.toContain('frag');
  });

  it('formato da Reporting API (array, application/reports+json): lê e redige do mesmo jeito', async () => {
    const r = await post([
      { type: 'csp-violation', url: 'x', body: {
        documentURL: `https://app.vertho.ai/auth/callback?token_hash=${TOKEN}&next=/dashboard`,
        effectiveDirective: 'connect-src', blockedURL: 'https://evil.example/coleta?dado=1', disposition: 'report',
      } },
      { type: 'deprecation', body: { id: 'x' } }, // outro tipo de relatório: ignorado
    ], 'application/reports+json');
    expect(r.status).toBe(204);
    expect(aviso).toHaveBeenCalledTimes(1);
    const log = logado();
    expect(log).toContain('"bloqueado":"https://evil.example"');
    expect(log).toContain('app.vertho.ai/auth/callback');
    expect(log).not.toContain(TOKEN);
    expect(log).not.toContain('dado=1');
    expect(log).not.toContain('coleta');
  });

  it('🔴 a mesma violação repetida loga UMA vez na janela (uma página gera dezenas)', async () => {
    for (let i = 0; i < 25; i++) await post(legado());
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('violações diferentes (outro bloqueado, outra página) logam cada uma', async () => {
    await post(legado());
    await post(legado({ 'blocked-uri': 'https://cdn.exemplo.com/a.js?v=1' }));
    await post(legado({ 'document-uri': 'https://ibipeba.vertho.ai/dashboard/jornada?x=1' }));
    expect(aviso).toHaveBeenCalledTimes(3);
  });

  it('depois da janela de 10 min loga de novo e informa as repetições', () => {
    const r = normalizarRelatorios(legado())[0];
    expect(registrarRelatorio(r, 1_000_000)).toBe(true);
    expect(registrarRelatorio(r, 1_000_000 + 60_000)).toBe(false);
    expect(registrarRelatorio(r, 1_000_000 + 120_000)).toBe(false);
    expect(registrarRelatorio(r, 1_000_000 + 11 * 60_000)).toBe(true);
    expect(logado()).toContain('"repeticoesNaJanelaAnterior":2');
  });

  it('🔴 corpo acima de 16 KB (declarado ou em pedaços): 204 sem processar nem logar', async () => {
    const enorme = JSON.stringify(legado({ 'script-sample': 'x'.repeat(40_000) }));
    expect((await post(enorme)).status).toBe(204);
    expect((await post(enorme, 'application/csp-report', { 'content-length': String(enorme.length) })).status).toBe(204);
    expect(aviso).not.toHaveBeenCalled();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(enorme)); c.close(); } });
    const semTamanho = new Request('https://x.vertho.ai/api/csp-report', { method: 'POST', body: stream, duplex: 'half' } as any);
    expect(await lerCorpoLimitado(semTamanho, 16 * 1024)).toBeNull();
  });

  it('JSON inválido, objeto qualquer ou corpo vazio: 204, sem log e sem exceção', async () => {
    expect((await post('{nao e json')).status).toBe(204);
    expect((await post({ qualquer: 'coisa' })).status).toBe(204);
    expect((await post('')).status).toBe(204);
    expect((await post([1, 'a', null])).status).toBe(204);
    expect(aviso).not.toHaveBeenCalled();
  });

  it('🔴 acima do rate limit: 204 sem processar (nunca 429, para não virar sinal nem ruído no navegador)', async () => {
    estado.limitado = true;
    const r = await post(legado());
    expect(r.status).toBe(204);
    expect(aviso).not.toHaveBeenCalled();
  });

  it('no máximo 20 relatórios por requisição', () => {
    const muitos = Array.from({ length: 50 }, (_, i) => ({
      type: 'csp-violation', body: { documentURL: 'https://a.vertho.ai/p', effectiveDirective: 'img-src', blockedURL: `https://o${i}.example/x` },
    }));
    expect(normalizarRelatorios(muitos)).toHaveLength(20);
  });
});

describe('redigirPagina', () => {
  it.each([
    ['https://x.vertho.ai/entrar?t=segredo', 'x.vertho.ai/entrar'],
    ['https://x.vertho.ai/r/AbCdEfGhIjKlMnOpQrSt', 'x.vertho.ai/r/:id'],
    ['https://x.vertho.ai/v/123e4567-e89b-12d3-a456-426614174000/play', 'x.vertho.ai/v/:id/play'],
    ['https://x.vertho.ai/dashboard/temporada/semana/3', 'x.vertho.ai/dashboard/temporada/semana/3'],
    ['https://x.vertho.ai/c/12345678901', 'x.vertho.ai/c/:id'],
    ['https://x.vertho.ai/admin/empresas/gerenciar#secao', 'x.vertho.ai/admin/empresas/gerenciar'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(redigirPagina(entrada)).toBe(esperado);
  });

  it('o que não é URL vira vazio, e nada vaza', () => {
    expect(redigirPagina('')).toBe('');
    expect(redigirPagina('não é url com token=abc')).toBe('');
  });
});
