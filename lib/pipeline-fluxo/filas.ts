/**
 * FILAS REAIS do fluxo completo, com ESCOPO — o que o executor lê a cada etapa (a prévia é estimativa; isto é a
 * verdade de produção). Reaproveita as filas que os botões atuais usam (`buscarFilaIA4`, `resolverFilaBlueprint100` +
 * `separarPorBlueprintExistente`, `buscarFilaPdi`) e só acrescenta o filtro de escopo (turma/cargos), que o blueprint e
 * o PDI NÃO têm nos botões de hoje (rodam na empresa inteira). Todo `{ error }` vira exceção: uma fila que falha ao ler
 * NÃO pode virar fila vazia (a etapa "pularia" em silêncio).
 */
import { buscarFilaIA4 } from '@/lib/ia4-fila';
import { buscarFilaPdi } from '@/lib/relatorios/fila-pdi';
import { resolverFilaBlueprint100, separarPorBlueprintExistente } from '@/lib/blueprint/core';
import { coletarEntradaPrevia, lerTudoPaginado } from './coletar';
import { idsTrilhaProntos } from './previa';
export { filaKitEscopo } from './kit';

export type Permitidos = Set<string> | null;
const dentro = (permitidos: Permitidos, id: string | null | undefined) => !!id && (!permitidos || permitidos.has(id));

export async function filaIA4Escopo(tdb: any, permitidos: Permitidos): Promise<{ itens: string[]; checkOnly: string[] }> {
  const fila = await buscarFilaIA4(tdb);
  if (fila.error) throw new Error(`fila da IA4: ${fila.error}`);
  const itens = (fila.data || []).filter((r: any) => dentro(permitidos, r.colaborador_id)).map((r: any) => r.id as string);

  // Avaliações que JÁ existem e nunca passaram pela 2ª IA (um lote interrompido deixa isso para trás — 11/08: 58 de 72).
  const q = await lerTudoPaginado((de, ate) => tdb.from('respostas')
    .select('id, colaborador_id').not('avaliacao_ia', 'is', null).is('status_ia4', null).order('id').range(de, ate));
  if (q.error) throw new Error(`respostas sem check: ${q.error}`);
  const jaNaFila = new Set(itens);
  const checkOnly = q.data.filter((r: any) => dentro(permitidos, r.colaborador_id) && !jaNaFila.has(r.id)).map((r: any) => r.id as string);
  return { itens, checkOnly };
}

/** Pessoas com TODAS as competências foco mapeadas e SEM blueprint (o upsert sobrescreveria um blueprint já entregue). */
export async function filaBlueprintEscopo(tdb: any, permitidos: Permitidos): Promise<string[]> {
  const fila = await resolverFilaBlueprint100(tdb);
  const { pendentes } = await separarPorBlueprintExistente(tdb, fila);
  return pendentes.filter((f: any) => dentro(permitidos, f.id)).map((f: any) => f.id as string);
}

export async function filaPdiEscopo(tdb: any, permitidos: Permitidos): Promise<string[]> {
  const f = await buscarFilaPdi(tdb);
  if ('error' in f) throw new Error(`fila do PDI: ${f.error}`);
  return f.pendentes.filter((id) => dentro(permitidos, id));
}

export async function filaTrilhaEscopo(tdb: any, permitidos: Permitidos): Promise<string[]> {
  const c = await coletarEntradaPrevia(tdb, { permitidos });
  if (c.error || !c.entrada) throw new Error(`fila da trilha: ${c.error || 'sem dados'}`);
  return idsTrilhaProntos(c.entrada);
}

/** Entre `alvo`, quem JÁ TEM blueprint e ainda não foi auditado. */
export async function filaAuditoriaEscopo(tdb: any, alvo: string[]): Promise<string[]> {
  if (!alvo.length) return [];
  const out: string[] = [];
  for (let i = 0; i < alvo.length; i += 150) {
    const fatia = alvo.slice(i, i + 150);
    const { data, error } = await tdb.from('development_blueprints').select('colaborador_id, auditado_em').in('colaborador_id', fatia);
    if (error) throw new Error(`blueprints a auditar: ${error.message}`);
    for (const b of data || []) if (b.auditado_em == null) out.push(b.colaborador_id);
  }
  return out;
}
