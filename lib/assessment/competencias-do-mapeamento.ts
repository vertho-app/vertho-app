/**
 * Quantas competências do MAPEAMENTO do cargo a pessoa já respondeu, para as
 * telas que mostram o progresso sem servir cenário (home, jornada). Núcleo sem
 * gate (fora de `'use server'`): quem chama já autenticou.
 *
 * Existe desde 09/10/2026. A home contava TODAS as respostas da pessoa contra o
 * tamanho do Top 5 do cargo: na Temporada 2 de Ibipeba (Top 5 = só Comunicação),
 * as duas respostas da jornada 1 davam "2 de 1", a fase Mapeamento aparecia
 * concluída e a barra marcava 100%, enquanto o assessment, um toque adiante,
 * dizia "0 de 1".
 *
 * A régua é a do cabeçalho do assessment (`getDiagnosticoDoDia`): o total é o Top
 * 5 do cargo, com o teto da degustação, e uma competência conta quando há resposta
 * com o NOME dela (normalizado) ou com a id de uma linha dela em `competencias`.
 * O assessment casa pela id que o resolvedor escolheu (a do cenário, senão a
 * principal), e as duas são linhas da competência com aquele nome: esta conta
 * aceita qualquer uma delas, e casa igual para toda resposta gravada pelo
 * assessment, que sempre leva o nome. Não lê nota mínima nem cenários de
 * propósito: a home não serve cenário, e uma falha nessas leituras não pode
 * derrubar o progresso de quem só quer ver onde está.
 */

import { normalizeAssessmentCompetency, type AssessmentAnswerRef } from '@/lib/assessment/completion';
import { competenciasDaDegustacao } from '@/lib/demo/convidado-demo';

export interface CompetenciaContada {
  nome: string;
  /** Ids das linhas desta competência (uma por descritor) no cargo. */
  ids: string[];
}

/** Uma competência conta quando alguma resposta tem uma das ids dela ou o nome dela. */
export function progressoDoMapeamento(
  competencias: CompetenciaContada[],
  respostas: AssessmentAnswerRef[],
): { respondidas: number; total: number } {
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const r of respostas || []) {
    if (r.competencia_id) ids.add(String(r.competencia_id));
    const n = normalizeAssessmentCompetency(r.competencia_nome);
    if (n) nomes.add(n);
  }
  const total = (competencias || []).length;
  const respondidas = (competencias || []).filter((c) =>
    nomes.has(normalizeAssessmentCompetency(c.nome)) || (c.ids || []).some((id) => ids.has(id)),
  ).length;
  return { respondidas, total };
}

/**
 * O Top 5 do cargo da pessoa, com as ids de cada competência, e o teto da
 * degustação aplicado. Falha de leitura LANÇA: "não consegui ler" virando
 * "0 de 0" diria "cargo sem competências".
 */
export async function competenciasParaContagem(
  sb: any,
  colab: { empresa_id: string; cargo: string },
  degustacao: boolean,
): Promise<CompetenciaContada[]> {
  const [cargoRes, compsRes] = await Promise.all([
    sb.from('cargos_empresa')
      .select('top5_workshop')
      .eq('empresa_id', colab.empresa_id)
      .eq('nome', colab.cargo)
      .maybeSingle(),
    sb.from('competencias')
      .select('id, nome')
      .eq('empresa_id', colab.empresa_id)
      .eq('cargo', colab.cargo),
  ]);
  if (cargoRes.error) throw new Error(`Top 5 do cargo: ${cargoRes.error.message}`);
  if (compsRes.error) throw new Error(`competências do cargo: ${compsRes.error.message}`);
  const top5: string[] = Array.isArray(cargoRes.data?.top5_workshop) ? cargoRes.data.top5_workshop : [];
  const idsPorNome = new Map<string, string[]>();
  for (const c of compsRes.data || []) {
    const k = normalizeAssessmentCompetency(c.nome);
    if (!k || !c.id) continue;
    idsPorNome.set(k, [...(idsPorNome.get(k) || []), String(c.id)]);
  }
  const lista = top5.map((nome) => ({ nome, ids: idsPorNome.get(normalizeAssessmentCompetency(nome)) || [] }));
  return competenciasDaDegustacao(lista, degustacao);
}
