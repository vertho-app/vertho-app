import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { CODIGO_LIMITE_INICIOS_VENDAS, INICIOS_POR_HORA_VENDAS } from '@/lib/simulador-vendas/limite-inicios';
import { CODIGO_LIMITE_DESTINO } from '@/lib/auth/login-respostas';

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
  /**
   * Texto do 429 para quem lê a tela. Sem ele, a mensagem genérica. Existe para
   * limites de janela longa (hora), em que "tente em alguns segundos" é falso.
   */
  mensagem?: (retryAfterSec: number) => string;
  /**
   * Nome do contador. Dois limiters com o mesmo número e a mesma janela
   * dividiam o prefixo no Redis, e no fallback em memória TODOS dividem o mesmo
   * Map pela chave: um limiter de hora e outro de dia sobre a mesma chave
   * apagariam o histórico um do outro. Com escopo, cada um conta sozinho.
   */
  escopo?: string;
  /**
   * Código estável no corpo do 429, com `limite` e `esperaSegundos`, para a tela
   * mostrar a mensagem no idioma da pessoa. O texto de `mensagem` é pt-BR e
   * fica como reserva para quem não reconhece o código (R-110, 03/10/2026).
   */
  codigo?: string;
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
  const prefix = `vertho-rl:${config.escopo ? `${config.escopo}:` : ''}${config.maxRequests}r${config.windowMs}ms`;
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

function inMemoryCheck(config: RateLimiterConfig, chave: string): Response | null {
  cleanup(config.windowMs);

  const now = Date.now();
  const cutoff = now - config.windowMs;
  const key = config.escopo ? `${config.escopo}:${chave}` : chave;

  let entry = buckets.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.timestamps[0] + config.windowMs - now) / 1000);
    return build429(config.maxRequests, retryAfter, config.mensagem, config.codigo);
  }

  entry.timestamps.push(now);
  return null;
}

// ── Resposta 429 padronizada ────────────────────────────────────────────────

