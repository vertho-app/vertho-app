/**
 * Depois do encerramento do Personalizado SEM fechamento (03/10/2026).
 *
 * Sem slot de avaliação no plano, o caminho normal de conclusão
 * (`gerarEvolutionReportCore`, que EXIGE o fechamento pontuado) nunca roda: a
 * trilha conclui quando a última semana de conteúdo conclui, na rota
 * /reflection, por um `update` que grava o relatório e o status.
 *
 * ⚠️ Aquele `update` não lê o `{ error }` que o supabase-js RETORNA, e é dívida
 * DECLARADA do guard E11 (`config/error-nao-checado-allowlist.json`). Mudar o
 * texto dele obrigaria a encolher a allowlist, que é zona do dono, então ele
 * ficou como estava. Esta função fecha o efeito da dívida em vez de esconder:
 * relê a trilha (com o erro lido) e só encadeia a próxima competência se a
 * trilha estiver MESMO concluída. Se não estiver, a falha vira linha crítica
 * em `degradacao_log`: a pessoa terminou tudo e não vê relatório nem
 * certificado, e não há um passo seguinte dela que tente de novo.
 *
 * Roda dentro de `after()`, depois da resposta da conversa: nunca lança.
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { TRILHA } from '@/lib/status';
import { encadearAposConclusao, type ResultadoEncadeamento } from './encadear-jornada';

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
