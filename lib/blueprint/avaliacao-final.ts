/**
 * A SEMANA DE AVALIAÇÃO do blueprint montada EM CÓDIGO a partir dos objetivos de 30 dias (decisão do dono, 16/10/2026).
 *
 * Por que: na Amazon Bowling, 10 de 14 blueprints reprovaram, e a falha que mais se repetiu (e que a correção guiada
 * pela IA não fechou) foi "a avaliação final não mede o que o PDI promete". Medido: o objetivo do Thiago pede "ao
 * menos 20 registros de ação preventiva", e a semana de avaliação gerada pela IA cobrava 12. A IA reescreve as
 * quantidades ao resumir; aqui elas são copiadas.
 *
 * Regra, por semana de avaliação: os objetivos são os da(s) competência(s) da semana (`competencia_foco`; sem casar
 * nenhuma, os de todas, que é o caso de uma competência só). `conexao_com_pdi` = todos esses objetivos;
 * `evidencia_esperada` = a evidência de execução de CADA objetivo, item a item; `criterio_de_sucesso` = o critério de
 * sucesso de CADA objetivo, item a item. Objetivo sem o campo entra com o próprio texto do objetivo. O
 * `objetivo_da_semana` e os descritores ficam como a IA escreveu. PURO (devolve uma cópia).
 */
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const limpar = (s: unknown) => String(s ?? '').trim().replace(/[.;\s]+$/, '');

export function montarSemanasDeAvaliacao<T = any>(bp: T): T {
  const copia: any = JSON.parse(JSON.stringify(bp ?? {}));
  const comps: any[] = Array.isArray(copia?.competencias) ? copia.competencias : [];
  const semanas: any[] = Array.isArray(copia?.trilha?.semanas) ? copia.trilha.semanas : [];
  for (const s of semanas) {
    if (s?.tipo !== 'avaliacao') continue;
    const nomes = new Set((Array.isArray(s.competencia_foco) ? s.competencia_foco : []).map(norm));
    const daSemana = comps.filter((c) => nomes.has(norm(c?.nome)));
    const objetivos = (daSemana.length ? daSemana : comps)
      .flatMap((c) => (Array.isArray(c?.objetivos_30_dias) ? c.objetivos_30_dias : []))
      .filter((o) => o && o.id);
    if (!objetivos.length) continue;
    s.conexao_com_pdi = objetivos.map((o) => o.id);
    s.evidencia_esperada = `Apresentar, com os registros das semanas anteriores: ${objetivos
      .map((o, i) => `(${i + 1}) ${limpar(o.evidencia_de_execucao || o.objetivo)}`).join('; ')}.`;
    s.criterio_de_sucesso = `A avaliação verifica cada objetivo do PDI, item a item: ${objetivos
      .map((o, i) => `(${i + 1}) ${limpar(o.criterio_de_sucesso || o.objetivo)}`).join('; ')}.`;
  }
  return copia;
}
