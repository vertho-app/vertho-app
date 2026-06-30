/**
 * Relatório de Adequação ao Cargo — match colaborador × PERFIL IDEAL do cargo.
 *
 * Usa o MOTOR ÚNICO de scoring (lib/scoring): para cada colaborador, calcula a
 * aderência CONTÍNUA (não binária) ao gabarito em 4 blocos, com direção por traço
 * (floor/target/ceiling), pesos de bloco, knockouts e borderline (±SEM).
 *   - Mapeamento  : características (gabarito.tela1) — polo do colab bate (binary).
 *   - Competência : subcompetências (gabarito.tela2) — comp_* na faixa, com direção.
 *   - Liderança   : estilo (gabarito.tela3) — fit contínuo por distância vetorial.
 *   - DISC        : 4 fatores (gabarito.tela4) — {d,i,s,c}_natural na faixa, com direção.
 *
 * Beta = média dos blocos ponderada pelos pesos. Mantém o shape consumido pelo PDF
 * (PessoaAdequacao/SubScore) e adiciona recomendação/borderline/knockout/direção.
 *
 * Puro (sem IA, sem Next) — recebe um SupabaseClient. O PDF + a narrativa consomem.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { LIDERANCA } from '@/lib/perfil-organizacional/aggregate';
import {
  scoreCandidate, colorBand, inferDirection, RECOMMENDATION_LABEL, STATUS_LABEL,
  type ScoringResult, type ColorBand, type Recommendation, type Status, type RoleSpec,
} from '@/lib/scoring/engine';
import { buildRoleSpec, faixaDe, BLOCK, TELA3_KEY } from '@/lib/scoring/role-spec';
import { buildCandidateProfile, candidateColumns } from '@/lib/scoring/candidate';
import { origemBloqueio, LABEL_ORIGEM, type KnockoutEvidencia, type OrigemBloqueio } from './evidencia';

export type Classe = 'alta' | 'razoavel' | 'baixa';
export interface SubScore { atendidos: number; total: number; pct: number; classe: Classe; aplicavel: boolean }

export interface DiscFator { fator: 'D' | 'I' | 'S' | 'C'; score: number; min: number; max: number; dentro: boolean; classe: Classe }
export interface PessoaAdequacao {
  nome: string;
  disc: DiscFator[];                 // 4 fatores com score + faixa + classe
  mapeamento: SubScore;
  competencia: SubScore;
  lideranca: SubScore;
  discScore: SubScore;
  beta: SubScore;                    // score geral (ponderado pelos pesos de bloco)
  recomendacao: Recommendation;
  recomendacaoLabel: string;
  status: Status;                    // 4 estados: bloqueado ≠ abaixo_do_corte
  statusLabel: string;
  borderline: boolean;
  betaSemDelta: number;              // ±X em pontos de Beta sob ±SEM (T5)
  knockoutFailed: boolean;
  knockoutMotivos: string[];
  knockoutEvidencias: KnockoutEvidencia[];  // traço medido + piso + consequência (Tarefa B)
  origemBloqueio: OrigemBloqueio | null;    // natureza do gate: competência vs comportamental (T4)
  origemBloqueioLabel: string | null;
  gaps: TraitGap[];                         // traços abaixo do alvo (desenvolvimento — T3/T7)
  id?: string;                              // candidate id — join robusto (homônimos) p/ a rotina de calibração
  tracos: TracoDiag[];                      // por-traço bruto+fit+direção — torna o snapshot AUTOSSUFICIENTE p/ diagnóstico engine-free
}

// Detalhe por-traço gravado no snapshot p/ a rotina de calibração ler SEM o motor
// (ρ usa o bruto cru; saturação usa o fit; direção vem da spec). Audit-fiel: é o
// resultado entregue, não um re-cálculo.
export interface TracoDiag { key: string; label: string; bloco: string; direcao?: 'floor' | 'target' | 'ceiling'; lo: number | null; hi: number | null; bruto: number | null; fitPct: number }

// Gap inclui DIREÇÃO e LADO do desvio — sem isto a IA adivinha o lado de um traço
// faixa-alvo (penaliza dos 2 lados) e pode INVERTER o sinal, ou chamar faixa-alvo de
// "piso eliminatório". valorBruto + lado tiram a adivinhação.
export interface TraitGap { traco: string; bloco: string; fitPct: number; direcao?: 'floor' | 'target' | 'ceiling'; valorBruto?: number | null; lo?: number | null; hi?: number | null; lado?: 'abaixo' | 'acima' | null }
export type Direcao = 'floor' | 'target' | 'ceiling';
export interface CompetenciaIdeal { nome: string; dimensao: string; min: number; max: number; prioridade: string; direcao?: Direcao }
export interface CaracteristicaIdeal { par: string; polo: string; intensidade: string }
export interface PerfilIdeal {
  caracteristicas: CaracteristicaIdeal[];
  competencias: CompetenciaIdeal[];
  lideranca: { nome: string; pct: number; key: string }[];
  estiloPredominante: string;
  disc: { fator: 'D' | 'I' | 'S' | 'C'; nome: string; min: number; max: number; direcao?: Direcao }[];
  pesos: { bloco: string; pct: number }[];
  liderancaAplicavel: boolean;
}

export interface AdequacaoCargo {
  cargo: string;
  avaliados: number;
  perfilIdeal: PerfilIdeal;
  pessoas: PessoaAdequacao[];        // ordenadas por Beta desc
  avisosCalibracao: { traco: string; pct: number; tipo: 'piso' | 'teto' }[]; // guardião bilateral: piso=zera >50% (alvo alto), teto=satura >50% (faixa frouxa)
  semGabarito: boolean;
  semColaboradores: boolean;
}

const num = (v: any) => Number(v) || 0;
const r1 = (v: number) => Math.round(v * 10) / 10;
const FATOR_NOME = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' } as const;
const LID_KEYS = Object.keys(LIDERANCA);
const BLOCO_LABEL: Record<string, string> = { Competencia: 'Competência', Lideranca: 'Liderança', DISC: 'DISC', Mapeamento: 'Mapeamento' };

const classeDeBanda = (b: ColorBand): Classe => (b === 'verde' ? 'alta' : b === 'amarelo' ? 'razoavel' : 'baixa');

/** SubScore a partir do score 0..1 de um bloco do motor (ou ausente). */
function subDoBloco(result: ScoringResult, bloco: string, spec: RoleSpec): SubScore {
  const total = spec.traits.filter((t) => t.block === bloco).length;
  const b = result.blocks.find((x) => x.block === bloco);
  if (!b || total === 0) return { atendidos: 0, total: 0, pct: 0, classe: 'baixa', aplicavel: false };
  const pct = r1(b.score * 100);
  return { atendidos: Math.round(b.score * total), total, pct, classe: classeDeBanda(b.band), aplicavel: true };
}

