/**
 * Telemetria de ENTREGA por canal (mig 198).
 *
 * Por que existe: o serviço central de WhatsApp (`lib/whatsapp/index.ts`) não
 * persistia nada. Sem log não existe denominador — e sem denominador não dá para
 * responder "quanto do volume de WhatsApp é cadência (pílula/nudge) e quanto é
 * autenticação (OTP/magic link)", que é a premissa do projeto de Web Push. Uma
 * comparação entre canais feita sobre populações medidas de formas diferentes
 * não é comparação, é ilusão.
 *
 * REGRA DE OURO (mesma de `lib/degradacao.ts`): NUNCA lança. Isto roda no
 * caminho de envio real — se a telemetria derrubasse o envio, o remédio seria
 * pior que a doença. E, ao contrário de um `try/catch` ingênuo, aqui a falha
 * NÃO é engolida: vira `registrarDegradacao`, porque uma tabela vazia na
 * segunda-feira é ambígua entre "ninguém enviou" e "o logger quebrou", e essa
 * ambiguidade custaria a rodada inteira de medição.
 *
 * ⚠️ supabase-js RETORNA `{ error }` — não lança. `try/catch` sozinho aqui
 * deixaria a falha passar invisível; por isso o retorno é checado explicitamente.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

// 'sms' entrou em 13/08/2026 (mig 211) como contingência de ACESSO. Manter em
// sincronia com o CHECK `notification_deliveries_channel_chk`: um valor aqui que
// o banco recusa vira erro 23514 no caminho de envio — e, como `registrarEntrega`
// não lança, viraria degradação silenciosa em vez de canal medido.
export type EntregaCanal = 'whatsapp' | 'email' | 'webpush' | 'fcm' | 'apns' | 'sms';
export type EntregaStatus = 'tentativa' | 'sucesso' | 'falha';

export interface EntregaInput {
  canal: EntregaCanal;
  status: EntregaStatus;
  /**
   * Motivo de NEGÓCIO (pilula, otp, magic_link, convite, nudge, alerta...).
   * Ausente = call site ainda não instrumentado. A linha é gravada assim mesmo:
   * o volume do canal fica completo e a lacuna vira consulta
   * (`kind IS NULL`), em vez de sumir sem deixar rastro.
   */
  kind?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  /** Fornecedor dentro do canal (zapi, wasender, resend, webpush). */
  provider?: string | null;
  endpointId?: string | null;
  error?: string | null;
  dedupeKey?: string | null;
}

const TABELA = 'notification_deliveries';

type MinimalClient = { from: (t: string) => any };

/**
 * Grava uma linha de entrega e devolve o `id` (necessário para marcar abertura
 * no push). Devolve `null` se não conseguiu gravar — nunca lança.
 */
export async function registrarEntrega(
  input: EntregaInput,
  sb?: MinimalClient
): Promise<string | null> {
  try {
    const client = sb ?? createSupabaseAdmin();
    const { data, error } = await client
      .from(TABELA)
      .insert({
        channel: input.canal,
        status: input.status,
        kind: input.kind ?? null,
        empresa_id: input.empresaId ?? null,
        colaborador_id: input.colaboradorId ?? null,
        provider: input.provider ?? null,
        endpoint_id: input.endpointId ?? null,
        error: input.error ?? null,
        dedupe_key: input.dedupeKey ?? null,
      })
      .select('id')
      .single();

    if (error) {
      await avisarFalhaDeTelemetria(input, error.message ?? String(error));
      return null;
    }
    return (data as { id?: string } | null)?.id ?? null;
  } catch (e) {
    await avisarFalhaDeTelemetria(input, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * A falha da telemetria é ela própria um caminho degradado — e caminho degradado
 * invisível é proibido nesta base. Dedup por (fluxo, tipo, chave) com contador
 * diário já vem de `registrarDegradacao`, então um canal quebrado gera UMA linha
 * por dia por canal, não uma por mensagem.
 */
async function avisarFalhaDeTelemetria(input: EntregaInput, motivo: string) {
  console.error(`[delivery-log] falha ao registrar entrega (${input.canal}/${input.kind ?? 'sem-kind'}):`, motivo);
  await registrarDegradacao({
    fluxo: 'envio',
    tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
    chave: input.canal,
    empresaId: input.empresaId ?? null,
    colaboradorId: input.colaboradorId ?? null,
    severidade: 'aviso',
    detalhe: { kind: input.kind ?? null, motivo },
  });
}
