/**
 * Coleta do estado de uma empresa para a PRÉVIA do fluxo completo — SOMENTE LEITURA, sem sessão (núcleo headless).
 *
 * Reaproveita as filas de produção onde elas existem em `lib/` (`buscarFilaIA4`) e lê o resto das mesmas tabelas
 * que as filas reais leem. PAGINA tudo: o PostgREST corta em 1.000 linhas e um corte silencioso aqui viraria
 * "ninguém respondeu" (a base já tem o aviso: não concluir ausência sem paginar). Todo `{ error }` volta ao chamador.
 */
import { filaKitEscopo } from './kit';
import { buscarFilaIA4 } from '@/lib/ia4-fila';
import { focoDoCargo, focoIndividual } from '@/lib/foco-cargo';
import { excludeInternalEmails } from '@/lib/internal-emails';
import type { EntradaPrevia } from './previa';
import { lerTudoPaginado } from '@/lib/paginacao';
import { artefatoValeNaJornada, carregarJornadasAtuais, trilhaValeNaJornada } from '@/lib/turmas/jornada-atual';
import { instanteDaResposta } from '@/lib/turmas/janela';

// A leitura paginada mora em `lib/paginacao.ts` (fonte única); reexportada porque
// `actions/pipeline-fluxo.ts`, `filas.ts` e o teste a importam deste módulo.
export { lerTudoPaginado };

export type EscopoColeta = {
  /** `null` = sem restrição de turma (empresa com <= 1 turma ativa ou "empresa inteira" justificada). */
  permitidos: Set<string> | null;
  /** Restringe a estes cargos (nomes exatos); vazio/ausente = todos. */
  cargos?: string[];
  /**
   * EXCEÇÃO explícita para contas internas da Vertho (`@vertho.ai`), que o fluxo exclui por padrão. Só entra o id que
   * está nesta lista, e só quando quem monta o pedido a passa (script/servidor): a action exposta ao cliente NÃO a aceita.
   * Existe para testar o fluxo ponta a ponta com uma conta da própria equipe num tenant real.
   */
  incluirInternos?: string[];
  /** Com isto a prévia também mede os kits faltantes (precisa do client RAW: enxerga kits globais). */
  kit?: { sb: any; empresaId: string; turmaId?: string | null; semanaMax?: number | null };
};

