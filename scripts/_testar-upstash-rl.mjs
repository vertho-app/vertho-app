#!/usr/bin/env node
/**
 * Verifica o rate limit distribuído (Upstash) de ponta a ponta:
 * simula 12 requests no aiLimiter (10/min) e confere se as 2 últimas
 * são bloqueadas e se as chaves aparecem no Redis com o prefixo certo.
 *
 * Uso: node --env-file=.env.local scripts/_testar-upstash-rl.mjs
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('ERRO: UPSTASH_REDIS_REST_URL/TOKEN ausentes no .env.local');
  process.exit(1);
}

const redis = new Redis({ url, token });
const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60000 ms'),
  prefix: 'vertho-rl:10r60000ms', // mesmo prefixo que lib/rate-limit.ts gera p/ aiLimiter
});

const user = `verificacao-${Date.now()}@test.local`;
let permitidas = 0;
let bloqueadas = 0;
for (let i = 1; i <= 12; i++) {
  const { success } = await limiter.limit(user);
  if (success) permitidas++;
  else bloqueadas++;
}
console.log(`12 requests → ${permitidas} permitidas, ${bloqueadas} bloqueadas`);

const keys = await redis.keys('vertho-rl:*');
console.log('chaves no Redis com prefixo vertho-rl:', keys.length > 0 ? `OK (${keys.length})` : 'NENHUMA');

// O sliding window da Upstash é aproximado (buckets) — pode permitir ~10%
// acima do limite. Aceitamos 10–11 permitidas desde que haja bloqueio.
if (permitidas >= 10 && permitidas <= 11 && bloqueadas >= 1 && keys.length > 0) {
  console.log('✓ rate limit distribuído funcionando');
} else {
  console.error('✗ resultado inesperado — verifique configuração');
  process.exit(2);
}
