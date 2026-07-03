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
 */

const CAMPOS_REGUA = 'nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia';

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
}

export async function enriquecerComRegua({ db, sbGlobal, empresaId = null, competencia, descritores }: EnriquecerArgs): Promise<any[]> {
  // Agrupa por competência do descritor (multi-comp) — régua correta por grupo
  const grupos = new Map<string, any[]>();
  for (const d of descritores) {
    const comp = d.competencia || competencia;
    if (!grupos.has(comp)) grupos.set(comp, []);
    grupos.get(comp)!.push(d);
  }

  const porDescritor = new Map<string, any>();
  for (const [comp, descs] of grupos.entries()) {
    const nomesCurtos = descs.map((d: any) => d.descritor);
    let q = db.from('competencias').select(CAMPOS_REGUA).eq('nome', comp).in('nome_curto', nomesCurtos);
    if (empresaId) q = q.eq('empresa_id', empresaId);
    let { data: rows } = await q;
    if (!rows || rows.length === 0) {
      const { data: base } = await sbGlobal.from('competencias_base')
        .select(CAMPOS_REGUA).eq('nome', comp).in('nome_curto', nomesCurtos);
      rows = base || [];
    }
    for (const r of rows || []) porDescritor.set(`${comp}|${r.nome_curto}`, r);
  }

  return descritores.map((d: any) => ({
    ...d,
    ...(porDescritor.get(`${d.competencia || competencia}|${d.descritor}`) || {}),
  }));
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
