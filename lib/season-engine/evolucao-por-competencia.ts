import { avancoMedioExibido } from '@/lib/season-engine/convergencia';
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';

/**
 * Agrupa os descritores do Evolution Report pela competência a que pertencem,
 * na ordem em que aparecem no relatório, com o resultado de cada competência.
 *
 * 🔑 POR QUE (16/09/2026, perguntas do dono olhando o PDF da Elisângela). As
 * trilhas DUO trabalham DUAS competências, e cada descritor do relatório já
 * carrega a sua (`evolution-report-core` grava `d.competencia`). Mas o PDF e a
 * tela da temporada concluída listavam os 9 descritores corridos, citando as
 * competências só juntas no subtítulo ("A + B"), e não diziam como cada
 * competência terminou.
 *
 * O resultado da competência tem duas partes, e nenhuma é a nota:
 *   · `avancoMedio`: média dos avanços EXIBIDOS dos descritores (piso zero em
 *     cada um), a mesma régua do descritor (ver `avancoMedioExibido`);
 *   · `nivelFinal` (e se SUBIU): o nível da régua oficial (`nivelDaNota`)
 *     aplicado à MÉDIA das notas da competência. Nível de média, e não de
 *     descritor, porque é o que a medição sustenta: o nível de um descritor
 *     isolado troca em 32% das repontuações, o da média oscila 0,07
 *     (`lib/nivel-regua.ts`).
 *
 * Pura e sem dependência de UI: serve ao PDF (servidor) e às telas ('use client').
 */
export interface GrupoCompetencia<T> {
  /** `null` quando o descritor não traz competência (relatório antigo). */
  competencia: string | null;
  descritores: T[];
  /** Média dos avanços exibidos; `null` se nenhum descritor tem as duas notas. */
  avancoMedio: number | null;
  /** Nível da média das notas iniciais / finais (só descritores com as duas notas). */
  nivelInicial: Nivel | null;
  nivelFinal: Nivel | null;
  /** O nível da média subiu entre o diagnóstico e o fechamento. */
  subiuDeNivel: boolean;
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
      grupo = { competencia, descritores: [], avancoMedio: null, nivelInicial: null, nivelFinal: null, subiuDeNivel: false };
      grupos.push(grupo);
    }
    grupo.descritores.push(d);
  }
  for (const g of grupos) {
    g.avancoMedio = avancoMedioExibido(g.descritores as any[]);
    // `Number(null)` é 0: descritor sem uma das notas fica fora da média, senão
    // puxaria o nível para baixo por dado faltando.
    const medidos = g.descritores.filter((d: any) => temNota(d?.nota_pre) && temNota(d?.nota_pos));
    if (!medidos.length) continue;
    const media = (campo: 'nota_pre' | 'nota_pos') =>
      medidos.reduce((soma, d: any) => soma + Number(d[campo]), 0) / medidos.length;
    g.nivelInicial = nivelDaNota(media('nota_pre'));
    // 🔴 SEM REGRESSÃO TAMBÉM NA COMPETÊNCIA (decisão do dono, 16/09/2026): se o
    // nível da média cair, o nível exibido é o de partida. Mesmo conceito do
    // descritor (avanço com piso zero, sem veredito de regressão): queda entre o
    // diagnóstico e o fechamento é variação do instrumento, não alguém que
    // desaprendeu. Sem este piso, o papel mostraria um nível menor sem nenhum
    // sinal de queda ao lado.
    g.nivelFinal = Math.max(g.nivelInicial, nivelDaNota(media('nota_pos'))) as Nivel;
    g.subiuDeNivel = g.nivelFinal > g.nivelInicial;
  }
  return grupos;
}

function temNota(v: unknown): boolean {
  return v != null && v !== '' && Number.isFinite(Number(v));
}
