/**
 * Adaptador de unificação: roda o MOTOR ÚNICO (lib/scoring) a partir do gabarito
 * (faixas reais + direção + pesos + knockouts) e devolve o resultado no CONTRATO
 * LEGADO do Fit v2 — para que tela /admin/fit, ranking, gap-analysis e a tabela
 * fit_resultados continuem funcionando sem alteração.
 *
 * Usado pela action calcularFitIndividual quando o cargo TEM gabarito. Sem
 * gabarito (perfil ideal 100% customizado), a action cai no calcularFit legado.
 */
import { scoreCandidate, type RoleSpec } from './engine';
import { buildRoleSpec, BLOCK, LID_KEY, TELA3_KEY } from './role-spec';
import { buildCandidateProfile } from './candidate';
import { LIDERANCA } from '@/lib/perfil-organizacional/aggregate';
// @ts-ignore — módulos JS legados do Fit v2 (reusados como estão)
import { gerarGapAnalysis } from '@/lib/fit-v2/gap-analysis.js';
// @ts-ignore
import { gerarLeituraExecutiva, classificar } from '@/lib/fit-v2/classificacao.js';

const num = (v: any) => Number(v) || 0;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const LID_KEYS = Object.keys(LIDERANCA); // lid_executivo, lid_motivador, lid_metodico, lid_sistematico
const LID_ESTILO: Record<string, string> = { lid_executivo: 'executivo', lid_motivador: 'motivador', lid_metodico: 'metodico', lid_sistematico: 'sistematico' };

/** weight numérico do traço → nome de peso esperado pelo gap-analysis. */
function pesoNome(w?: number): 'critica' | 'importante' | 'complementar' {
  const x = num(w) || 1;
  if (x >= 2) return 'critica';
  if (x >= 1.3) return 'importante';
  return 'complementar';
}

/** distância/gap honrando a direção (floor não penaliza acima; ceiling não penaliza abaixo). */
function distGap(raw: number, lo: number, hi: number, dir?: string): { distancia: number; gap: 'dentro' | 'abaixo' | 'acima' } {
  if (raw < lo && dir !== 'ceiling') return { distancia: lo - raw, gap: 'abaixo' };
  if (raw > hi && dir !== 'floor') return { distancia: raw - hi, gap: 'acima' };
  return { distancia: 0, gap: 'dentro' };
}

function penalidadeExcesso(excesso: number): number {
  if (excesso > 30) return 15;
  if (excesso > 20) return 10;
  if (excesso > 10) return 5;
  return 0;
}

/** Diferenças por estilo de liderança (perfis normalizados p/ soma 100). */
function diffsLideranca(colab: any, gabarito: any): Record<string, number> {
  const idealRaw = LID_KEYS.map((k) => num(gabarito?.tela3?.[TELA3_KEY[k]]));
  const realRaw = LID_KEYS.map((k) => num(colab?.[k]));
  const is = idealRaw.reduce((s, v) => s + v, 0) || 1;
  const rs = realRaw.reduce((s, v) => s + v, 0) || 1;
  const out: Record<string, number> = {};
  LID_KEYS.forEach((k, i) => {
    out[LID_ESTILO[k]] = Math.round(Math.abs((idealRaw[i] / is) * 100 - (realRaw[i] / rs) * 100) * 100) / 100;
  });
  return out;
}

export interface FitUnificadoOpts { ehLideranca?: boolean; cargoNome?: string }

