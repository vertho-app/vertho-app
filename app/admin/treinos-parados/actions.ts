'use server';

import { z } from 'zod';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requirePlataformaSupabase } from '@/lib/admin-supabase';
import { logAdminAction } from '@/lib/audit';
import {
  HORAS_SEM_ATIVIDADE,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  encerrarSemDevolutiva,
  listarTreinosParados,
  type EncerramentoRecusa,
  type TreinoParado,
} from '@/lib/simuladores/treinos-parados';

/**
 * "Treinos parados" (R-96, 04/10/2026): a lista dos treinos de vendas e de
 * atendimento em andamento sem atividade há mais de 48 horas, e o botão que
 * encerra um deles SEM devolutiva e SEM chamar IA. A regra, o porquê e o que cada
 * simulador faz com a sessão estão em `lib/simuladores/treinos-parados.ts`.
 *
 * AUTORIZAÇÃO. Num arquivo `'use server'` todo export é endpoint HTTP e todo
 * parâmetro é escolhido pelo cliente:
 *  · ler a lista: qualquer platform admin (inclusive o Sócio, que lê e não opera);
 *  · encerrar: platform admin COM `simulador.sessoes.manage`, que só o master tem
 *    no papel base. RH, gestor e Sócio recebem FORBIDDEN antes de qualquer leitura
 *    ou escrita. O `empresaId` e o `sessaoId` do pedido são confrontados no banco
 *    (a sessão só é achada se for dessa empresa), e a linha da auditoria usa a
 *    empresa da sessão, nunca um valor forjado.
 */

const entradaSchema = z
  .object({
    simulador: z.enum(['vendas', 'atendimento']),
    empresaId: z.uuid(),
    sessaoId: z.uuid(),
    motivo: z.string().trim().min(MOTIVO_MINIMO).max(MOTIVO_MAXIMO),
  })
  .strict();

const ACAO_AUDITORIA = 'simulador.sessao.encerrar_sem_devolutiva';

export type TreinosParadosResultado =
  | { success: true; itens: TreinoParado[]; truncado: boolean; horas: number }
  | { success: false; error: string };

export async function carregarTreinosParados(empresaId?: string | null): Promise<TreinosParadosResultado> {
  await requireAdminAction();
  const sb = await requirePlataformaSupabase();
  if (empresaId && !z.uuid().safeParse(empresaId).success)
    return { success: false, error: 'Selecione uma empresa válida.' };
  try {
    const lista = await listarTreinosParados(sb, { empresaId: empresaId || null });
    return { success: true, ...lista };
  } catch {
    // Falha de leitura nunca vira "nenhum treino parado".
    return { success: false, error: 'Não foi possível carregar os treinos parados. Tente novamente.' };
  }
}

export type CodigoRecusa = EncerramentoRecusa | 'motivo_obrigatorio' | 'entrada_invalida' | 'erro';

export type EncerrarResultado =
  | {
      success: true;
      statusNovo: string;
      temConversa: boolean;
      /** `false` = encerrou, mas a linha de auditoria não foi gravada (o erro foi ao log). */
      auditoria: boolean;
    }
  | { success: false; codigo: CodigoRecusa; error: string };

/** Pedaço do que o cliente mandou, curto, só para o rastro da recusa. */
const trecho = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : null);

export async function encerrarTreinoSemDevolutiva(entrada: {
  simulador: string;
  empresaId: string;
  sessaoId: string;
  motivo: string;
}): Promise<EncerrarResultado> {
  const auth = await requireAdminAction('simulador.sessoes.manage');
  const bruto = (entrada ?? {}) as Record<string, unknown>;

  const recusar = async (
    codigo: CodigoRecusa,
    error: string,
    extra: { empresaId?: string | null; detalhes?: Record<string, unknown> } = {},
  ): Promise<EncerrarResultado> => {
    await logAdminAction({
      adminEmail: auth.email,
      acao: ACAO_AUDITORIA,
      // A coluna tem FK para `empresas`: só recebe a empresa quando a sessão foi achada nela.
      empresaId: extra.empresaId ?? null,
      alvo: `${trecho(bruto.simulador) ?? '?'}:${trecho(bruto.sessaoId) ?? '?'}`,
      resultado: 'erro',
      detalhes: {
        recusa: codigo,
        simulador: trecho(bruto.simulador),
        sessao_id_pedida: trecho(bruto.sessaoId),
        empresa_id_pedida: trecho(bruto.empresaId),
        ...(extra.detalhes ?? {}),
      },
    });
    return { success: false, codigo, error };
  };

  const parsed = entradaSchema.safeParse(bruto);
  if (!parsed.success) {
    const motivo = typeof bruto.motivo === 'string' ? bruto.motivo.trim() : '';
    if (motivo.length < MOTIVO_MINIMO || motivo.length > MOTIVO_MAXIMO)
      return recusar(
        'motivo_obrigatorio',
        `Informe o motivo do encerramento, com ${MOTIVO_MINIMO} a ${MOTIVO_MAXIMO} caracteres.`,
      );
    return recusar('entrada_invalida', 'Pedido de encerramento inválido.');
  }
  const { simulador, empresaId, sessaoId, motivo } = parsed.data;

  let resultado;
  try {
    resultado = await encerrarSemDevolutiva({ simulador, empresaId, sessaoId });
  } catch {
    return recusar('erro', 'Não foi possível encerrar o treino. Tente novamente.', {
      detalhes: { motivo },
    });
  }

  if (!resultado.ok) {
    const achada = resultado.codigo !== 'nao_encontrada' && resultado.codigo !== 'falha';
    return recusar(resultado.codigo, resultado.mensagem, {
      empresaId: achada ? empresaId : null,
      detalhes: { motivo },
    });
  }

  const gravada = await logAdminAction({
    adminEmail: auth.email,
    acao: ACAO_AUDITORIA,
    empresaId: resultado.empresaId,
    alvo: `${resultado.simulador}:${resultado.sessaoId}`,
    resultado: 'ok',
    detalhes: {
      motivo,
      simulador: resultado.simulador,
      sessao_id: resultado.sessaoId,
      colaborador_id: resultado.colaboradorId,
      status_anterior: resultado.statusAnterior,
      status_novo: resultado.statusNovo,
      tem_conversa: resultado.temConversa,
      horas_parado: resultado.horasParado,
      horas_minimas: HORAS_SEM_ATIVIDADE,
    },
  });
  return { success: true, statusNovo: resultado.statusNovo, temConversa: resultado.temConversa, auditoria: gravada };
}