/** Evidência ancorada de um knockout reprovado: traço medido + piso + consequência. */
function evidenciaDeKnockout(k: any, spec: RoleSpec, profile: Record<string, any>): KnockoutEvidencia {
  const rule = k.rule;
  if (rule.scope === 'block') {
    return {
      traco: BLOCO_LABEL[rule.key] || rule.key, bloco: rule.key, valorBruto: null, piso: null,
      consequencia: rule.label || 'requisito do bloco não atendido', ehBloco: true,
      medidoPct: Math.round((k.measured ?? 0) * 100), minPct: Math.round((rule.min ?? 0) * 100),
    };
  }
  const t: any = spec.traits.find((x: any) => x.key === rule.key && x.kind === 'band');
  return {
    traco: t?.label || rule.key,
    bloco: t?.block,
    valorBruto: Math.round(num(profile[rule.key])),
    piso: t ? t.lo : null,
    consequencia: rule.label || 'abaixo do mínimo do cargo',
    ehBloco: false,
  };
}

export async function aggregateAdequacao(sb: SupabaseClient, empresaId: string, cargo: string): Promise<AdequacaoCargo> {
  const base: AdequacaoCargo = { cargo, avaliados: 0, perfilIdeal: { caracteristicas: [], competencias: [], lideranca: [], estiloPredominante: '', disc: [], pesos: [], liderancaAplicavel: false }, pessoas: [], avisosCalibracao: [], semGabarito: false, semColaboradores: false };

  // 1) Gabarito (perfil ideal) do cargo.
  const { data: cargoRow } = await sb.from('cargos_empresa')
    .select('gabarito, eh_lideranca').eq('empresa_id', empresaId).eq('nome', cargo).limit(1).maybeSingle();
  const g = (cargoRow as any)?.gabarito;
  if (!g?.tela4) return { ...base, semGabarito: true };
  const ehLideranca = (cargoRow as any)?.eh_lideranca;

  // 2) RoleSpec (perfil ideal traduzido p/ o motor — direção/pesos/knockouts).
  const spec = buildRoleSpec(g, cargo, { ehLideranca });
  if (!spec) return { ...base, semGabarito: true };

  // Perfil ideal estruturado p/ a página "Filtros e Mapeamento" (reflete o spec).
  const caracteristicas: CaracteristicaIdeal[] = (g.tela1?.caracteristicas || []).map((c: any) => ({ par: c.par || '', polo: c.polo_escolhido || '', intensidade: c.intensidade || '' }));
  const competenciasIdeal: CompetenciaIdeal[] = spec.traits
    .filter((t) => t.block === BLOCK.COMP && t.kind === 'band')
    .map((t: any) => ({ nome: t.label || t.key, dimensao: '', min: t.lo, max: t.hi, prioridade: '', direcao: (t.direction ?? inferDirection(t.lo, t.hi)) as Direcao }));
  const liderancaIdeal = LID_KEYS.map((k) => ({ key: k, nome: (LIDERANCA as any)[k].nome, pct: num(g.tela3?.[TELA3_KEY[k]]) }));
  const discIdeal = (['D', 'I', 'S', 'C'] as const).map((f) => {
    const t: any = spec.traits.find((x) => x.block === BLOCK.DISC && x.key === f);
    const fx = t ? { min: t.lo, max: t.hi } : faixaDe(g.tela4?.[f]?.min, g.tela4?.[f]?.max);
    const direcao = (t?.direction ?? inferDirection(fx.min, fx.max)) as Direcao;
    return { fator: f, nome: FATOR_NOME[f], min: fx.min, max: fx.max, direcao };
  });
  const liderancaAplicavel = num(spec.blockWeights[BLOCK.LID]) > 0;
  const pesos = Object.entries(spec.blockWeights)
    .filter(([, w]) => num(w) > 0)
    .map(([bloco, w]) => ({ bloco: BLOCO_LABEL[bloco] || bloco, pct: Math.round(num(w) * 100) }));
  const perfilIdeal: PerfilIdeal = { caracteristicas, competencias: competenciasIdeal, lideranca: liderancaIdeal, estiloPredominante: g.tela3?.estilo_predominante || '', disc: discIdeal, pesos, liderancaAplicavel };

  // 3) Colaboradores do cargo (com DISC mapeado).
  const cols = ['id', 'nome_completo', ...candidateColumns()].join(', ');
  const { data: rows } = await excludeInternalEmails(
    sb.from('colaboradores').select(cols).eq('empresa_id', empresaId).eq('cargo', cargo).not('d_natural', 'is', null),
  ).order('nome_completo');
  if (!rows?.length) return { ...base, perfilIdeal, semColaboradores: true };

  // Guardião de calibração BILATERAL: conta, por traço (band, exceto Mapeamento),
  // quantos avaliados ZERAM (fit<5% — saturação no PISO, alvo alto demais) e quantos
  // SATURAM (fit>95% — teto, faixa frouxa que não discrimina). >50% em qualquer lado
  // → calibração suspeita. (O caso Gestão Escolar: 9 floors em 41 → todo mundo ~100%.)
  const satura = new Map<string, { z: number; s: number; n: number }>();

  const pessoas: PessoaAdequacao[] = (rows as any[]).map((x) => {
    const profile = buildCandidateProfile(x, g);
    const result = scoreCandidate(spec, profile);
    for (const t of result.traits) {
      if (t.block === BLOCK.MAP) continue;
      const acc = satura.get(t.label) || { z: 0, s: 0, n: 0 };
      acc.n++; if (t.fit < 0.05) acc.z++; if (t.fit > 0.95) acc.s++;
      satura.set(t.label, acc);
    }

    // DISC (4): score + faixa + classe (pela banda do fit do traço).
    const disc: DiscFator[] = discIdeal.map((d) => {
      const ts = result.traits.find((t) => t.block === BLOCK.DISC && t.key === d.fator);
      const score = Number(profile[d.fator]) || 0;
      const band = ts ? colorBand(ts.fit) : 'vermelho';
      return { fator: d.fator, score: Math.round(score), min: d.min, max: d.max, dentro: score >= d.min && score <= d.max, classe: classeDeBanda(band) };
    });

    const beta: SubScore = { atendidos: 0, total: 0, pct: result.betaPct, classe: classeDeBanda(result.betaBand), aplicavel: true };
    const knockoutMotivos = result.knockouts.filter((k) => !k.passed).map((k) => k.rule.label || `${BLOCO_LABEL[k.rule.key] || k.rule.key} abaixo do mínimo`);
    const knockoutEvidencias = result.knockouts.filter((k) => !k.passed).map((k) => evidenciaDeKnockout(k, spec, profile));
    // Gaps p/ desenvolvimento: traços abaixo do alvo (exclui Mapeamento — lente de DISC, não competência desenvolvível).
    const specByKey = new Map(spec.traits.map((t) => [t.key, t as any]));
    const gaps: TraitGap[] = result.traits
      .filter((t) => t.block !== BLOCK.MAP && t.fit < 0.75)
      .map((t) => {
        const st = specByKey.get(t.key);
        const raw = typeof t.raw === 'number' ? t.raw : null;
        let lado: 'abaixo' | 'acima' | null = null;
        if (raw != null && st && st.kind === 'band') lado = raw < st.lo ? 'abaixo' : raw > st.hi ? 'acima' : null;
        return { traco: t.label, bloco: BLOCO_LABEL[t.block] || t.block, fitPct: Math.round(t.fit * 100), direcao: st?.direction, valorBruto: raw, lo: st?.lo ?? null, hi: st?.hi ?? null, lado };
      })
      .sort((a, b) => a.fitPct - b.fitPct)
      .slice(0, 6);

    // Por-traço (band: competência + DISC) p/ o snapshot — fonte do ρ/saturação engine-free.
    const tracos = result.traits
      .filter((t) => { const st = specByKey.get(t.key); return st && st.kind === 'band'; })
      .map((t) => {
        const st = specByKey.get(t.key);
        return { key: t.key, label: t.label, bloco: BLOCO_LABEL[t.block] || t.block, direcao: st?.direction as ('floor' | 'target' | 'ceiling' | undefined), lo: st?.lo ?? null, hi: st?.hi ?? null, bruto: typeof t.raw === 'number' ? t.raw : null, fitPct: Math.round(t.fit * 100) };
      });

    return {
      id: x.id,
      tracos,
      nome: x.nome_completo || 'Colaborador',
      disc,
      mapeamento: subDoBloco(result, BLOCK.MAP, spec),
      competencia: subDoBloco(result, BLOCK.COMP, spec),
      lideranca: subDoBloco(result, BLOCK.LID, spec),
      discScore: subDoBloco(result, BLOCK.DISC, spec),
      beta,
      recomendacao: result.recommendation,
      recomendacaoLabel: RECOMMENDATION_LABEL[result.recommendation],
      status: result.status,
      statusLabel: STATUS_LABEL[result.status],
      borderline: result.borderline,
      betaSemDelta: result.semDeltaPct,
      knockoutFailed: result.knockoutFailed,
      knockoutMotivos,
      knockoutEvidencias,
      origemBloqueio: origemBloqueio(knockoutEvidencias),
      origemBloqueioLabel: (() => { const o = origemBloqueio(knockoutEvidencias); return o ? LABEL_ORIGEM[o] : null; })(),
      gaps,
    };
  }).sort((a, b) => {
    // Reprovados por eliminatória vão pro fim (consistente com o ranking do Fit).
    const ka = a.recomendacao === 'nao_recomendado' ? 1 : 0;
    const kb = b.recomendacao === 'nao_recomendado' ? 1 : 0;
    if (ka !== kb) return ka - kb;
    return b.beta.pct - a.beta.pct;
  });

  const avisosCalibracao = [...satura.entries()]
    .flatMap(([traco, v]) => {
      if (!v.n) return [];
      const out: { traco: string; pct: number; tipo: 'piso' | 'teto' }[] = [];
      if (v.z / v.n > 0.5) out.push({ traco, pct: Math.round((v.z / v.n) * 100), tipo: 'piso' }); // zera (alvo alto demais)
      if (v.s / v.n > 0.5) out.push({ traco, pct: Math.round((v.s / v.n) * 100), tipo: 'teto' }); // satura (faixa frouxa, não discrimina)
      return out;
    })
    // Piso (gente zerando) é mais acionável que teto → vem primeiro; depois por %.
    // Capa em 6: um gabarito muito frouxo pode saturar quase tudo (Gestão Escolar: 12)
    // e a lista inteira afogaria o sinal. O top-6 mostra os piores.
    .sort((a, b) => (a.tipo === b.tipo ? b.pct - a.pct : a.tipo === 'piso' ? -1 : 1))
    .slice(0, 6);

  return { cargo, avaliados: pessoas.length, perfilIdeal, pessoas, avisosCalibracao, semGabarito: false, semColaboradores: false };
}
