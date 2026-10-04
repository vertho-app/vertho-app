/**
 * O encerramento do Personalizado SEM fechamento (03/10/2026) e o que vem depois.
 *
 * Sem slot de avaliação no plano, o caminho normal de conclusão
 * (`gerarEvolutionReportCore`, que EXIGE o fechamento pontuado) nunca roda: a
 * trilha conclui quando a última semana de conteúdo conclui, na rota
 * /reflection, por um `update` que grava o relatório e o status.
 *
 * `encerrarTrilhaSemFechamento` é esse `update`, COM o `{ error }` lido (R-138,
 * 04/10/2026). Antes ele ficava na rota sem ler o erro (dívida declarada do guard
 * E11) e a rota respondia normalmente mesmo quando a trilha não tinha concluído:
 * a pessoa terminava tudo e não via relatório nem certificado, sem que ninguém
 * soubesse. Agora a falha é registrada (crítico) e devolvida à rota, que responde
 * o estado real, e a próxima fala na conversa encerrada tenta de novo.
 *
 * `aposEncerramentoSemFechamento` roda depois, dentro de `after()`: relê a trilha
 * (com o erro lido) e só encadeia a próxima competência se ela estiver MESMO
 * concluída. Fica como segunda trava.
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { TRILHA } from '@/lib/status';
import { encadearAposConclusao, type ResultadoEncadeamento } from './encadear-jornada';
import { montarReportSemFechamento } from './programa-custom';

export type ResultadoEncerramento = { ok: true; encerrou: boolean } | { ok: false; erro: string };

/**
 * Conclui a trilha gravando o relatório de programa completo. Idempotente: só
 * age em trilha que ainda não concluiu (`encerrou: false` = já estava
 * concluída, nada foi reescrito, e o relatório e a data originais ficam).
 * Nunca lança: a falha volta como `{ ok: false }` e fica em `degradacao_log`.
 */
export async function encerrarTrilhaSemFechamento(
  sb: any,
  trilha: { id: string; empresa_id: string; colaborador_id?: string | null; competencia_foco?: string | null; descritores_selecionados?: any },
): Promise<ResultadoEncerramento> {
  let erro: string | null = null;
  let encerrou = false;
  try {
    const { data, error } = await sb.from('trilhas').update({
      evolution_report: montarReportSemFechamento(trilha),
      evolution_generated_at: new Date().toISOString(),
      status: TRILHA.CONCLUIDA,
    }).eq('id', trilha.id).eq('empresa_id', trilha.empresa_id).neq('status', TRILHA.CONCLUIDA).select('id');
    if (error) erro = String(error.message || error);
    else encerrou = Array.isArray(data) && data.length > 0;
  } catch (e: any) {
    erro = String(e?.message || e);
  }
  if (erro) {
    console.error('[encerramento sem fechamento] trilha não concluída:', erro);
    await registrarDegradacao({
      fluxo: 'trilha',
      tipo: DEGRADACAO.ENCERRAMENTO_SEM_FECHAMENTO_FALHOU,
      chave: trilha.id,
      empresaId: trilha.empresa_id,
      colaboradorId: trilha.colaborador_id ?? null,
      severidade: 'critico',
      detalhe: { erro: `gravação da conclusão: ${erro.slice(0, 300)}` },
    });
    return { ok: false, erro };
  }
  return { ok: true, encerrou };
}

export interface TrilhaEncerrada {
  id: string;
  empresa_id: string;
  colaborador_id?: string | null;
}

export async function aposEncerramentoSemFechamento(
  sbRaw: any,
  tdb: any,
  trilha: TrilhaEncerrada,
): Promise<ResultadoEncadeamento | null> {
  try {
    const { data: gravada, error } = await tdb.from('trilhas')
      .select('status').eq('id', trilha.id).maybeSingle();
    const naoConcluiu = !!error || gravada?.status !== TRILHA.CONCLUIDA;
    if (naoConcluiu) {
      await registrarDegradacao({
        fluxo: 'trilha',
        tipo: DEGRADACAO.ENCERRAMENTO_SEM_FECHAMENTO_FALHOU,
        chave: trilha.id,
        empresaId: trilha.empresa_id,
        colaboradorId: trilha.colaborador_id ?? null,
        severidade: 'critico',
        detalhe: error
          ? { erro: `releitura da trilha: ${String(error.message || error).slice(0, 300)}` }
          : { status_gravado: gravada?.status ?? null },
      });
      return null;
    }
    return await encadearAposConclusao(sbRaw, tdb, trilha.id);
  } catch (e: any) {
    console.error('[encerramento sem fechamento]', e?.message || e);
    return null;
  }
}
