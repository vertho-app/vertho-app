/**
 * Coleta do estado de uma empresa para a PRÉVIA do fluxo completo — SOMENTE LEITURA, sem sessão (núcleo headless).
 *
 * Reaproveita as filas de produção onde elas existem em `lib/` (`buscarFilaIA4`) e lê o resto das mesmas tabelas
 * que as filas reais leem. PAGINA tudo: o PostgREST corta em 1.000 linhas e um corte silencioso aqui viraria
 * "ninguém respondeu" (a base já tem o aviso: não concluir ausência sem paginar). Todo `{ error }` volta ao chamador.
 */
import { filaKitEscopo } from './kit';
import { buscarFilaIA4 } from '@/lib/ia4-fila';
import { focoDoCargo } from '@/lib/foco-cargo';
import { excludeInternalEmails } from '@/lib/internal-emails';
import type { EntradaPrevia } from './previa';
import { lerTudoPaginado } from '@/lib/paginacao';

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
    tdb.from('colaboradores').select('id, nome_completo, cargo, gestor_email, email'),
  ).order('id').range(de, ate));
  if (pessoasQ.error) return { error: `colaboradores: ${pessoasQ.error}` };
  if (escopo.incluirInternos?.length) {
    const ja = new Set<string>(pessoasQ.data.map((p: any) => p.id));
    const extra = await lerTudoPaginado((de, ate) => tdb.from('colaboradores')
      .select('id, nome_completo, cargo, gestor_email, email').in('id', escopo.incluirInternos).order('id').range(de, ate));
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
    .select('colaborador_id, competencia_nome, avaliacao_ia').not('r1', 'is', null).order('id').range(de, ate));
  if (respostasQ.error) return { error: `respostas: ${respostasQ.error}` };

  const assessQ = await lerTudoPaginado((de, ate) => tdb.from('descriptor_assessments')
    .select('colaborador_id, competencia').order('id').range(de, ate));
  if (assessQ.error) return { error: `descriptor_assessments: ${assessQ.error}` };

  const bpQ = await lerTudoPaginado((de, ate) => tdb.from('development_blueprints')
    .select('colaborador_id, auditado_em').order('id').range(de, ate));
  if (bpQ.error) return { error: `development_blueprints: ${bpQ.error}` };

  const pdiQ = await lerTudoPaginado((de, ate) => tdb.from('relatorios')
    .select('colaborador_id').eq('tipo', 'individual').order('id').range(de, ate));
  if (pdiQ.error) return { error: `relatorios: ${pdiQ.error}` };

  const trilhaQ = await lerTudoPaginado((de, ate) => tdb.from('trilhas')
    .select('colaborador_id').order('id').range(de, ate));
  if (trilhaQ.error) return { error: `trilhas: ${trilhaQ.error}` };

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
      pessoas: pessoasBrutas.map((p: any) => ({ id: p.id, nome: p.nome_completo || p.email || p.id, cargo: p.cargo ?? null, gestorEmail: p.gestor_email ?? null })),
      cargos: cargosQ.data.map((c: any) => ({ nome: c.nome, foco: focoDoCargo(c), top5: (c.top5_workshop || []).length })),
      respostas: dosEscopo(respostasQ.data as any[]).map((r: any) => ({ colaborador_id: r.colaborador_id, competencia_nome: r.competencia_nome ?? null, avaliada: r.avaliacao_ia != null })),
      filaIA4: dosEscopo((fila.data || []) as any[]).map((r: any) => ({ colaborador_id: r.colaborador_id })),
      assessments: dosEscopo(assessQ.data as any[]).map((a: any) => ({ colaborador_id: a.colaborador_id, competencia: a.competencia })),
      blueprints: dosEscopo(bpQ.data as any[]).map((b: any) => ({ colaborador_id: b.colaborador_id, auditado: b.auditado_em != null })),
      pdis: dosEscopo(pdiQ.data as any[]).map((r: any) => r.colaborador_id),
      trilhas: dosEscopo(trilhaQ.data as any[]).map((r: any) => r.colaborador_id),
      empresaInteira: !escopo.permitidos && filtroCargo.size === 0,
      ...(kitPlano ? { kitPlano } : {}),
    },
  };
}