/** Calcula o Fit no contrato legado, mas com o motor novo. Retorna null se sem gabarito. */
export function calcularFitUnificado(gabarito: any, colab: any, opts: FitUnificadoOpts = {}): any | null {
  const cargoNome = opts.cargoNome || colab?.cargo || '';
  const spec = buildRoleSpec(gabarito, cargoNome, { ehLideranca: opts.ehLideranca });
  if (!spec) return null;

  const profile = buildCandidateProfile(colab, gabarito);
  const result = scoreCandidate(spec, profile);

  const traitByKey = new Map(spec.traits.map((t) => [t.key, t]));
  const fitByKey = new Map(result.traits.map((t) => [t.key, t.fit]));

  // ── blocos.competencias ────────────────────────────────────────────────────
  const compDet: any[] = [];
  const compExc: any[] = [];
  for (const t of spec.traits as any[]) {
    if (t.block !== BLOCK.COMP) continue;
    const raw = num(profile[t.key]);
    const score = Math.round((fitByKey.get(t.key) ?? 0) * 100);
    const { distancia, gap } = distGap(raw, t.lo, t.hi, t.direction);
    let excesso = 0;
    if (raw > t.hi && t.direction !== 'floor') {
      excesso = raw - t.hi;
      const pen = penalidadeExcesso(excesso);
      if (pen > 0) compExc.push({ nome: t.label || t.key, excesso, penalidade: -pen });
    }
    compDet.push({ nome: t.label || t.key, peso: pesoNome(t.weight), score, valorReal: raw, faixa: `${t.lo}-${t.hi}`, distancia, gap, excesso });
  }

  // ── blocos.disc ────────────────────────────────────────────────────────────
  const discDet: Record<string, any> = {};
  const discExc: any[] = [];
  for (const f of ['D', 'I', 'S', 'C']) {
    const t: any = traitByKey.get(f);
    if (!t) continue;
    const raw = num(profile[f]);
    const score = Math.round((fitByKey.get(f) ?? 0) * 100);
    const { distancia } = distGap(raw, t.lo, t.hi, t.direction);
    let excesso = 0;
    if (raw > t.hi && t.direction !== 'floor') {
      excesso = raw - t.hi;
      const pen = penalidadeExcesso(excesso);
      if (pen > 0) discExc.push({ dimensao: f, excesso, penalidade: -pen });
    }
    discDet[f] = { valorReal: raw, min: t.lo, max: t.hi, distancia, score, excesso };
  }

  // ── blocos.mapeamento ──────────────────────────────────────────────────────
  const mapDet: any[] = [];
  for (const t of spec.traits as any[]) {
    if (t.block !== BLOCK.MAP) continue;
    const aderencia = (fitByKey.get(t.key) ?? 0) >= 0.5 ? 100 : 0;
    mapDet.push({ tag: t.label || t.key, peso: pesoNome(t.weight), aderencia, match: aderencia === 100, oposta: false });
  }

  // ── blocos.lideranca ───────────────────────────────────────────────────────
  const temLid = result.blocks.some((b) => b.block === BLOCK.LID);
  const lidScore = temLid ? Math.round((fitByKey.get(LID_KEY) ?? 0) * 100) : null;

  const blocoScore = (name: string) => {
    const b = result.blocks.find((x) => x.block === name);
    return b ? Math.round(b.score * 100) : 0;
  };
  const pesoBloco = (name: string) => {
    const b = result.blocks.find((x) => x.block === name);
    return b ? round(b.weight, 3) : 0;
  };

  const blocos = {
    mapeamento: { score: blocoScore(BLOCK.MAP), peso: pesoBloco(BLOCK.MAP), detalhes: mapDet },
    competencias: { score: blocoScore(BLOCK.COMP), peso: pesoBloco(BLOCK.COMP), detalhes: compDet, excessos: compExc },
    lideranca: temLid
      ? { score: lidScore, peso: pesoBloco(BLOCK.LID), detalhes: { diferencas: diffsLideranca(colab, gabarito) } }
      : { score: null, peso: 0, detalhes: [], excluido: true },
    disc: { score: blocoScore(BLOCK.DISC), peso: pesoBloco(BLOCK.DISC), detalhes: discDet, excessos: discExc },
  };

  // ── Score base / fatores / fit final ───────────────────────────────────────
  const scoreBase = round(result.beta * 100, 2);
  // Decisão de produto: o NÚMERO é sempre o match real (não penaliza). A
  // eliminatória é um GATE separado — vira classificação "Não recomendado" +
  // premissas ✗, e o ranking joga os reprovados pro fim. PDF e tela ficam iguais.
  const fitFinal = scoreBase;
  const fatorCritico = 1;

  const resultado: any = {
    colaborador: { id: colab.id, nome: colab.nome_completo || colab.nome, email: colab.email, cargo: colab.cargo },
    cargo: cargoNome,
    versao_modelo: '2.1',
    fit_final: Math.round(fitFinal * 10) / 10,
    score_base: scoreBase,
    fatores: { fator_critico: fatorCritico, fator_excesso: 1 },
    blocos,
    // Sinais novos do motor (a tela pode ignorar; persistidos no JSON):
    borderline: result.borderline,
    knockout_failed: result.knockoutFailed,
    knockouts: result.knockouts.filter((k) => !k.passed).map((k) => k.rule.label || k.rule.key),
    // Premissas (eliminatórias) com status por item — alimenta a coluna do ranking.
    premissas: result.knockouts.map((k) => ({ key: k.rule.key, label: k.rule.label || k.rule.key, passed: k.passed })),
  };

  // Eliminatória reprovada = GATE: "Não recomendado" independentemente do match.
  if (result.knockoutFailed) {
    resultado.classificacao = 'Não recomendado';
    resultado.recomendacao = 'Não recomendado';
  } else {
    const cl = classificar(resultado.fit_final);
    resultado.classificacao = cl.classificacao;
    resultado.recomendacao = cl.recomendacao;
  }

  // Gap analysis + leitura executiva (libs legadas, contrato preservado).
  const perfilIdealLike = {
    cargo: cargoNome,
    pesos_blocos: {
      mapeamento: blocos.mapeamento.peso,
      competencias: blocos.competencias.peso,
      lideranca: temLid ? blocos.lideranca.peso : 0,
      disc: blocos.disc.peso,
    },
    competencias: compDet.map((d) => ({ nome: d.nome, peso: d.peso, faixa_min: d.faixa, faixa_max: d.faixa })),
  };
  resultado.gap_analysis = gerarGapAnalysis(resultado, perfilIdealLike);
  resultado.leitura_executiva = gerarLeituraExecutiva(resultado);

  return { success: true, ...resultado };
}
