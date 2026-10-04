import { tenantDb } from '@/lib/tenant-db';
import { montarContextoIA3 } from '@/lib/ia3-cenarios';
import { montarDadosCenarioB, normalizarCheckCenB, VERSAO_AUDITOR_B } from '@/lib/cenarios-b';
import { celulasSemCenarioB, aReferenciaDaCelula } from '@/lib/season-engine/cenario-b';
import { ehCargoAncoraLideranca } from '@/lib/simuladores/lideranca/matriz-global';
import type { ContextoCenarioB } from '@/lib/cenarios-b-prompt';

/**
 * A fase de `ia_jobs` da geração de Cenários B. O lote em segundo plano e a geração
 * imediata do admin dividem a MESMA reserva (`reservarFaseDoLote`): rodar um enquanto o
 * outro gera pagaria a mesma IA duas vezes para as mesmas células.
 */
export const FASE_CENARIOS_B = 'cenarios-b';

/** O aviso do segundo disparo (não é erro: a geração em curso segue e vai gravar os B). */
export const AVISO_JA_GERANDO_CENARIOS_B = 'Os Cenários B desta empresa já estão sendo gerados (um lote em segundo plano ou outra geração aberta). Aguarde terminar antes de gerar de novo: o segundo disparo pagaria a mesma IA duas vezes.';

export interface ItemCenarioB {
  cenarioAId: string;
  competenciaId: string;
  cargo: string;
}

/** Uma geração por cargo/competência; B sem check continua na fila. */
export async function listarFilaCenariosB(empresaId: string) {
  const tdb = tenantDb(empresaId);
  const { data: cenarios, error } = await tdb.from('banco_cenarios')
    .select('id, competencia_id, cargo, tipo_cenario, nota_check, alternativas, ppp_escola_id, created_at').order('id');
  if (error) throw new Error(`Cenários: ${error.message}`);
  const originais = (cenarios || []).filter((c: any) => c.tipo_cenario !== 'cenario_b');
  if (!originais.length) throw new Error('Nenhum cenário A encontrado. Rode IA3 primeiro.');
  const { data: comps, error: compError } = await tdb.from('competencias').select('id, nome');
  if (compError) throw new Error(`Competências: ${compError.message}`);
  const compIds = new Set((comps || []).map((c: any) => c.id));
  const cenariosB = (cenarios || []).filter((c: any) => c.tipo_cenario === 'cenario_b');
  const nomePorId = new Map<string, string>((comps || []).map((c: any) => [c.id, c.nome]));
  const faltantes = celulasSemCenarioB(originais, cenariosB, nomePorId, { excluirCargo: ehCargoAncoraLideranca });
  const referencias = faltantes.map(c => c.referencia);
  // Cenários já gerados mas sem check retomam somente a segunda etapa.
  for (const b of cenariosB.filter((c: any) => c.nota_check == null && !ehCargoAncoraLideranca(c.cargo))) {
    const a = aReferenciaDaCelula<any>(originais.filter((c: any) => c.competencia_id === b.competencia_id && c.cargo === b.cargo));
    if (a) referencias.push(a);
  }
  const items: ItemCenarioB[] = [];
  const vistos = new Set<string>();
  for (const c of referencias) {
    const key = JSON.stringify([c.competencia_id, c.cargo]);
    if (!compIds.has(c.competencia_id) || vistos.has(key)) continue;
    vistos.add(key);
    items.push({ cenarioAId: c.id, competenciaId: c.competencia_id, cargo: c.cargo });
  }
  return items;
}

export async function prepararCenariosB(empresaId: string, items: ItemCenarioB[]) {
  const tdb = tenantDb(empresaId);
  const preparados = [];
  for (const item of items) {
    const { data: cenA, error: erroA } = await tdb.from('banco_cenarios').select('*')
      .eq('id', item.cenarioAId).eq('competencia_id', item.competenciaId).eq('cargo', item.cargo)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b').maybeSingle();
    if (erroA || !cenA) throw new Error(`Cenário A: ${erroA?.message || 'não encontrado nesta empresa'}`);
    const contexto = await montarContextoIA3(tdb.raw, empresaId, item.cargo, item.competenciaId, null);
    if ('error' in contexto) throw new Error(contexto.error);
    const { empresa, comp, descritores, valores, contextoPPP, cargoDetalhe, gabCIS } = contexto.ctx;
    const ctx: ContextoCenarioB = { empresa, comp, descritores, valores, contextoPPP, cargoDetalhe, gabCIS, cargoNome: item.cargo };
    const { data: cenB, error: erroB } = await tdb.from('banco_cenarios').select('*')
      .eq('competencia_id', item.competenciaId).eq('cargo', item.cargo).eq('tipo_cenario', 'cenario_b')
      .order('id').limit(1).maybeSingle();
    if (erroB) throw new Error(`Cenário B: ${erroB.message}`);
    preparados.push({ item, cenA, comp, cenB, ctx });
  }
  return preparados;
}

export async function salvarCenarioB(empresaId: string, cenA: any, resultado: any) {
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('banco_cenarios')
    .insert(montarDadosCenarioB(cenA, resultado)).select('*').single();
  if (error || !data) throw new Error(`Não foi possível salvar cenário B: ${error?.message || 'sem retorno'}`);
  return data;
}

export async function salvarCheckCenarioB(empresaId: string, cenarioId: string, resposta: any) {
  const check = normalizarCheckCenB(resposta);
  if (!check) throw new Error('Check não retornou nota válida');
  const { resultado, statusCheck } = check;
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('banco_cenarios').update({
    nota_check: resultado.nota, status_check: statusCheck,
    dimensoes_check: resultado.dimensoes || null,
    justificativa_check: resultado.justificativa || null,
    sugestao_check: resultado.sugestao || null,
    alertas_check: {
      alertas: resultado.alertas || [], ponto_mais_forte: resultado.ponto_mais_forte || null,
      ponto_mais_fraco: resultado.ponto_mais_fraco || null,
      problema_principal_vs_cenario_a: resultado.problema_principal_vs_cenario_a || null,
      riscos_de_triangulacao: resultado.riscos_de_triangulacao || [],
      perguntas_com_risco: resultado.perguntas_com_risco || [],
      versao_auditor: VERSAO_AUDITOR_B,
    },
    checked_at: new Date().toISOString(),
  }).eq('id', cenarioId).eq('tipo_cenario', 'cenario_b').select('id').single();
  if (error || !data) throw new Error(`Não foi possível salvar check: ${error?.message || 'cenário não encontrado nesta empresa'}`);
  return check;
}
