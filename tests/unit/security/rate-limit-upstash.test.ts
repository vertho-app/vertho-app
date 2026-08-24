import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * ── E4 (auditoria de 22/08), a parte que sobrevive à refutação ────────────
 *
 * O achado tinha duas metades. A primeira — o caso "permite até maxRequests"
 * usar `Math.random()` como identificador, afirmando três vezes "a primeira
 * request de uma chave nova passa" — é real, mas o caso seguinte cobre a mesma
 * mecânica com id fixo, e por isso o achado foi REFUTADO por alcance.
 *
 * A segunda metade não tinha resposta: **o ramo Upstash tinha ZERO cobertura, e
 * é o que roda em produção** (`Medido em 24/08:` nenhum arquivo em `tests/`
 * mencionava Upstash). Os oito casos existentes exercitam o fallback in-memory,
 * que em produção só entra quando o Redis cai.
 *
 * É a régua desta base: **quando há dois caminhos, teste o que RODA.** Este
 * limiter protege `aiLimiter` (10/min), `heavyLimiter` (5/min) e — o mais
 * sensível — `authLimiter` (8/min por IP), que é anti-enumeração e trava abuso
 * de envio de e-mail/WhatsApp.
 *
 * O `Ratelimit` do Upstash é injetado por mock: nenhum teste toca Redis real.
 */

const mocks = vi.hoisted(() => ({
  /** O que `limit()` responde. */
  resposta: { success: true, reset: 0 } as { success: boolean; reset: number },
  /** Faz `limit()` LANÇAR (Redis fora do ar). */
  lanca: false,
  /** Chaves que chegaram ao Upstash — prova que ele foi consultado. */
  chaves: [] as string[],
  /** Config passada ao construtor (prefixo por limiter). */
  construidos: [] as any[],
}));

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    constructor(cfg: any) { mocks.construidos.push(cfg); }
    static slidingWindow(max: number, janela: string) { return { max, janela }; }
    async limit(key: string) {
      mocks.chaves.push(key);
      if (mocks.lanca) throw new Error('Redis fora do ar');
      return mocks.resposta;
    }
  }
  return { Ratelimit };
});
vi.mock('@upstash/redis', () => ({ Redis: class { constructor(public cfg: any) {} } }));

function req(ip = '1.2.3.4'): Request {
  return new Request('https://app.vertho.ai/api/test', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

/** Import fresco: os limiters do Upstash são singletons por módulo. */
async function limiterCom(config: { maxRequests: number; windowMs: number }) {
  vi.resetModules();
  const mod = await import('@/lib/rate-limit');
  return mod.createRateLimiter(config);
}

const ENV = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };

beforeEach(() => {
  // Com as duas env vars presentes, o caminho de produção é escolhido.
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-teste';
  mocks.resposta = { success: true, reset: 0 };
  mocks.lanca = false;
  mocks.chaves = [];
  mocks.construidos = [];
});

afterEach(() => {
  if (ENV.url) process.env.UPSTASH_REDIS_REST_URL = ENV.url; else delete process.env.UPSTASH_REDIS_REST_URL;
  if (ENV.token) process.env.UPSTASH_REDIS_REST_TOKEN = ENV.token; else delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('E4 · rate limit: o ramo que roda em PRODUÇÃO', () => {
  it('🔴 com as env vars presentes, quem decide é o Upstash — não o balde local', async () => {
    const limiter = await limiterCom({ maxRequests: 8, windowMs: 60_000 });

    await limiter.check(req(), 'ana@x.com');

    expect(
      mocks.chaves,
      'não consultou o Upstash: em produção o limite estaria sendo contado por INSTÂNCIA, '
      + 'e o teto vira "8 por lambda" em vez de 8 no total',
    ).toEqual(['ana@x.com']);
  });

  it('success=true deixa passar', async () => {
    const limiter = await limiterCom({ maxRequests: 8, windowMs: 60_000 });
    mocks.resposta = { success: true, reset: 0 };
    expect(await limiter.check(req(), 'ana@x.com')).toBeNull();
  });

  it('🔴 success=false vira 429 — o bloqueio de verdade', async () => {
    const limiter = await limiterCom({ maxRequests: 8, windowMs: 60_000 });
    mocks.resposta = { success: false, reset: Date.now() + 30_000 };

    const res = await limiter.check(req(), 'ana@x.com');

    expect(res, 'o Upstash recusou e a request passou assim mesmo').not.toBeNull();
    expect(res!.status).toBe(429);
  });

  /**
   * O `Retry-After` é derivado de `reset`, que o Upstash devolve como timestamp
   * ABSOLUTO. Tratá-lo como duração daria um cabeçalho de 1,7 bilhão de segundos.
   */
  it('🔴 Retry-After é calculado do `reset` absoluto, em segundos', async () => {
    const limiter = await limiterCom({ maxRequests: 8, windowMs: 60_000 });
    mocks.resposta = { success: false, reset: Date.now() + 30_000 };

    const res = await limiter.check(req(), 'ana@x.com');
    const retry = Number(res!.headers.get('Retry-After'));

    expect(retry, 'Retry-After fora da janela — `reset` foi lido como duração, não como instante').toBeGreaterThan(25);
    expect(retry).toBeLessThanOrEqual(31);
  });

  /**
   * Fail-open deliberado: Redis fora não pode derrubar o app. Mas tem que
   * SOBRAR proteção — cair no balde in-memory, não liberar geral.
   */
  it('🔴 Redis fora do ar cai no fallback, e o fallback ainda BLOQUEIA', async () => {
    const limiter = await limiterCom({ maxRequests: 2, windowMs: 60_000 });
    mocks.lanca = true;
    const original = console.error;
    console.error = () => {};
    try {
      const id = `redis-fora-${Date.now()}`;
      expect(await limiter.check(req(), id)).toBeNull();
      expect(await limiter.check(req(), id)).toBeNull();
      const res = await limiter.check(req(), id);

      expect(
        res,
        'com o Redis fora, o limite sumiu por completo — fail-open virou porta aberta',
      ).not.toBeNull();
      expect(res!.status).toBe(429);
    } finally {
      console.error = original;
    }
  });

  it('sem as env vars, nem tenta o Upstash (é o fallback declarado)', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const limiter = await limiterCom({ maxRequests: 8, windowMs: 60_000 });

    await limiter.check(req(), 'ana@x.com');

    expect(mocks.chaves, 'consultou o Upstash sem credencial configurada').toEqual([]);
  });

  /**
   * 🔑 Limiters diferentes não podem dividir contador no Redis: o prefixo
   * carrega a config. Sem isso, `authLimiter` (8/min) e `heavyLimiter` (5/min)
   * somariam no mesmo balde e o teto efetivo seria o do mais apertado.
   */
  it('🔴 cada configuração tem seu próprio prefixo no Redis', async () => {
    vi.resetModules();
    const mod = await import('@/lib/rate-limit');
    const a = mod.createRateLimiter({ maxRequests: 8, windowMs: 60_000 });
    const b = mod.createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

    await a.check(req(), 'k');
    await b.check(req(), 'k');

    const prefixos = mocks.construidos.map((c) => c.prefix);
    expect(prefixos).toHaveLength(2);
    expect(
      new Set(prefixos).size,
      'dois limiters com limites diferentes dividiriam o mesmo contador — o teto vira o do mais apertado',
    ).toBe(2);
  });
});
