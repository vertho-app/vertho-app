import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '@/lib/rate-limit';

function makeRequest(ip: string = '1.2.3.4'): Request {
  return new Request('https://app.vertho.ai/api/test', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

// Sem UPSTASH_REDIS_REST_* no ambiente de teste, o limiter cai no fallback
// in-memory — é esse comportamento que estes testes cobrem.

describe('createRateLimiter', () => {
  it('permite ate maxRequests dentro da window', async () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const req = makeRequest('test-allow-1');

    for (let i = 0; i < 3; i++) {
      expect(await limiter.check(req, `allow-test-${Math.random()}`)).toBeNull();
    }
  });

  it('retorna 429 apos exceder maxRequests', async () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    const id = `exceed-${Date.now()}`;

    expect(await limiter.check(makeRequest(), id)).toBeNull();
    expect(await limiter.check(makeRequest(), id)).toBeNull();

    const res = await limiter.check(makeRequest(), id);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  it('response 429 tem header Retry-After', async () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const id = `retry-after-${Date.now()}`;

    await limiter.check(makeRequest(), id);
    const res = (await limiter.check(makeRequest(), id))!;
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('response 429 tem header X-RateLimit-Limit', async () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const id = `ratelimit-header-${Date.now()}`;

    await limiter.check(makeRequest(), id);
    const res = (await limiter.check(makeRequest(), id))!;
    expect(res.headers.get('X-RateLimit-Limit')).toBe('1');
  });

  it('apos window expirar, permite novamente', async () => {
    // Use a very short window and manually wait via timestamps
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1 });
    const id = `expire-${Date.now()}`;

    await limiter.check(makeRequest(), id);

    // The window is 1ms, so after even a tiny delay the timestamps are expired
    // We do a synchronous busy-wait of 5ms to be safe
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }

    const res = await limiter.check(makeRequest(), id);
    expect(res).toBeNull();
  });

  it('aiLimiter: 10 req/min', async () => {
    const { aiLimiter } = await import('@/lib/rate-limit');
    // Verify aiLimiter allows at least 10 and blocks on 11th
    // We use unique identifiers to avoid collision with other tests
    const id = `ai-limiter-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      expect(await aiLimiter.check(makeRequest(), id)).toBeNull();
    }
    const res = await aiLimiter.check(makeRequest(), id);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  it('heavyLimiter: 5 req/min', async () => {
    const { heavyLimiter } = await import('@/lib/rate-limit');
    const id = `heavy-limiter-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(await heavyLimiter.check(makeRequest(), id)).toBeNull();
    }
    const res = await heavyLimiter.check(makeRequest(), id);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });
});
