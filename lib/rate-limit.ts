import { NextResponse } from 'next/server';

/**
 * Rate limiter in-memory por Lambda instance (sliding window).
 *
 * Funciona em Vercel serverless: cada instance warm mantém seu Map por ~5-15min.
 * Não é distribuído (instances diferentes têm contadores separados), mas já
 * pega abuso óbvio (mesmo IP/user martelando a mesma instance).
 *
 * Para rate limiting distribuído real: trocar por @upstash/ratelimit + Redis.
 *
 * Uso:
 *   const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
 *
 *   export async function POST(req) {
 *     const limited = limiter.check(req, 'user@email.com');
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

export function createRateLimiter(config: RateLimiterConfig) {
  const { maxRequests, windowMs } = config;

  return {
    /**
     * Checa rate limit. Retorna Response 429 se excedido, null se OK.
     * @param req - Request (pra extrair IP como fallback)
     * @param identifier - chave primária (email do user autenticado, ou null pra IP)
     */
    check(req: Request, identifier?: string | null): Response | null {
      cleanup(windowMs);

      const key = identifier
        || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';

      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = buckets.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        buckets.set(key, entry);
      }

      entry.timestamps = entry.timestamps.filter(t => t > cutoff);

      if (entry.timestamps.length >= maxRequests) {
        const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);
        return NextResponse.json(
          { error: 'Rate limit excedido. Tente novamente em alguns segundos.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(maxRequests),
              'X-RateLimit-Remaining': '0',
            },
          },
        );
      }

      entry.timestamps.push(now);
      return null;
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
