/**
 * O CONTEÚDO do que sai pelo WhatsApp — um lugar só, para os dois emissores.
 *
 * 🔴 POR QUE ISTO EXISTE (medido em 17/08/2026)
 * ─────────────────────────────────────────────
 * `whatsapp_mensagens_enviadas` (mig 215) existia desde 15/08 e tinha **5 linhas
 * no banco inteiro** — todas de UMA conversa, todas gravadas pela caixa de
 * entrada. Tudo o que a CADÊNCIA manda (pílula, missão, cobrança de quinta,
 * retomada, perfil, plano, acesso) passava por `lib/whatsapp/cloud-api.ts`, que
 * só chamava `registrarEntrega` — telemetria SEM texto e SEM telefone.
 *
 * O efeito na tela: a equipe abre a conversa de quem respondeu e vê apenas a
 * resposta. *"Agradeço sua mensagem, não estou disponível"* — a quê? A pílula que
 * o app entregou doze segundos antes não aparece em lugar nenhum. Meia conversa
 * não parece incompleta, parece defeito; e sem o que foi enviado, quem atende
 * responde no escuro.
 *
 * ⚠️ E `notification_deliveries` NÃO resolvia isso, por três motivos que só
 * aparecem juntos: ela não tem texto, não tem telefone (a thread só a alcança
 * quando já sabe o `colaborador_id`) e o envio de acesso/OTP chega com
 * `colaborador_id` nulo. Três buracos, o mesmo sintoma.
 *
 * REGRA DE OURO, herdada de `delivery-log.ts`: **NUNCA lança.** Isto roda depois
 * de a mensagem já ter saído — derrubar o envio por causa do registro seria
 * trocar um problema de tela por um problema de gente. Mas a falha também não é
 * engolida: vira `registrarDegradacao` CRÍTICA, porque o efeito dela está do lado
 * de fora (a pessoa recebeu, a equipe não vê, alguém reescreve e ela recebe duas).
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

export interface SaidaWhatsApp {
  /** E.164 sem "+", como foi para a Meta. */
  telefone: string;
  /** text | image | audio | video | document | template */
  tipo: string;
  /** Corpo, quando existe e quando pode ser guardado. Ver `texto` em `cloud-api`. */
  texto?: string | null;
  /** Nome do template na Meta — é o rótulo que a thread mostra quando não há texto. */
  templateNome?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  /** Quem clicou. Ausente = automático (cadência) — a distinção tem uso em auditoria. */
  autorEmail?: string | null;
  /** inbox | cadencia */
  origem?: string;
  dedupeKey?: string | null;
  /** wamid, quando a Meta devolveu um. */
  wamid?: string | null;
  /** Preenchido quando o envio falhou — a tentativa aparece na thread. */
  erro?: string | null;
  /** Payload no formato da Meta (anexo), lido por `midiaIdDoRaw`. */
  raw?: Record<string, unknown> | null;
}

type ClientMinimo = { from: (t: string) => any };

/**
 * Grava uma mensagem que saiu (ou tentou sair).
 *
 * `23505` é tratado como SUCESSO e não como falha: os dois índices únicos da
 * tabela (`wa_message_id` e `dedupe_key`) existem justamente para o segundo
 * registro do mesmo envio não virar linha nova. Um retry idempotente que
 * disparasse alarme crítico ensinaria a equipe a ignorar o alarme.
 */
export async function registrarSaida(s: SaidaWhatsApp, sb?: ClientMinimo): Promise<void> {
  try {
    const client = sb ?? createSupabaseAdmin();
    const { error } = await client.from('whatsapp_mensagens_enviadas').insert({
      empresa_id: s.empresaId ?? null,
      colaborador_id: s.colaboradorId ?? null,
      wa_message_id: s.wamid ?? null,
      to_phone: s.telefone,
      from_phone_id: process.env.PHONE_NUMBER_ID || null,
      tipo: s.tipo,
      texto: s.texto ?? null,
      template_nome: s.templateNome ?? null,
      autor_email: s.autorEmail ?? null,
      origem: s.origem || 'cadencia',
      dedupe_key: s.dedupeKey ?? null,
      erro: s.erro ?? null,
      raw: (s.raw ?? null) as any,
    });

    // supabase-js RETORNA `{ error }` — sem este check a linha sumiria calada.
    if (error && (error as any).code !== '23505') {
      await avisarFalha(s, error.message ?? String(error));
    }
  } catch (e) {
    await avisarFalha(s, e instanceof Error ? e.message : String(e));
  }
}

async function avisarFalha(s: SaidaWhatsApp, motivo: string): Promise<void> {
  console.error(`[whatsapp-saida] não gravei o conteúdo (${s.origem || 'cadencia'}/${s.tipo}):`, motivo);
  await registrarDegradacao({
    fluxo: 'envio',
    tipo: DEGRADACAO.INBOX_ESCRITA_PERDIDA,
    chave: 'registrar-saida',
    empresaId: s.empresaId ?? null,
    colaboradorId: s.colaboradorId ?? null,
    severidade: 'critico',
    detalhe: { wamid: s.wamid ?? null, tipo: s.tipo, template: s.templateNome ?? null, motivo },
  });
}
