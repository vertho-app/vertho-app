import 'server-only';
import { Redis } from '@upstash/redis';
import { BEDROCK_KIMI_K3_MODEL } from '@/lib/ai-provedores';

export const BEDROCK_PILOTO_TASK = 'conteudo_tags';
export const BEDROCK_PILOTO_MAX_TOKENS = 6000;
export const BEDROCK_PILOTO_MAX_BYTES = 25_000;
export const BEDROCK_PILOTO_MAX_CHAMADAS = 50;
export const BEDROCK_PILOTO_CONTADOR = 'vertho:bedrock:piloto:conteudo-tags:20261006';

/** A credencial liga somente o botão de sugestão editorial. */
export function modeloDoPilotoBedrock(): string | null {
  return process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() ? BEDROCK_KIMI_K3_MODEL : null;
}

// Sem expiração e sem estorno: timeout/erro podem ter sido cobrados pela AWS.
// 25 KB de entrada (incluindo mensagens) + 6.000 tokens de saída/raciocínio
// ficam abaixo de US$ 0,20/chamada a $3,75/$15 por milhão (cache-write/saída).
// Reservar US$ 0,20 por tentativa limita o conjunto a US$ 10, mesmo com corrida
// entre lambdas. Tokens reais e custo estimado continuam no ledger habitual.
const RESERVAR = `
local usadas = tonumber(redis.call('GET', KEYS[1]) or '0')
if usadas >= tonumber(ARGV[1]) then return 0 end
redis.call('INCR', KEYS[1])
return 1
`;

export async function reservarChamadaBedrock(taskKey: string | undefined, body: string): Promise<void> {
  if (taskKey !== BEDROCK_PILOTO_TASK) throw new Error('Bedrock: o piloto está limitado à sugestão de tags de conteúdos.');
  const request = JSON.parse(body);
  if (!Number.isInteger(request.max_completion_tokens) || request.max_completion_tokens < 1 || request.max_completion_tokens > BEDROCK_PILOTO_MAX_TOKENS
    || Buffer.byteLength(body, 'utf8') > BEDROCK_PILOTO_MAX_BYTES) {
    throw new Error('Bedrock: conteúdo grande demais para o limite deste piloto.');
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Bedrock: controle de orçamento indisponível. Nenhuma chamada foi enviada.');
  let reservado: number;
  try {
    reservado = Number(await new Redis({ url, token }).eval(RESERVAR, [BEDROCK_PILOTO_CONTADOR], [BEDROCK_PILOTO_MAX_CHAMADAS]));
  } catch {
    throw new Error('Bedrock: não foi possível consultar o orçamento. Nenhuma chamada foi enviada.');
  }
  if (reservado !== 1) throw new Error('O piloto Bedrock atingiu o limite de 50 chamadas (reserva total de US$ 10).');
}