export async function coletarEntradaPrevia(tdb: any, escopo: EscopoColeta): Promise<{ entrada?: EntradaPrevia; error?: string }> {
  // Pessoas (sem contas internas da Vertho — as personas de demo continuam, como nos relatórios).
  const pessoasQ = await lerTudoPaginado((de, ate) => excludeInternalEmails(
    tdb.from('colaboradores').select('id, nome_completo, cargo, gestor_email, email, foco_individual'),
  ).order('id').range(de, ate));
  if (pessoasQ.error) return { error: `colaboradores: ${pessoasQ.error}` };
  if (escopo.incluirInternos?.length) {
    const ja = new Set<string>(pessoasQ.data.map((p: any) => p.id));
    const extra = await lerTudoPaginado((de, ate) => tdb.from('colaboradores')
      .select('id, nome_completo, cargo, gestor_email, email, foco_individual').in('id', escopo.incluirInternos).order('id').range(de, ate));
    if (extra.error) return { error: `colaboradores (exceção de contas internas): ${extra.error}` };
    for (const p of extra.data) if (!ja.has(p.id)) pessoasQ.data.push(p);
  }
  const filtroCargo = new Set((escopo.cargos || []).filter(Boolean));
  const pessoasBrutas = pessoasQ.data
    .filter((p: any) => !escopo.permitidos || escopo.permitidos.has(p.id))
    .filter((p: any) => filtroCargo.size === 0 || filtroCargo.has(p.cargo));
  const ids = new Set<string>(pessoasBrutas.map((p: any) => p.id));

  const cargosQ = await lerTudoPaginado((de, ate) => tdb.from('cargos_empresa')
    .select('nome, competencia_foco, competencias_foco, top5_workshop').order('id').range(de, ate));
  if (cargosQ.error) return { error: `cargos_empresa: ${cargosQ.error}` };

  const respostasQ = await lerTudoPaginado((de, ate) => tdb.from('respostas')
    .select('colaborador_id, competencia_nome, avaliacao_ia, status_ia4, timestamp_resposta, created_at').not('r1', 'is', null).order('id').range(de, ate));
  if (respostasQ.error) return { error: `respostas: ${respostasQ.error}` };

  const assessQ = await lerTudoPaginado((de, ate) => tdb.from('descriptor_assessments')
    .select('colaborador_id, competencia, assessment_date').order('id').range(de, ate));
  if (assessQ.error) return { error: `descriptor_assessments: ${assessQ.error}` };

  const bpQ = await lerTudoPaginado((de, ate) => tdb.from('development_blueprints')
    .select('colaborador_id, auditado_em, gerado_em').order('id').range(de, ate));
  if (bpQ.error) return { error: `development_blueprints: ${bpQ.error}` };

  const pdiQ = await lerTudoPaginado((de, ate) => tdb.from('relatorios')
    .select('colaborador_id, gerado_em').eq('tipo', 'individual').order('id').range(de, ate));
  if (pdiQ.error) return { error: `relatorios: ${pdiQ.error}` };

  const trilhaQ = await lerTudoPaginado((de, ate) => tdb.from('trilhas')
    .select('colaborador_id, criado_em, turma_membro_id').order('id').range(de, ate));
  if (trilhaQ.error) return { error: `trilhas: ${trilhaQ.error}` };

  // Resposta, nota por descritor, blueprint, PDI e trilha contam só na JORNADA ATUAL da pessoa (17/10/2026): sem isto,
  // a Temporada 2 de Ibipeba via o que a pessoa fez na Temporada 1 como "já tem" e pulava blueprint, PDI e trilha de 25
  // pessoas; e as notas antigas davam o foco antigo por "mapeado". Sem marco, nada muda.
  let jornadas;
  try { jornadas = await carregarJornadasAtuais(tdb); } catch (e: any) { return { error: String(e?.message || e) }; }
  const daJornada = <T extends { colaborador_id?: string | null }>(rows: T[], quando: (r: T) => string | null | undefined) =>
    rows.filter((r) => artefatoValeNaJornada(jornadas, r.colaborador_id, quando(r)));
  const respostasDaJornada = daJornada(respostasQ.data as any[], (r: any) => instanteDaResposta(r));
  const assessmentsDaJornada = daJornada(assessQ.data as any[], (a: any) => a.assessment_date);
  const blueprintsDaJornada = daJornada(bpQ.data as any[], (b: any) => b.gerado_em);
  const pdisDaJornada = daJornada(pdiQ.data as any[], (r: any) => r.gerado_em);
  const trilhasDaJornada = (trilhaQ.data as any[]).filter((t: any) => trilhaValeNaJornada(jornadas, t));

  // A fila REAL da IA4 (pendentes + presas) — a mesma que o botão da IA4 usa.
  const fila = await buscarFilaIA4(tdb);
  if (fila.error) return { error: `fila da IA4: ${fila.error}` };

  const dosEscopo = <T extends { colaborador_id?: string | null }>(rows: T[]) => rows.filter((r) => r.colaborador_id && ids.has(r.colaborador_id));

  let kitPlano: { kits: number; podcasts: number; videos: number } | undefined;
  if (escopo.kit) {
    try {
      const itens = await filaKitEscopo(escopo.kit.sb, escopo.kit.empresaId, { turmaId: escopo.kit.turmaId, cargos: escopo.cargos, semanaMax: escopo.kit.semanaMax });
      const soma = (f: (i: (typeof itens)[number]) => boolean) => itens.filter(f).reduce((n, i) => n + i.faltantes.length, 0);
      kitPlano = { kits: soma(() => true), podcasts: soma((i) => i.formatos.includes('audio')), videos: soma((i) => i.video) };
    } catch (e: any) { return { error: String(e?.message || e) }; }
  }

  return {
    entrada: {
      pessoas: pessoasBrutas.map((p: any) => ({ id: p.id, nome: p.nome_completo || p.email || p.id, cargo: p.cargo ?? null, gestorEmail: p.gestor_email ?? null, focoIndividual: focoIndividual(p) })),
      cargos: cargosQ.data.map((c: any) => ({ nome: c.nome, foco: focoDoCargo(c), top5: (c.top5_workshop || []).length })),
      respostas: dosEscopo(respostasDaJornada).map((r: any) => ({ colaborador_id: r.colaborador_id, competencia_nome: r.competencia_nome ?? null, avaliada: r.avaliacao_ia != null, checada: r.status_ia4 != null })),
      filaIA4: dosEscopo((fila.data || []) as any[]).map((r: any) => ({ colaborador_id: r.colaborador_id })),
      assessments: dosEscopo(assessmentsDaJornada).map((a: any) => ({ colaborador_id: a.colaborador_id, competencia: a.competencia })),
      blueprints: dosEscopo(blueprintsDaJornada).map((b: any) => ({ colaborador_id: b.colaborador_id, auditado: b.auditado_em != null })),
      pdis: dosEscopo(pdisDaJornada).map((r: any) => r.colaborador_id),
      trilhas: dosEscopo(trilhasDaJornada).map((r: any) => r.colaborador_id),
      empresaInteira: !escopo.permitidos && filtroCargo.size === 0,
      ...(kitPlano ? { kitPlano } : {}),
    },
  };
}
