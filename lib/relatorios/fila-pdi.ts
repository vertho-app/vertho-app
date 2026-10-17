/**
 * Fila do PDI (relatório individual) — núcleo HEADLESS, usado pela action `gerarRelatoriosIndividuaisLote`
 * (e, por ela, pelo lote `enqueueRelatoriosBatch`) e pela prévia/orquestração do fluxo completo.
 * Movida de `actions/relatorios.ts` com a MESMA regra; a única mudança é que erro de leitura agora FALHA
 * (antes `{ data }` ignorava o `{ error }` e uma falha virava "nenhuma avaliação encontrada").
 *
 * Regras que custaram caro:
 *  - pula quem JÁ TEM relatório (o upsert sobrescreveria um PDI já entregue);
 *  - PDI COMPLETO: só entra quem concluiu TODAS as competências do top5 do cargo com avaliação da IA (antes
 *    bastava 1 resposta avaliada → PDI parcial). Cargo sem top5 configurado não tem como medir "completo" e
 *    mantém a regra antiga.
 *  - R-87 (03/10/2026): "completo" conta só as respostas do TOP 5 DO CARGO. Antes contava qualquer resposta
 *    avaliada, e as do trilho de LIDERANÇA (outra matriz, gravada sob o cargo da variante) completavam a conta:
 *    PDI do cargo gerado com o mapeamento do cargo incompleto. A competência casa pelo id (de uma competência do
 *    MESMO cargo) ou, para resposta antiga cujo id saiu do catálogo, pelo nome (a régua de `completion.ts`).
 *  - R-59 (03/10/2026): a avaliação que nunca passou pela 2ª IA (`status_ia4` vazio) SEGURA o PDI. A promessa é
 *    "uma IA avalia e outra audita"; um PDI escrito sobre nota não auditada a quebraria. O caminho para destravar
 *    existe e é o mesmo botão: rodar o check da IA4. Quem fica esperando é CONTADO (`aguardandoCheck`), nunca
 *    some em silêncio. O veredito `revisar` não segura (decisão em aberto, ver o relatório do lote 8).
 */
import { lerTudoPaginado } from '@/lib/paginacao';
import { normalizeAssessmentCompetency } from '@/lib/assessment/completion';
import { focoIndividual } from '@/lib/foco-cargo';
import { artefatoValeNaJornada, carregarJornadasAtuais } from '@/lib/turmas/jornada-atual';
import { instanteDaResposta } from '@/lib/turmas/janela';

export type FilaPdi =
  | { error: string }
  | {
    /** Ninguém tem resposta avaliada (a action responde "Nenhuma avaliação encontrada"). */
    semAvaliacao: boolean;
    /** Elegíveis: avaliação completa, auditada pela 2ª IA e SEM relatório. */
    pendentes: string[];
    /** Sem relatório mas com avaliação incompleta (ignorados). */
    incompletos: number;
    /** Sem relatório, avaliação completa, mas alguma resposta ainda sem o check da 2ª IA (seguram o PDI). */
    aguardandoCheck: number;
    /** Já têm relatório individual. */
    jaGerados: string[];
  };

