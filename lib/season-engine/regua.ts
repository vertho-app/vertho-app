/**
 * Régua de maturidade — FONTE ÚNICA do enriquecimento de descritores.
 *
 * Antes existiam 3 implementações paralelas da mesma regra (rota /evaluation,
 * action avaliacao-acumulada e a variante "…ENotaPre"), com filtros
 * divergentes — a mesma régua tinha duas fontes de verdade.
 *
 * Regra preservada: busca n1..n4 em `competencias` (da empresa — via tdb OU
 * filtro explícito) com fallback pro catálogo GLOBAL `competencias_base`
 * (sempre via client raw — a tabela não tem empresa_id). Multi-competência
 * (DUO/onboarding): agrupa por `d.competencia` e resolve a régua certa por
 * grupo.
 *
 * Desde 16/09/2026 a linha de cada descritor é ESCOLHIDA, não sorteada
 * (`escolherLinhaDaRegua`, lib/matriz-por-cargo): o mesmo nome de competência e
 * de descritor existe em cargos diferentes com réguas diferentes, e "a última
 * linha lida vence" dava à coordenadora de Ibipeba a régua de Gestão Escolar. E o
 * descritor é casado pela chave normalizada: o plano pode guardá-lo com código
 * (`COO03_D1 — Consciência de limites`), que não casava com `nome_curto` nenhum.
 */

import { chaveDescritor } from '@/lib/descritores';
import { escolherLinhaDaRegua } from '@/lib/matriz-por-cargo';
import { registrarDegradacao, DEGRADACAO, type DegradacaoFluxo } from '@/lib/degradacao';

const CAMPOS_REGUA = 'cod_desc, cargo, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia';

interface EnriquecerArgs {
  /** Client pra `competencias` (tenant-owned): tdb OU raw + empresaId. */
  db: any;
  /** Client RAW pra `competencias_base` (catálogo GLOBAL, sem empresa_id). */
  sbGlobal: any;
  /** Filtro explícito quando `db` é raw; null quando `db` já é tenant-scoped. */
  empresaId?: string | null;
  /** Competência default pra descritores sem `.competencia` própria. */
  competencia: string;
  descritores: any[];
  /** Cargo do colaborador: escolhe entre descritores homônimos de cargos diferentes. */
  cargo?: string | null;
  /** Onde registrar descritor sem régua (a avaliação segue com escala genérica). */
  degradacao?: { fluxo: DegradacaoFluxo; chave: string; empresaId?: string | null; colaboradorId?: string | null };
}

export async function enriquecerComRegua({ db, sbGlobal, empresaId = null, competencia, descritores, cargo = null, degradacao }: EnriquecerArgs): Promise<any[]> {
  // Agrupa por competência do descritor (multi-comp) — régua correta por grupo
  const grupos = new Map<string, any[]>();
  for (const d of descritores) {
    const comp = d.competencia || competencia;
    if (!grupos.has(comp)) grupos.set(comp, []);
    grupos.get(comp)!.push(d);
  }

  const reguaDe = new Map<any, any>();
  const ausentes: Array<{ competencia: string; descritor: string; motivo: string }> = [];
  /** Casa os descritores do grupo contra `linhas`; devolve quantos acharam régua. */
  const casar = (descs: any[], linhas: any[], faltas: typeof ausentes, comp: string): number => {
    const porChave = new Map<string, any[]>();
    for (const r of linhas) {
      const k = chaveDescritor(r.nome_curto || '');
      const lista = porChave.get(k);
      if (lista) lista.push(r); else porChave.set(k, [r]);
    }
    let achados = 0;
    for (const d of descs) {
      const { linha, motivo } = escolherLinhaDaRegua(porChave.get(chaveDescritor(d.descritor || '')) || [], { cargo, descritor: d.descritor });
      if (linha) { reguaDe.set(d, linha); achados++; }
      else faltas.push({ competencia: comp, descritor: String(d.descritor || ''), motivo: motivo || 'sem-linha' });
    }
    return achados;
  };

  for (const [comp, descs] of grupos.entries()) {
    let q = db.from('competencias').select(CAMPOS_REGUA).eq('nome', comp).not('cod_desc', 'is', null);
    if (empresaId) q = q.eq('empresa_id', empresaId);
    const { data: rows, error } = await q;
    // Falha alto: régua vazia por erro de leitura viraria nota contra escala genérica.
    if (error) throw new Error(`Régua de "${comp}": ${error.message}`);

    const faltasEmpresa: typeof ausentes = [];
    if (casar(descs, rows || [], faltasEmpresa, comp) > 0) { ausentes.push(...faltasEmpresa); continue; }

    // Nenhum descritor casou na empresa → catálogo global (regra de antes).
    const { data: base, error: errBase } = await sbGlobal.from('competencias_base')
      .select(CAMPOS_REGUA).eq('nome', comp).not('cod_desc', 'is', null);
    if (errBase) throw new Error(`Régua de "${comp}" (catálogo global): ${errBase.message}`);
    const faltasBase: typeof ausentes = [];
    casar(descs, base || [], faltasBase, comp);
    // Sem régua em lugar nenhum, o motivo da EMPRESA é o que ajuda a consertar.
    ausentes.push(...(base?.length ? faltasBase : faltasEmpresa));
  }

  if (ausentes.length && degradacao) {
    await registrarDegradacao({
      fluxo: degradacao.fluxo,
      tipo: DEGRADACAO.REGUA_AUSENTE,
      chave: degradacao.chave,
      empresaId: degradacao.empresaId ?? null,
      colaboradorId: degradacao.colaboradorId ?? null,
      severidade: 'aviso',
      detalhe: { cargo, ausentes: ausentes.slice(0, 20) },
    });
  }

  // Mesmas chaves de antes sobre o descritor (nome_curto + n1..n4): o objeto segue
  // para prompt e para o slot gravado, e `cargo`/`cod_desc` não entravam nele.
  return descritores.map((d: any) => {
    const r = reguaDe.get(d);
    if (!r) return { ...d };
    return {
      ...d,
      nome_curto: r.nome_curto,
      n1_gap: r.n1_gap,
      n2_desenvolvimento: r.n2_desenvolvimento,
      n3_meta: r.n3_meta,
      n4_referencia: r.n4_referencia,
    };
  });
}

/**
 * Sobrepõe `nota_atual` com a nota FRESH de `descriptor_assessments` (caso de
 * remapeamento posterior à criação da trilha). Sem registro fresh → mantém o
 * snapshot. Multi-comp: consulta por grupo (a chave do assessment é
 * colaborador × competência × descritor).
 */
export async function sobreporNotaFresh(
  db: any,
  colaboradorId: string,
  competencia: string,
  descritores: any[],
): Promise<any[]> {
  const grupos = new Map<string, string[]>();
  for (const d of descritores) {
    const comp = d.competencia || competencia;
    if (!grupos.has(comp)) grupos.set(comp, []);
    grupos.get(comp)!.push(d.descritor);
  }

  const mapaNota = new Map<string, number>();
  for (const [comp, nomes] of grupos.entries()) {
    const { data } = await db.from('descriptor_assessments')
      .select('descritor, nota')
      .eq('colaborador_id', colaboradorId)
      .eq('competencia', comp)
      .in('descritor', nomes);
    for (const a of data || []) mapaNota.set(`${comp}|${a.descritor}`, Number(a.nota));
  }

  return descritores.map((d: any) => {
    const chave = `${d.competencia || competencia}|${d.descritor}`;
    return { ...d, nota_atual: mapaNota.has(chave) ? mapaNota.get(chave) : d.nota_atual };
  });
}
