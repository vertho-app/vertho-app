/**
 * Eval harness (S4) — o LINCHPIN do plano: nenhuma troca de modelo pedagógico
 * ou de contexto (S5) vai a prod sem passar por aqui. Ferramenta pura, sem
 * efeito em produção.
 *
 * Fluxo: um conjunto de goldens (casos reais amostrados do ledger + os casos
 * históricos que furaram) roda contra um CANDIDATO (modelo/prompt novo). Cada
 * caso é pontuado por sinais EM CÓDIGO ([[ia-sinais]]) + comparação com o
 * baseline congelado. Gates objetivos decidem promoção.
 *
 * ⚠️ Um harness que nunca reprova nada é carimbo, não gate. Por isso o harness
 * é validado POR MUTAÇÃO (injeta saída sabidamente ruim → confirma reprovação)
 * nos testes — regra do CLAUDE.md aplicada ao eval.
 */
import { computarSinais, type SinaisInput } from '@/lib/ia-sinais';

export interface GoldenCase {
  id: string;
  taskKey: string;
  /** Entrada crua do caso (o que se manda ao modelo). */
  input: unknown;
  /** Saída congelada do baseline (produção atual) para comparação. */
  baseline: { raw: string; parsed?: any; notas?: number[] };
  /** Campos obrigatórios do schema da task. */
  camposObrigatorios?: string[];
  /** Nota determinística do caso (score em código), se houver. */
  notaDeterministica?: number | null;
}

export interface CasoAvaliado {
  id: string;
  jsonValido: boolean;
  baixaConfianca: boolean;
  /** Divergência de nível vs. baseline (|nota_candidato − nota_baseline|), média. */
  divergenciaNivel: number | null;
}

export interface RelatorioEval {
  total: number;
  jsonValidRate: number;
  baixaConfiancaRate: number;
  /** Fração de casos cuja nota divergiu do baseline em > toleranciaNivel. */
  regressaoNivelRate: number;
  divergenciaNivelMedia: number;
  promovido: boolean;
  reprovadoPor: string[];
  casos: CasoAvaliado[];
}

export interface GatesEval {
  jsonValidMin: number;        // ex.: 0.995
  regressaoNivelMax: number;   // ex.: 0.05 (5% dos casos podem divergir)
  toleranciaNivel: number;     // ex.: 1 nível de diferença tolerado por caso
  baixaConfiancaMax: number;   // ex.: 0.02
}

export const GATES_PADRAO: GatesEval = {
  jsonValidMin: 0.995,
  regressaoNivelMax: 0.05,
  toleranciaNivel: 1,
  baixaConfiancaMax: 0.02,
};

/** Extrai a média de notas de uma saída parseada (heurística p/ schemas de avaliação). */
function mediaNotas(parsed: any, notas?: number[]): number | null {
  if (notas && notas.length) return notas.reduce((a, b) => a + b, 0) / notas.length;
  if (!parsed || typeof parsed !== 'object') return null;
  const arr = Array.isArray(parsed.avaliacao_acumulada) ? parsed.avaliacao_acumulada
    : Array.isArray(parsed.descritores) ? parsed.descritores : null;
  if (!arr) return typeof parsed.nota === 'number' ? parsed.nota : null;
  const ns = arr.map((d: any) => d.nivel ?? d.nota).filter((n: any) => typeof n === 'number');
  return ns.length ? ns.reduce((a: number, b: number) => a + b, 0) / ns.length : null;
}

/**
 * Roda o harness. `runCandidato(golden)` produz a saída crua do candidato
 * (o caller injeta a chamada ao modelo/prompt novo). Determinístico e sem I/O
 * aqui — a rede fica no runCandidato do caller (testável com stub).
 */
export async function rodarEval(
  goldens: GoldenCase[],
  runCandidato: (g: GoldenCase) => Promise<string>,
  gates: GatesEval = GATES_PADRAO,
): Promise<RelatorioEval> {
  const casos: CasoAvaliado[] = [];
  for (const g of goldens) {
    const raw = await runCandidato(g);
    let parsed: any;
    try {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse((m ? m[1] : raw).trim());
    } catch { parsed = undefined; }

    const notas: number[] | undefined = parsed && Array.isArray(parsed.avaliacao_acumulada)
      ? parsed.avaliacao_acumulada.map((d: any) => d.nivel ?? d.nota).filter((n: any) => typeof n === 'number')
      : g.baseline.notas;

    const sinaisInput: SinaisInput = {
      raw, parsed,
      camposObrigatorios: g.camposObrigatorios,
      notas,
      notaDeterministica: g.notaDeterministica ?? null,
      notaModelo: mediaNotas(parsed, notas),
    };
    const s = computarSinais(sinaisInput);

    const notaCand = mediaNotas(parsed, notas);
    const notaBase = mediaNotas(g.baseline.parsed, g.baseline.notas);
    const div = notaCand != null && notaBase != null ? Math.abs(notaCand - notaBase) : null;

    casos.push({ id: g.id, jsonValido: s.jsonValido, baixaConfianca: s.baixaConfianca, divergenciaNivel: div });
  }

  const total = casos.length || 1;
  const jsonValidRate = casos.filter((c) => c.jsonValido).length / total;
  const baixaConfiancaRate = casos.filter((c) => c.baixaConfianca).length / total;
  const comDiv = casos.filter((c) => c.divergenciaNivel != null);
  const regressaoNivelRate = comDiv.filter((c) => (c.divergenciaNivel as number) > gates.toleranciaNivel).length / (comDiv.length || 1);
  const divergenciaNivelMedia = comDiv.length ? comDiv.reduce((a, c) => a + (c.divergenciaNivel as number), 0) / comDiv.length : 0;

  const reprovadoPor: string[] = [];
  if (jsonValidRate < gates.jsonValidMin) reprovadoPor.push(`json_valid ${(jsonValidRate * 100).toFixed(1)}% < ${(gates.jsonValidMin * 100).toFixed(1)}%`);
  if (regressaoNivelRate > gates.regressaoNivelMax) reprovadoPor.push(`regressao_nivel ${(regressaoNivelRate * 100).toFixed(1)}% > ${(gates.regressaoNivelMax * 100).toFixed(1)}%`);
  if (baixaConfiancaRate > gates.baixaConfiancaMax) reprovadoPor.push(`baixa_confianca ${(baixaConfiancaRate * 100).toFixed(1)}% > ${(gates.baixaConfiancaMax * 100).toFixed(1)}%`);

  return {
    total: casos.length,
    jsonValidRate, baixaConfiancaRate, regressaoNivelRate, divergenciaNivelMedia,
    promovido: reprovadoPor.length === 0,
    reprovadoPor, casos,
  };
}
