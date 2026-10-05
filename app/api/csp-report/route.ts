import { createRateLimiter } from '@/lib/rate-limit';
import { lerCorpoLimitado, normalizarRelatorios, registrarRelatorio } from '@/lib/csp-relatorio';

export const dynamic = 'force-dynamic';

/**
 * Destino dos relatórios de violação da CSP em MODO RELATÓRIO (`lib/csp-politica.mjs`).
 *
 * Pública de propósito: o navegador manda o relatório sem sessão, e a rota só escreve em
 * LOG (nada de banco, nada de gravação por conta de quem manda). Por isso o cuidado está em
 * `lib/csp-relatorio.ts`: sai a query string das URLs (token de acesso), a amostra do script
 * é cortada e a repetição é deduplicada. O teto de tamanho e o rate limit são contra quem
 * usar a rota para encher o log; passar do teto é sempre 204, nunca erro, para não virar um
 * novo sinal ("esta rota reage ao que eu mando") nem ruído no console do navegador.
 */

const TAMANHO_MAXIMO = 16 * 1024;
const rateLimit = createRateLimiter({ maxRequests: 200, windowMs: 60_000, escopo: 'csp-report' });

const semConteudo = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  if (await rateLimit.check(req)) return semConteudo();
  try {
    const bruto = await lerCorpoLimitado(req, TAMANHO_MAXIMO);
    if (!bruto) return semConteudo();
    for (const relatorio of normalizarRelatorios(JSON.parse(bruto))) registrarRelatorio(relatorio);
  } catch {
    // JSON inválido ou corpo estranho: não é problema de ninguém, e responder com erro só
    // ensinaria a quem sonda o que esta rota aceita.
  }
  return semConteudo();
}
