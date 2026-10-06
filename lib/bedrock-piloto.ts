import 'server-only';
import { Redis } from '@upstash/redis';
import { BEDROCK_KIMI_K3_MODEL } from '@/lib/ai-provedores';
import { bedrockVendasVerthoAutorizado } from '@/lib/bedrock-vendas-vertho';

export const BEDROCK_VENDAS_MAX_BYTES = 500_000;

export const BEDROCK_PILOTO_TASK = 'conteudo_tags';
export const BEDROCK_PILOTO_MAX_TOKENS = 6000;
export const BEDROCK_PILOTO_MAX_BYTES = 25_000;
export const BEDROCK_PILOTO_MAX_CHAMADAS = 50;
export const BEDROCK_PILOTO_CONTADOR =
  'vertho:bedrock:piloto:conteudo-tags:20261006';
// Comparação aprovada do simulador: apenas canários sintéticos, orçamento independente.
export const BEDROCK_CANARIO_CONTADOR =
  'vertho:bedrock:canario:vendas:20261006';
export const BEDROCK_CANARIO_MAX_CHAMADAS = 20;

/** A credencial liga somente o botão de sugestão editorial. */
export function modeloDoPilotoBedrock(): string | null {
  return process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()
    ? BEDROCK_KIMI_K3_MODEL
    : null;
}

// Sem expiração e sem estorno: timeout/erro podem ter sido cobrados pela AWS.
// 25 KB de entrada (incluindo mensagens) + 6.000 tokens de saída/raciocínio
// ficam abaixo de US$ 0,20/chamada a $3,75/$15 por milhão (cache-write/saída).
// Reservar US$ 0,20 por tentativa limita o conjunto a US$ 10, mesmo com corrida
// entre lambdas. Tokens reais e custo estimado continuam no ledger habitual.
// Canários: 80 KB + 6.000 tokens ficam abaixo de US$ 0,40/tentativa;
// 20 reservas independentes limitam a comparação sintética a US$ 8.
const RESERVAR = `
local usadas = tonumber(redis.call('GET', KEYS[1]) or '0')
if usadas >= tonumber(ARGV[1]) then return 0 end
redis.call('INCR', KEYS[1])
return 1
`;

export async function reservarChamadaBedrock(
  taskKey: string | undefined,
  body: string,
  empresaId?: string | null,
): Promise<void> {
  const request = JSON.parse(body);
  const vendas = bedrockVendasVerthoAutorizado(
    request.model,
    taskKey,
    empresaId,
  );
  const canario = taskKey === 'canario_contrato';
  if (!vendas && taskKey !== BEDROCK_PILOTO_TASK && !canario)
    throw new Error('Bedrock: tarefa ou empresa fora dos usos autorizados.');
  if (
    request.model !== BEDROCK_KIMI_K3_MODEL ||
    !Number.isInteger(request.max_completion_tokens) ||
    request.max_completion_tokens < 1 ||
    request.max_completion_tokens >
      (vendas
        ? taskKey === 'sim_vendas_criador'
          ? 8000
          : 2500
        : BEDROCK_PILOTO_MAX_TOKENS) ||
    Buffer.byteLength(body, 'utf8') >
      (vendas
        ? BEDROCK_VENDAS_MAX_BYTES
        : canario
          ? 80_000
          : BEDROCK_PILOTO_MAX_BYTES) ||
    ((vendas || canario) &&
      (request.response_format?.type !== 'json_schema' ||
        request.response_format?.json_schema?.strict !== true ||
        request.reasoning_effort !== 'low'))
  ) {
    throw new Error(
      'Bedrock: pedido fora do schema ou dos limites autorizados.',
    );
  }
  // Treino publicado: limites por chamada e rate limits do módulo; sem consumir
  // o orçamento finito dos ensaios sintéticos ou da classificação editorial.
  if (vendas) return;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token)
    throw new Error(
      'Bedrock: controle de orçamento indisponível. Nenhuma chamada foi enviada.',
    );
  let reservado: number;
  try {
    reservado = Number(
      await new Redis({ url, token }).eval(
        RESERVAR,
        [canario ? BEDROCK_CANARIO_CONTADOR : BEDROCK_PILOTO_CONTADOR],
        [canario ? BEDROCK_CANARIO_MAX_CHAMADAS : BEDROCK_PILOTO_MAX_CHAMADAS],
      ),
    );
  } catch {
    throw new Error(
      'Bedrock: não foi possível consultar o orçamento. Nenhuma chamada foi enviada.',
    );
  }
  if (reservado !== 1)
    throw new Error(
      canario
        ? 'A comparação Bedrock atingiu o limite de 20 chamadas (reserva total de US$ 8).'
        : 'O piloto Bedrock atingiu o limite de 50 chamadas (reserva total de US$ 10).',
    );
}
