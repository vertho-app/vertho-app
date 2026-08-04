import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiter com duas camadas:
 *
 * 1. UPSTASH (distribuído) — ativo quando UPSTASH_REDIS_REST_URL e
 *    UPSTASH_REDIS_REST_TOKEN estão configuradas. Sliding window no Redis:
 *    o limite vale para a FROTA inteira de lambdas, não por instância.
 *    É a proteção real das rotas de IA (a mais cara do app) em escala.
 *
 * 2. IN-MEMORY (fallback) — Map por lambda instance. Sem Redis configurado
 *    (dev, testes) ou se o Redis falhar em runtime (fail-open com log),
 *    cai aqui. Pega abuso óbvio, mas instances diferentes têm contadores
 *    separados — não é proteção distribuída.
 *
 * Uso:
 *   const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
 *
 *   export async function POST(req) {
 *     const limited = await limiter.check(req, 'user@email.com');
 *     if (limited) return limited; // Response 429
 *     ...
 *   }
 */

interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

interface BucketEntry {
  timestamps: number[];
}

// ── Upstash (lazy singletons) ───────────────────────────────────────────────

const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(config: RateLimiterConfig): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Prefixo por config: limiters diferentes nunca dividem contador no Redis.
  const prefix = `vertho-rl:${config.maxRequests}r${config.windowMs}ms`;
  const cached = upstashLimiters.get(prefix);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(config.maxRequests, `${config.windowMs} ms`),
    prefix,
  });
  upstashLimiters.set(prefix, limiter);
  return limiter;
}

// ── In-memory (fallback) ────────────────────────────────────────────────────

const buckets = new Map<string, BucketEntry>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5min

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  for (const [key, entry] of buckets) {
    if (entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      buckets.delete(key);
    }
  }
}

function inMemoryCheck(config: RateLimiterConfig, key: string): Response | null {
  cleanup(config.windowMs);

  const now = Date.now();
  const cutoff = now - config.windowMs;

  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.timestamps[0] + config.windowMs - now) / 1000);
    return build429(config.maxRequests, retryAfter);
  }

  entry.timestamps.push(now);
  return null;
}

// ── Resposta 429 padronizada ────────────────────────────────────────────────

function build429(limit: number, retryAfterSec: number): Response {
  return NextResponse.json(
    { error: 'Rate limit excedido. Tente novamente em alguns segundos.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfterSec)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createRateLimiter(config: RateLimiterConfig) {
  return {
    /**
     * Checa rate limit. Retorna Response 429 se excedido, null se OK.
     * @param req - Request (pra extrair IP como fallback)
     * @param identifier - chave primária (email do user autenticado, ou null pra IP)
     */
    async check(req: Request, identifier?: string | null): Promise<Response | null> {
      const key = identifier
        || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';

      const upstash = getUpstashLimiter(config);
      if (upstash) {
        try {
          const { success, reset } = await upstash.limit(key);
          if (success) return null;
          return build429(config.maxRequests, Math.ceil((reset - Date.now()) / 1000));
        } catch (err) {
          // Fail-open pro in-memory: Redis fora não pode derrubar o app,
          // mas ainda assim fica alguma proteção por instância.
          console.error('[rate-limit] Upstash indisponível, usando fallback in-memory:', err);
        }
      }

      return inMemoryCheck(config, key);
    },
  };
}

// ── Limiters pré-configurados por tipo de rota ──────────────────────────────

/** Rotas que chamam IA (caro): 10 req/min por user */
export const aiLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

/** Rotas de upload/PDF (pesado): 5 req/min por user */
export const heavyLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

/** Rotas de leitura normal: 60 req/min por user */
export const readLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });

/**
 * Rotas de autenticação (não autenticadas, disparam email/WhatsApp/SMS = custo):
 * 8 req/min por IP. Protege contra enumeração e abuso de envio (Resend/Z-API).
 * Com UPSTASH_REDIS_REST_* configuradas o limite é distribuído de verdade;
 * sem elas, é por-instância (teto grosseiro).
 */
export const authLimiter = createRateLimiter({ maxRequests: 8, windowMs: 60_000 });
