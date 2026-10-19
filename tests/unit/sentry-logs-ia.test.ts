import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Logs e monitoramento de IA no Sentry (19/10/2026). O que estes testes protegem é o que NÃO pode
 * sair: dado pessoal e credencial no log, e o TEXTO das chamadas de IA no span.
 */

const h = vi.hoisted(() => ({
  end: vi.fn(),
  startInactiveSpan: vi.fn((..._a: any[]) => ({ end: h.end })),
}));
vi.mock('@sentry/core', () => ({ startInactiveSpan: h.startInactiveSpan }));

import { scrubLog } from '@/lib/sentry-scrub-pii';
import { atributosDaChamada, registrarSpanDeIA } from '@/lib/sentry-ia';

describe('scrubLog: o aviso e o erro do servidor passam pela limpeza dos eventos', () => {
  it('🔴 tira e-mail, telefone e credencial de URL da mensagem e dos atributos', () => {
    const log = scrubLog({
      level: 'warn',
      message: 'falhou para maria@x.com.br (22) 99999-8888 em https://app.vertho.ai/entrar?t=SEGREDO',
      attributes: { 'sentry.message.parameter.0': 'joao@y.com', token: 'abc', rota: '/x?code=SEGREDO2' },
    });
    const texto = JSON.stringify(log);
    for (const proibido of ['maria@x.com.br', '99999-8888', 'SEGREDO', 'joao@y.com', 'abc']) expect(texto).not.toContain(proibido);
    expect(log.level).toBe('warn');
  });

  it('mensagem em objeto String (ParameterizedString) vira texto simples, já limpo', () => {
    const msg: any = new String('erro com ana@z.com');
    msg.__sentry_template_string__ = 'erro com %s';
    const log = scrubLog({ level: 'error', message: msg });
    expect(typeof log.message).toBe('string');
    expect(log.message).not.toContain('ana@z.com');
  });
});

describe('configs do Sentry: logs só no servidor e no edge, só aviso e erro', () => {
  for (const arquivo of ['sentry.server.config.js', 'sentry.edge.config.js']) {
    it(`🔴 ${arquivo}: enableLogs, console só warn/error e beforeSendLog = scrubLog`, () => {
      const fonte = readFileSync(arquivo, 'utf8');
      expect(fonte).toMatch(/enableLogs:\s*true/);
      expect(fonte).toMatch(/consoleLoggingIntegration\(\{\s*levels:\s*\['warn',\s*'error'\]\s*\}\)/);
      expect(fonte).toMatch(/beforeSendLog:\s*scrubLog/);
    });
  }

  it('o navegador não manda log (console do usuário não é log do servidor)', () => {
    expect(readFileSync('sentry.client.config.js', 'utf8')).not.toMatch(/enableLogs/);
  });
});

describe('span de IA: só metadados, nunca o texto', () => {
  const CHAMADA = {
    provider: 'anthropic', model: 'claude-sonnet-5-5', latencyMs: 4200,
    inTokens: 1000, outTokens: 300, cacheRead: 5000, cacheWrite: 200,
    truncou: false, taskKey: 'ia4_avaliacao', custoUsd: 0.0123, source: 'wrapper',
  };

  it('atributos gen_ai: entrada TOTAL com o cache dentro, saída, modelo, tarefa e custo', () => {
    expect(atributosDaChamada(CHAMADA)).toEqual({
      'gen_ai.operation.name': 'chat',
      'gen_ai.system': 'anthropic',
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': 'claude-sonnet-5-5',
      'gen_ai.response.model': 'claude-sonnet-5-5',
      'gen_ai.usage.input_tokens': 6200,
      'gen_ai.usage.input_tokens.cached': 5000,
      'gen_ai.usage.input_tokens.cache_write': 200,
      'gen_ai.usage.output_tokens': 300,
      'gen_ai.usage.total_tokens': 6500,
      'vertho.ia.tarefa': 'ia4_avaliacao',
      'vertho.ia.origem': 'wrapper',
      'vertho.ia.truncou': false,
      'vertho.ia.custo_usd': 0.0123,
    });
  });

  it('sem custo conhecido, o atributo de custo não vai (nada de 0 inventado)', () => {
    expect(atributosDaChamada({ ...CHAMADA, custoUsd: null })).not.toHaveProperty('vertho.ia.custo_usd');
  });

  beforeEach(() => { h.startInactiveSpan.mockClear(); h.end.mockClear(); });

  it('🔴 o span nasce com a duração medida pelo wrapper e termina agora', () => {
    registrarSpanDeIA(CHAMADA, 1_000_000);
    const [opcoes] = h.startInactiveSpan.mock.calls[0];
    expect(opcoes).toMatchObject({ name: 'chat claude-sonnet-5-5', op: 'gen_ai.chat' });
    expect((opcoes.startTime as Date).getTime()).toBe(1_000_000 - 4200);
    expect((h.end.mock.calls[0][0] as Date).getTime()).toBe(1_000_000);
  });

  it('falha do Sentry nunca derruba a chamada de IA', () => {
    h.startInactiveSpan.mockImplementationOnce(() => { throw new Error('sentry fora'); });
    expect(() => registrarSpanDeIA(CHAMADA)).not.toThrow();
  });

  it('🔴 o wrapper chama o span no ledger SEM repassar system, prompt nem resposta', () => {
    const fonte = readFileSync('actions/ai-client.ts', 'utf8');
    const inicio = fonte.indexOf('registrarSpanDeIA({');
    expect(inicio).toBeGreaterThan(-1);
    const chamada = fonte.slice(inicio, fonte.indexOf('});', inicio));
    expect(chamada).not.toMatch(/\b(system|user|prompt|messages|content|texto|resposta)\b/);
    // dentro do registrarUsoIA, que é o ponto por onde passam todos os provedores
    const ledger = fonte.slice(fonte.indexOf('async function registrarUsoIA('), fonte.indexOf("const { gravarLinhaLedger } = await import('@/lib/ia-ledger');"));
    expect(ledger).toContain('registrarSpanDeIA({');
  });
});
