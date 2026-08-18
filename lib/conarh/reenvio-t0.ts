import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { criarPaceadorSincrono } from '@/lib/whatsapp/cadencia';
import { entregarT0 } from './entrega-t0';
import { ENTREGA_T0, ENTREGA_T0_NA_FILA, type EntregaT0Status } from '@/lib/status';

/**
 * CONARH 52 — a FILA de entrega do T+0: varre os leads cujo recorte não chegou e
 * re-tenta.
 *
 * 🔑 Não existe tabela de outbox. O item pendente É o lead com
 * ENTREGA_T0_NA_FILA (mig 221) — o estado mora onde o dado já
 * mora, e a fila não pode divergir da realidade porque ela É a realidade.
 *
 * POR QUE (18/08/2026, dia 1 da feira): `recorte_demonstracao` está PENDING na
 * Meta e a Z-API caiu em 11/08 — hoje o T+0 não sai por nenhum caminho. Guardar
 * "para enviar depois" só vale se o depois de fato acontecer, então há DOIS
 * gatilhos, de propósito:
 *   • automático — cron `conarh_reenvio_t0`, de 15 em 15 min na janela da feira.
 *     É o que faz a fila esvaziar sozinha assim que a Meta aprovar o template.
 *   • manual — botão na tela da equipe (`/conarh/fila`), para não depender do
 *     relógio quando a aprovação sair no meio de uma conversa.
 * Fila sem botão é o caso do PDI (34 pessoas sem aviso, disparo que ninguém
 * apertou); botão sem cron é o mesmo risco com outra roupa.
 *
 * ⚠️ Cadência: o envio vai pela política única (`lib/whatsapp/cadencia`), com
 * espaçamento e teto. Um lote de leads de feira disparado sem intervalo é
 * exatamente o padrão que derrubou o número em 11/08 (155 mensagens a 2s).
 */

/** Leads que já foram tentados demais: param de entrar na varredura AUTOMÁTICA. */
const MAX_TENTATIVAS_AUTOMATICAS = 10;

/** Teto de leitura por rodada. O que sobra volta na próxima — e é REPORTADO. */
const MAX_LEITURA = 200;

export interface ContagemT0 {
  enviado: number;
  pendente: number;
  falhou: number;
  desconhecido: number;
  /** O que a tela chama de "não entregues": pendente + falhou. */
  naFila: number;
}

/**
 * Contagem por status da campanha inteira (não só do dia): quem ficou devendo
 * ontem continua devendo hoje.
 *
 * `count: 'exact', head: true` de propósito — contagem que decide não pode sair
 * de `.limit()`, que devolve amostra e mente com cara de total.
 */
export async function contarEntregasT0(): Promise<ContagemT0> {
  const sb = createSupabaseAdmin();

  // Casado por CHAVE, nunca por posição: `Object.values` segue a ordem de
  // declaração em `lib/status.ts`, e um status inserido no meio de lá trocaria
  // silenciosamente dois números desta tela.
  const pares = await Promise.all(
    Object.values(ENTREGA_T0).map(async (s) => {
      const { count, error } = await sb
        .from('diag_leads')
        .select('id', { count: 'exact', head: true })
        .eq('scope_id', 'conarh-2026')
        .eq('t0_status', s);
      if (error) throw new Error(`[conarh/reenvio] contagem ${s} falhou: ${error.message}`);
      return [s, count || 0] as const;
    }),
  );
  const por = Object.fromEntries(pares) as Record<EntregaT0Status, number>;

  const pendente = por[ENTREGA_T0.PENDENTE];
  const falhou = por[ENTREGA_T0.FALHOU];
  return {
    enviado: por[ENTREGA_T0.ENVIADO],
    pendente,
    falhou,
    desconhecido: por[ENTREGA_T0.DESCONHECIDO],
    naFila: pendente + falhou,
  };
}

export interface ResultadoReenvio {
  /** Quantos estavam na fila no início da rodada (pendente + falhou, elegíveis). */
  elegiveis: number;
  /** Entregaram nesta rodada. */
  entregues: number;
  /** Tentados e ainda sem chegar (o motivo fica em `t0_erro`, por lead). */
  falharam: number;
  /**
   * Elegíveis que NÃO foram tentados nesta rodada, por teto de volume/tempo.
   * Nunca omitido: teto silencioso lê-se como "cobriu tudo" quando não cobriu.
   */
  adiados: number;
  motivoDoTeto: string | null;
  /** Fila depois da rodada. */
  restam: number;
}

/**
 * Re-tenta a entrega dos pendentes, do mais antigo para o mais novo.
 *
 * ORDEM ASC de propósito: quem está esperando desde ontem recebe antes de quem
 * acabou de sair do estande — e é a cabeça da fila, não uma amostra dela.
 *
 * `desconhecido` (leads anteriores à mig 221) fica FORA: não se sabe se
 * receberam, e reenviar o recorte para quem já leu é ruído. Eles aparecem na tela
 * e podem ser disparados um a um, à mão.
 */
export async function reenviarPendentesT0(opts: { incluirEsgotados?: boolean } = {}): Promise<ResultadoReenvio> {
  const sb = createSupabaseAdmin();

  let query = sb
    .from('diag_leads')
    .select('id, t0_tentativas')
    .eq('scope_id', 'conarh-2026')
    .in('t0_status', ENTREGA_T0_NA_FILA)
    .order('criado_em', { ascending: true })
    .limit(MAX_LEITURA);

  // O disparo manual pode insistir num lead já esgotado (telefone errado que a
  // equipe corrigiu, por exemplo); a varredura automática não martela para sempre.
  if (!opts.incluirEsgotados) query = query.lt('t0_tentativas', MAX_TENTATIVAS_AUTOMATICAS);

  const { data: leads, error } = await query;
  if (error) throw new Error(`[conarh/reenvio] leitura falhou: ${error.message}`);

  const elegiveis = leads?.length || 0;
  let entregues = 0;
  let falharam = 0;
  let adiados = 0;

  const paceador = criarPaceadorSincrono();

  for (const lead of leads || []) {
    // Teto de volume ou de tempo da invocação: NÃO tenta e NÃO marca nada — o
    // lead continua na fila e entra na próxima rodada. Adiar é diferente de
    // pular em silêncio.
    if (paceador.tetoAtingido()) {
      adiados++;
      continue;
    }
    await paceador.aguardarVez();
    try {
      const r = await entregarT0(lead.id);
      if (r.tipo === 'executado' && r.status === ENTREGA_T0.ENVIADO) entregues++;
      else if (r.tipo === 'ja_entregue') entregues++;
      else falharam++;
    } catch (err: any) {
      // Um lead quebrado NUNCA derruba a varredura (o cron precisa terminar).
      falharam++;
      console.error(`[conarh/reenvio] lead ${lead.id} falhou:`, err?.message || err);
    }
  }

  const motivoDoTeto = adiados > 0 ? paceador.motivoDoTeto() : null;
  const restam = elegiveis - entregues;

  console.log(
    `[conarh/reenvio] elegíveis=${elegiveis} entregues=${entregues} falharam=${falharam} ` +
      `adiados=${adiados}${motivoDoTeto ? ` (teto: ${motivoDoTeto})` : ''} restam=${restam}`,
  );

  return { elegiveis, entregues, falharam, adiados, motivoDoTeto, restam };
}
