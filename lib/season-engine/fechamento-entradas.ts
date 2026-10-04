/**
 * Entradas do scorer por competência no fechamento do Onboarding: a parte que LÊ O
 * BANCO (as evidências das semanas), separada de `fechamento-por-competencia.ts` de
 * propósito. Aquele módulo é puro e a tela do fechamento (componente de cliente) o
 * importa; este puxa a leitura de evidências, que não pode ir para o bundle do browser.
 */
import { agregarEvidenciasAteAcumulada } from './evidencias-fechamento';
import {
  acumuladoDaCompetencia, descritoresDoFechamento, descritoresHomonimos, descritoresPorCompetencia, respostaDoCenario,
  type CenarioDoFechamento, type EntradaPorCompetencia, type LinhaDoMapeamento,
} from './fechamento-por-competencia';

export type EntradasPorCompetencia =
  | { ok: true; entradas: EntradaPorCompetencia[]; evidencias: string; homonimos: string[] }
  | { ok: false; erro: string };

/**
 * O que o scorer de cada competência recebe, e as evidências do conjunto (as que o
 * auditor e a redação final leem). Fonte única do fechamento da pessoa
 * (`finalizarFechamentoCore`) e da regeração do admin (`regerarScoringComFeedback`).
 *
 * `descritoresComRegua` já traz a régua (n1..n4) e a nota de partida fresca de TODAS
 * as competências (o enriquecimento já agrupa pela competência de cada descritor);
 * aqui só se separa por competência. As evidências das semanas são lidas por
 * competência (cada scorer vê as dos seus descritores), e `mascarar` /
 * `mascararProfundo` são a PII do chamador: tudo que sai daqui vai mascarado.
 */
export async function montarEntradasPorCompetencia(a: {
  db: any;
  trilhaId: string;
  cenarios: CenarioDoFechamento[];
  descritoresComRegua: any[];
  acumuladoPrimaria: unknown;
  semanaAcumulada: number;
  mascarar: (texto: string) => string;
  mascararProfundo: (valor: unknown) => unknown;
  degradacao?: { empresaId?: string | null; colaboradorId?: string | null };
}): Promise<EntradasPorCompetencia> {
  const { grupos, semCenario } = descritoresPorCompetencia(a.descritoresComRegua, a.cenarios.map((c) => c.competencia));
  if (semCenario.length) {
    const nomes = semCenario.map((d) => `${d?.descritor ?? '?'} (${d?.competencia ?? 'sem competência'})`).join('; ');
    return { ok: false, erro: `descritores da trilha sem cenário no fechamento: ${nomes}` };
  }
  const acumuladoMascarado: any = a.mascararProfundo(a.acumuladoPrimaria);

  const entradas: EntradaPorCompetencia[] = [];
  const evidencias: string[] = [];
  for (const [i, g] of grupos.entries()) {
    const c = a.cenarios[i];
    const doGrupo = await agregarEvidenciasAteAcumulada(a.db, a.trilhaId, g.descritores, a.semanaAcumulada, a.degradacao);
    const mascaradas = a.mascarar(doGrupo);
    if (mascaradas) evidencias.push(mascaradas);
    entradas.push({
      competencia: c.competencia,
      descritores: g.descritores,
      cenario: c.cenario,
      resposta: a.mascarar(respostaDoCenario(c)),
      evidenciasAcumuladas: mascaradas,
      acumuladoPrimaria: acumuladoDaCompetencia(acumuladoMascarado, g.descritores, c.competencia),
    });
  }
  return { ok: true, entradas, evidencias: evidencias.join('\n\n'), homonimos: descritoresHomonimos(grupos) };
}

export type DescritoresDoFechamento =
  | { ok: true; descritores: any[]; semMapeamento: string[] }
  | { ok: false; erro: string };

/**
 * Os descritores que o fechamento do Onboarding pontua: os da trilha MAIS os que o
 * Cenário A avaliou na mesma competência (`descriptor_assessments`), o conjunto inteiro de
 * cada competência (ver `descritoresDoFechamento`). Fonte única do fechamento da pessoa, da
 * regeração do admin e do Evolution Report: os três precisam iterar o MESMO conjunto, ou a
 * média mostrada deixa de bater com a do relatório.
 *
 * Falha de leitura RETORNA erro (não vira "só os da trilha" calado: a nota de dois
 * descritores por competência sumiria do relatório sem nada acusar). `empresaId` é o filtro
 * explícito para quem lê com o client raw; com `tenantDb` já vem escopado.
 */
export async function descritoresCompletosDoOnboarding(a: {
  db: any;
  colaboradorId: string;
  empresaId?: string | null;
  selecionados: any[];
  competencias: string[];
}): Promise<DescritoresDoFechamento> {
  let q = a.db.from('descriptor_assessments').select('competencia, descritor, nota').eq('colaborador_id', a.colaboradorId);
  if (a.empresaId) q = q.eq('empresa_id', a.empresaId);
  const { data, error } = await q;
  if (error) return { ok: false, erro: `falha ao ler as avaliações do mapeamento (Cenário A): ${error.message}` };
  const { descritores, semMapeamento } = descritoresDoFechamento(a.selecionados, (data || []) as LinhaDoMapeamento[], a.competencias);
  return { ok: true, descritores, semMapeamento };
}