const mesmoCargo = (a: unknown, b: unknown) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export async function buscarFilaPdi(tdb: any): Promise<FilaPdi> {
  // Paginado: a fila decide por AUSÊNCIA ("falta resposta") e o PostgREST corta em 1.000 linhas calado.
  const respQ = await lerTudoPaginado((de, ate) => tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome, status_ia4, timestamp_resposta, created_at')
    .not('avaliacao_ia', 'is', null)
    .order('id')
    .range(de, ate));
  if (respQ.error) return { error: `respostas: ${respQ.error}` };

  // Resposta e PDI contam só na JORNADA ATUAL da pessoa (17/10/2026): na Temporada 2 de Ibipeba, o PDI da
  // Temporada 1 fazia a pessoa "já ter PDI". Sem participação com marco, a conta de sempre.
  let jornadas;
  try { jornadas = await carregarJornadasAtuais(tdb); } catch (e: any) { return { error: String(e?.message || e) }; }
  const respostas = respQ.data.filter((r: any) => artefatoValeNaJornada(jornadas, r.colaborador_id, instanteDaResposta(r)));

  const colabIds = [...new Set((respostas || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
  if (!colabIds.length) return { semAvaliacao: true, pendentes: [], incompletos: 0, aguardandoCheck: 0, jaGerados: [] };

  const { data: existentes, error: errRel } = await tdb.from('relatorios')
    .select('colaborador_id, gerado_em')
    .eq('tipo', 'individual');
  if (errRel) return { error: `relatorios: ${errRel.message}` };
  const jaGerados = new Set((existentes || [])
    .filter((r: any) => artefatoValeNaJornada(jornadas, r.colaborador_id, r.gerado_em))
    .map((r: any) => r.colaborador_id));

  const { data: colabs, error: errColab } = await tdb.from('colaboradores').select('id, cargo, foco_individual').in('id', colabIds);
  if (errColab) return { error: `colaboradores: ${errColab.message}` };
  const { data: cargosEmp, error: errCargos } = await tdb.from('cargos_empresa').select('nome, top5_workshop');
  if (errCargos) return { error: `cargos_empresa: ${errCargos.message}` };
  const compsQ = await lerTudoPaginado((de, ate) => tdb.from('competencias')
    .select('id, nome, cargo')
    .order('id')
    .range(de, ate));
  if (compsQ.error) return { error: `competencias: ${compsQ.error}` };
  const compPorId = new Map<string, any>(compsQ.data.map((c: any) => [c.id, c]));

  const top5DoCargo = (cargo: unknown): string[] =>
    ((cargosEmp || []).find((c: any) => mesmoCargo(c.nome, cargo))?.top5_workshop || []) as string[];
  const respostasPorColab = new Map<string, any[]>();
  for (const r of respostas || []) {
    if (!r.colaborador_id) continue;
    const l = respostasPorColab.get(r.colaborador_id) || [];
    l.push(r);
    respostasPorColab.set(r.colaborador_id, l);
  }

  /** A resposta avaliada desta competência do Top 5, do cargo da pessoa (nunca a do trilho de liderança). */
  const respostaDoTop5 = (doColab: any[], cargo: unknown, nome: string) => {
    const alvo = normalizeAssessmentCompetency(nome);
    return doColab.find((r: any) => {
      const comp = compPorId.get(r.competencia_id);
      if (comp) return mesmoCargo(comp.cargo, cargo) && normalizeAssessmentCompetency(comp.nome) === alvo;
      return normalizeAssessmentCompetency(r.competencia_nome) === alvo;
    });
  };

  const pendentes: string[] = [];
  let incompletos = 0;
  let aguardandoCheck = 0;
  for (const c of (colabs || []) as any[]) {
    if (jaGerados.has(c.id)) continue;
    const doColab = respostasPorColab.get(c.id) || [];
    const top5 = top5DoCargo(c.cargo);
    // Cargo sem Top 5: a regra antiga (basta ter avaliação), e todas elas contam para o check.
    const doTop5 = top5.length
      ? top5.map((nome) => respostaDoTop5(doColab, c.cargo, nome))
      : doColab;
    // Quem tem competência PRÓPRIA (mig 287) entra com o que respondeu (decisão do dono, 15/10/2026): contam as
    // competências do Top 5 que a pessoa TEM avaliadas, e basta uma. O prompt confere que nada respondido ficou sem
    // avaliação; a competência própria só é gravada depois disso (`prontidaoParaFoco`).
    const contam = focoIndividual(c).length ? doTop5.filter(Boolean) : doTop5;
    if (!contam.length || contam.some((r) => !r)) { incompletos++; continue; }
    if (contam.some((r: any) => !r.status_ia4)) { aguardandoCheck++; continue; }
    pendentes.push(c.id);
  }

  return {
    semAvaliacao: false,
    // A ordem da fila segue a das respostas (estável entre execuções).
    pendentes: colabIds.filter((id) => pendentes.includes(id)),
    incompletos,
    aguardandoCheck,
    jaGerados: [...jaGerados] as string[],
  };
}