function build429(
  limit: number,
  retryAfterSec: number,
  mensagem?: RateLimiterConfig['mensagem'],
  codigo?: string,
): Response {
  const espera = Math.max(1, retryAfterSec);
  return NextResponse.json(
    {
      error: mensagem ? mensagem(espera) : 'Rate limit excedido. Tente novamente em alguns segundos.',
      ...(codigo ? { codigo, limite: limit, esperaSegundos: espera } : {}),
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(espera),
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
          return build429(config.maxRequests, Math.ceil((reset - Date.now()) / 1000), config.mensagem, config.codigo);
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

/**
 * Cota própria do Copiloto.
 *
 * Um planejamento gasta 4 buscas web e uma síntese; com o `aiLimiter` de 10/min
 * compartilhado com chat, simulador e outras cinco rotas, dois planejamentos
 * seguidos derrubavam o chat de outra pessoa — e o vendedor via "tente de novo"
 * sem entender por quê. Menos requisições por minuto porque cada uma é longa.
 */
export const copilotoLimiter = createRateLimiter({ maxRequests: 6, windowMs: 60_000 });

/**
 * Cota própria para INICIAR treino no simulador de vendas (V-8, 27/09/2026).
 *
 * Cada início paga o criador de cenário, e descartar é permitido antes da
 * primeira fala: o laço iniciar-descartar só tinha como freio os 10 POST/min
 * do `aiLimiter` (cerca de 5 cenários por minuto por pessoa). Seis por hora
 * cobrem quem descarta um cenário que não serviu e retoma uma preparação que
 * falhou, e cortam o laço. A decisão comercial de uso ilimitado (13/09) fala
 * de treinos no prazo, não de cenários descartados sem conversa. A chave é
 * por pessoa e empresa; a mensagem diz quanto falta.
 */
export { INICIOS_POR_HORA_VENDAS, CODIGO_LIMITE_INICIOS_VENDAS };
// O 429 leva o código: a tela traduz por ele (`startLimitReached`).
export const simVendasInicioLimiter = createRateLimiter({
  maxRequests: INICIOS_POR_HORA_VENDAS,
  windowMs: 60 * 60_000,
  codigo: CODIGO_LIMITE_INICIOS_VENDAS,
  mensagem: (segundos) =>
    `Você começou ${INICIOS_POR_HORA_VENDAS} treinos na última hora. Para começar outro, aguarde cerca de ${Math.max(1, Math.ceil(segundos / 60))} min. Seus treinos e o histórico continuam disponíveis.`,
});

/** Rotas de upload/PDF (pesado): 5 req/min por user */
export const heavyLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

/** Rotas de leitura normal: 60 req/min por user */
export const readLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });

/**
 * Rotas de autenticação (não autenticadas, disparam email/WhatsApp/SMS = custo):
 * 8 req/min por IP. Protege contra enumeração e abuso de envio (SES/Resend/Z-API).
 * Com UPSTASH_REDIS_REST_* configuradas o limite é distribuído de verdade;
 * sem elas, é por-instância (teto grosseiro).
 */
export const authLimiter = createRateLimiter({ maxRequests: 8, windowMs: 60_000 });

// ── Teto por DESTINATÁRIO nas portas de login (R-79, 03/10/2026) ────────────
//
// O `authLimiter` conta por IP. Com IPs variados (qualquer rede de celular),
// dava para disparar templates pagos repetidos no WhatsApp de uma pessoa, e
// links em série no e-mail dela, sem esbarrar em nada. O teto aqui conta por
// QUEM RECEBE: o mesmo e-mail ou o mesmo telefone, venha o pedido de onde vier.
//
// Os números vêm do uso real (links por e-mail, 60 dias até 03/10/2026): o
// máximo foi 6 pedidos numa hora (uma vez) e 7 num dia (uma vez); 426 das 430
// horas com pedido tiveram até 3. Cinco por hora e dez por dia cobrem quem não
// recebeu e pediu de novo, e cortam a rajada.
//
// ⚠️ O teto vale para QUALQUER destino, cadastrado ou não, e é checado ANTES
// da consulta ao cadastro. Assim o 429 não diz se o e-mail ou o número existe,
// e as respostas genéricas de anti-enumeração continuam genéricas.
//
// O efeito colateral aceito: quem esgota o teto de alguém tranca o pedido de
// link dessa pessoa até a janela andar. O último link que chegou a ela
// continua valendo (1 hora), então o atacante gasta os pedidos entregando à
// vítima exatamente o que ela precisa para entrar.
export const LINKS_POR_DESTINO_HORA = 5;
export const LINKS_POR_DESTINO_DIA = 10;

const mensagemDoDestino = (segundos: number) => {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  const espera = minutos >= 90 ? `cerca de ${Math.round(minutos / 60)} h` : `cerca de ${minutos} min`;
  return `Já pedimos muitos links para este contato. Use o último que chegou ou tente de novo em ${espera}.`;
};

const destinoPorHora = createRateLimiter({
  maxRequests: LINKS_POR_DESTINO_HORA,
  windowMs: 60 * 60_000,
  escopo: 'login-destino-hora',
  codigo: CODIGO_LIMITE_DESTINO,
  mensagem: mensagemDoDestino,
});
const destinoPorDia = createRateLimiter({
  maxRequests: LINKS_POR_DESTINO_DIA,
  windowMs: 24 * 60 * 60_000,
  escopo: 'login-destino-dia',
  codigo: CODIGO_LIMITE_DESTINO,
  mensagem: mensagemDoDestino,
});

/**
 * Chave do destinatário: o valor normalizado, em hash. O Redis da Upstash é um
 * terceiro, e a chave fica lá a janela inteira; e-mail e telefone em claro
 * seriam dado pessoal guardado só para contar.
 */
export async function chaveDoDestino(canal: 'email' | 'telefone', valor: string): Promise<string> {
  const normal = canal === 'email' ? valor.trim().toLowerCase() : valor.replace(/\D/g, '');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${canal}:${normal}`));
  const hex = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${canal}:${hex.slice(0, 40)}`;
}

/**
 * 429 se este destinatário já pediu links demais (hora ou dia); `null` se pode
 * seguir. Destino vazio não conta (a validação da rota responde antes).
 */
export async function limitarPorDestino(
  req: Request,
  canal: 'email' | 'telefone',
  valor: string | null | undefined,
): Promise<Response | null> {
  if (!valor || !String(valor).trim()) return null;
  const chave = await chaveDoDestino(canal, String(valor));
  return (await destinoPorHora.check(req, chave)) ?? (await destinoPorDia.check(req, chave));
}
