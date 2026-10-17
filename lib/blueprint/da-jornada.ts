/**
 * O blueprint da JORNADA ATUAL da pessoa: a leitura que PDI e trilha fazem do blueprint (17/10/2026).
 *
 * `development_blueprints` tem uma linha por pessoa. Quando a pessoa abre uma jornada nova (participação com
 * `marco_jornada`, Temporada 2 de Ibipeba), o blueprint que está lá ainda é o da jornada anterior até ser regerado.
 * O PDI usa o blueprint ANTES do foco do cargo (`relatorio-individual-prompt.ts`) e a trilha monta as semanas a partir
 * dele: lido sem esta régua, um blueprint da Temporada 1 levaria o PDI e a trilha novos para a competência antiga.
 * Blueprint de outra jornada conta como AUSENTE, e quem lê já tem o caminho de "sem blueprint".
 *
 * Sem participação com marco, a janela é aberta e nada muda.
 */
import { artefatoDaJornadaAtual, carregarJanelaAtual } from '@/lib/turmas/jornada-atual';
import type { Janela } from '@/lib/turmas/janela';

export interface BlueprintDaJornada {
  blueprint: any | null;
  /** Havia blueprint, mas de uma jornada anterior (não serve). */
  deOutraJornada?: boolean;
  error?: string;
}

/** @param janelaJaLida a janela da jornada atual, quando quem chama já a tem (o PDI lê a jornada no início). */
export async function lerBlueprintDaJornada(
  sbRaw: any,
  tdb: any,
  empresaId: string,
  colaboradorId: string,
  janelaJaLida?: Janela,
): Promise<BlueprintDaJornada> {
  const { data: bpRow, error } = await tdb.from('development_blueprints')
    .select('blueprint, gerado_em')
    .eq('colaborador_id', colaboradorId)
    .order('gerado_em', { ascending: false })
    .limit(1).maybeSingle();
  if (error) return { blueprint: null, error: error.message };
  if (!bpRow?.blueprint) return { blueprint: null };
  let janela = janelaJaLida;
  if (!janela) {
    try {
      janela = await carregarJanelaAtual(sbRaw, empresaId, colaboradorId);
    } catch (e: any) {
      // Sem saber a jornada, o blueprint não é usado: usar um de outra jornada é pior que o caminho sem blueprint.
      return { blueprint: null, error: String(e?.message || e) };
    }
  }
  if (!artefatoDaJornadaAtual(bpRow.gerado_em, janela)) return { blueprint: null, deOutraJornada: true };
  return { blueprint: bpRow.blueprint };
}
