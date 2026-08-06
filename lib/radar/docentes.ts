/**
 * Corpo docente do Censo Escolar — tipos e agregação (sem dependência de banco).
 *
 * Fonte: `diag_censo_docentes` (migration 080) e a MV `diag_mv_docentes_agg`
 * (migration 204). As queries vivem em `lib/radar/queries.ts`; aqui fica só a
 * matemática, que é o que precisa de teste.
 *
 * Três armadilhas do dado, todas medidas em 06/08/2026 sobre o censo 2025:
 *
 * 1. `qt_doc_bas` conta docentes ATUANDO NAQUELA escola. Por escola é exato;
 *    somar entre escolas conta duas vezes quem atua em duas (a soma nacional dá
 *    2.992.045 contra ~2,3M de docentes únicos do INEP). Agregado = VÍNCULOS.
 * 2. Vínculo (`concur`/`contra`/`terceir`/`clt`) vem ZERADO na rede privada —
 *    o Censo só publica tipo de contratação da rede pública (651.519 docentes
 *    privados, 0 com vínculo). Sem `temVinculoDeclarado`, uma escola privada
 *    exibiria "0% concursados" como se fosse informação.
 * 3. Níveis de pós NÃO se somam (quem tem especialização e mestrado entra nos
 *    dois: rede federal de Jundiaí somaria 35 de 28) e etapas também não (24%
 *    das escolas somam mais que o total). Por isso cada um aparece separado.
 */

export type CensoDocentes = {
  codigo_inep: string;
  ano: number;
  qt_doc_bas: number | null;
  qt_doc_inf: number | null;
  qt_doc_fund: number | null;
  qt_doc_med: number | null;
  qt_doc_bas_esco_sup_grad: number | null;
  qt_doc_bas_esco_sup_grad_licen: number | null;
  qt_doc_bas_esco_sup_pos_espec: number | null;
  qt_doc_bas_esco_sup_pos_mestra: number | null;
  qt_doc_bas_esco_sup_pos_douto: number | null;
  qt_doc_bas_vinculo_concur: number | null;
  qt_doc_bas_vinculo_contra: number | null;
  qt_doc_bas_vinculo_terceir: number | null;
  qt_doc_bas_vinculo_clt: number | null;
  qt_doc_bas_fem: number | null;
  qt_doc_bas_masc: number | null;
  qt_doc_bas_0_24: number | null;
  qt_doc_bas_25_29: number | null;
  qt_doc_bas_50_54: number | null;
  qt_doc_bas_55_59: number | null;
  qt_doc_bas_60_mais: number | null;
};

/** Uma linha da MV: um (município × rede). */
export type DocentesAggRow = {
  rede: string;
  ano: number | null;
  escolas_com_dado: number;
  docentes_total: number;
  docentes_infantil: number;
  docentes_fundamental: number;
  docentes_medio: number;
  docentes_superior: number;
  docentes_licenciatura: number;
  docentes_especializacao: number;
  docentes_mestrado: number;
  docentes_doutorado: number;
  docentes_concursados: number;
  docentes_contrato: number;
  docentes_terceirizados: number;
  docentes_clt: number;
  docentes_ate_29: number;
  docentes_50_mais: number;
  docentes_fem: number;
  docentes_masc: number;
  matriculas_total: number;
};

/** Agregado por escopo (município, rede ou UF). Soma de VÍNCULOS, não de pessoas. */
export type DocentesAgregado = {
  ano: number | null;
  escolasComDado: number;
  total: number;
  infantil: number;
  fundamental: number;
  medio: number;
  superior: number;
  licenciatura: number;
  especializacao: number;
  mestrado: number;
  doutorado: number;
  concursados: number;
  contrato: number;
  terceirizados: number;
  clt: number;
  ate29: number;
  cinquentaMais: number;
  fem: number;
  masc: number;
  matriculas: number;
  /** Total por rede, para o leitor ver de onde vem a soma. */
  porRede: Array<{ rede: string; escolas: number; docentes: number }>;
};

