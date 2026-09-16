/**
 * Agrupa os descritores do Evolution Report pela competência a que pertencem,
 * na ordem em que aparecem no relatório.
 *
 * 🔑 POR QUE (16/09/2026, pergunta do dono olhando o PDF da Elisângela). As
 * trilhas DUO trabalham DUAS competências, e cada descritor do relatório já
 * carrega a sua (`evolution-report-core` grava `d.competencia`). Mas o PDF e a
 * tela da temporada concluída listavam os 9 descritores corridos, citando as
 * competências só juntas no subtítulo ("A + B"): quem lia não sabia a qual
 * competência cada comportamento pertencia. O layout era do tempo da trilha de
 * uma competência só.
 *
 * Pura e sem dependência de UI: serve ao PDF (servidor) e à tela ('use client').
 */
export interface GrupoCompetencia<T> {
  /** `null` quando o descritor não traz competência (relatório antigo). */
  competencia: string | null;
  descritores: T[];
  /**
   * Médias das notas dos descritores que têm AS DUAS (`null` se nenhum tem).
   * Não são para exibir: a tela e o PDF só mostram o AVANÇO da competência,
   * `formatarAvanco(mediaPre, mediaPos)`, com o mesmo piso em zero do descritor
   * (decisão do dono, 16/09/2026: "e a nota da competência?"). `Number(null)` é
   * 0, então descritor sem nota de partida fica de fora da média, senão puxaria
   * o "antes" para baixo e inventaria avanço.
   */
  mediaPre: number | null;
  mediaPos: number | null;
}

// `T = any` e leitura por `any`: as telas recebem o relatório como `any` (jsonb),
// e uma restrição `{ competencia }` faria o TypeScript inferir SÓ esse campo,
// escondendo `descritor`, `nota_pre` etc. de quem itera os grupos.
export function agruparPorCompetencia<T = any>(
  descritores: T[] | null | undefined,
): GrupoCompetencia<T>[] {
  const grupos: GrupoCompetencia<T>[] = [];
  for (const d of Array.isArray(descritores) ? descritores : []) {
    const competencia = String((d as any)?.competencia || '').trim() || null;
    let grupo = grupos.find((g) => g.competencia === competencia);
    if (!grupo) {
      grupo = { competencia, descritores: [], mediaPre: null, mediaPos: null };
      grupos.push(grupo);
    }
    grupo.descritores.push(d);
  }
  for (const g of grupos) {
    const medidos = g.descritores.filter((d: any) => temNota(d?.nota_pre) && temNota(d?.nota_pos));
    if (!medidos.length) continue;
    g.mediaPre = medidos.reduce((soma, d: any) => soma + Number(d.nota_pre), 0) / medidos.length;
    g.mediaPos = medidos.reduce((soma, d: any) => soma + Number(d.nota_pos), 0) / medidos.length;
  }
  return grupos;
}

function temNota(v: unknown): boolean {
  return v != null && v !== '' && Number.isFinite(Number(v));
}