export const DOCENTES_ESCOLA_COLUNAS =
  'codigo_inep, ano, qt_doc_bas, qt_doc_inf, qt_doc_fund, qt_doc_med, ' +
  'qt_doc_bas_esco_sup_grad, qt_doc_bas_esco_sup_grad_licen, ' +
  'qt_doc_bas_esco_sup_pos_espec, qt_doc_bas_esco_sup_pos_mestra, qt_doc_bas_esco_sup_pos_douto, ' +
  'qt_doc_bas_vinculo_concur, qt_doc_bas_vinculo_contra, qt_doc_bas_vinculo_terceir, qt_doc_bas_vinculo_clt, ' +
  'qt_doc_bas_fem, qt_doc_bas_masc, ' +
  'qt_doc_bas_0_24, qt_doc_bas_25_29, qt_doc_bas_50_54, qt_doc_bas_55_59, qt_doc_bas_60_mais';

export const DOCENTES_AGG_COLUNAS =
  'rede, ano, escolas_com_dado, docentes_total, docentes_infantil, docentes_fundamental, docentes_medio, ' +
  'docentes_superior, docentes_licenciatura, docentes_especializacao, docentes_mestrado, docentes_doutorado, ' +
  'docentes_concursados, docentes_contrato, docentes_terceirizados, docentes_clt, ' +
  'docentes_ate_29, docentes_50_mais, docentes_fem, docentes_masc, matriculas_total';

const num = (v: unknown) => Number(v || 0);

/**
 * Vínculo só existe na rede pública — sem esta checagem a UI mostraria
 * "0% concursados" para escola/município privado como se fosse medição.
 */
export function temVinculoDeclarado(
  d: Pick<DocentesAgregado, 'concursados' | 'contrato' | 'terceirizados' | 'clt'>,
): boolean {
  return (num(d.concursados) + num(d.contrato) + num(d.terceirizados) + num(d.clt)) > 0;
}

export function agregarDocentes(rows: DocentesAggRow[]): DocentesAgregado | null {
  if (!rows.length) return null;
  const soma = (pick: (r: DocentesAggRow) => number) =>
    rows.reduce((acc, r) => acc + num(pick(r)), 0);
  const anos = rows.map((r) => Number(r.ano)).filter((a) => Number.isFinite(a));
  return {
    ano: anos.length ? Math.max(...anos) : null,
    escolasComDado: soma((r) => r.escolas_com_dado),
    total: soma((r) => r.docentes_total),
    infantil: soma((r) => r.docentes_infantil),
    fundamental: soma((r) => r.docentes_fundamental),
    medio: soma((r) => r.docentes_medio),
    superior: soma((r) => r.docentes_superior),
    licenciatura: soma((r) => r.docentes_licenciatura),
    especializacao: soma((r) => r.docentes_especializacao),
    mestrado: soma((r) => r.docentes_mestrado),
    doutorado: soma((r) => r.docentes_doutorado),
    concursados: soma((r) => r.docentes_concursados),
    contrato: soma((r) => r.docentes_contrato),
    terceirizados: soma((r) => r.docentes_terceirizados),
    clt: soma((r) => r.docentes_clt),
    ate29: soma((r) => r.docentes_ate_29),
    cinquentaMais: soma((r) => r.docentes_50_mais),
    fem: soma((r) => r.docentes_fem),
    masc: soma((r) => r.docentes_masc),
    matriculas: soma((r) => r.matriculas_total),
    porRede: rows
      .map((r) => ({
        rede: r.rede,
        escolas: num(r.escolas_com_dado),
        docentes: num(r.docentes_total),
      }))
      .filter((r) => r.docentes > 0)
      .sort((a, b) => b.docentes - a.docentes),
  };
}

/**
 * Consolida as linhas de uma UF (uma por município × rede) em uma linha por
 * rede — o breakdown "por rede" da página do estado precisa de 4 linhas, não
 * de 2.000.
 */
export function consolidarPorRede(rows: DocentesAggRow[]): DocentesAggRow[] {
  const porRede = new Map<string, DocentesAggRow>();
  for (const r of rows) {
    const atual = porRede.get(r.rede);
    if (!atual) { porRede.set(r.rede, { ...r }); continue; }
    for (const k of Object.keys(atual) as (keyof DocentesAggRow)[]) {
      if (k === 'rede') continue;
      if (k === 'ano') {
        atual.ano = Math.max(num(atual.ano), num(r.ano)) || null;
        continue;
      }
      (atual[k] as number) = num(atual[k]) + num(r[k]);
    }
  }
  return Array.from(porRede.values());
}
