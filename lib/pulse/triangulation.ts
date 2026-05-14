/**
 * Triangulação Pulso × Sinais — produz aceleradores, bloqueadores,
 * alertas e recomendações a partir de regras simples (sem IA nesta etapa).
 *
 * A IA dual entra na Etapa 4.5 pra classificar texto aberto e auditar.
 * Aqui usamos apenas dados quantitativos (médias e deltas).
 *
 * Linguagem: cautelosa (Há sinais de…, Os dados sugerem…) — evita absoluto.
 */

import { DIMENSIONS, type DimensionKey } from './template';
import type { DimensionRow } from '@/actions/pulse/dashboard';
import type { SignalScore } from './signal-scoring';
import { SIGNAL_LABELS } from './signal-scoring';

export interface TriangulationItem {
  title: string;
  detail: string;
  dimensions: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface TriangulationOutput {
  summary: string;
  accelerators: TriangulationItem[];
  blockers: TriangulationItem[];
  alerts: TriangulationItem[];
  recommendations: TriangulationItem[];
  divergences: TriangulationItem[];
  confidence_level: 'high' | 'medium' | 'low';
}

const DIM_LABEL = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.name])) as Record<DimensionKey, string>;

function vigente(d: DimensionRow): number | null { return d.t2 ?? d.t0; }

/**
 * Roda a triangulação. Não escreve no banco — só retorna o objeto.
 * Caller decide se cacheia em `pulse_triangulations` (Etapa 4.5).
 */
export function triangulate(
  dimensions: DimensionRow[],
  signals: SignalScore[],
  contexto: { n_t0: number; n_t2: number },
): TriangulationOutput {
  const accelerators: TriangulationItem[] = [];
  const blockers: TriangulationItem[] = [];
  const alerts: TriangulationItem[] = [];
  const recommendations: TriangulationItem[] = [];
  const divergences: TriangulationItem[] = [];

  // Confiança geral
  const temT2 = contexto.n_t2 >= 7;
  const temT0 = contexto.n_t0 >= 7;
  const confidence_level: 'high' | 'medium' | 'low' =
    (temT0 && temT2) ? 'high' : (temT0 || temT2) ? 'medium' : 'low';

  // ─── Aceleradores: dimensões com score alto E (delta positivo OU sinais altos)
  for (const d of dimensions) {
    const score = vigente(d);
    if (score == null) continue;
    if (score >= 4.0 && (d.delta == null || d.delta >= 0)) {
      accelerators.push({
        title: `${d.dimension_name} forte`,
        detail: `Score ${score.toFixed(2)}${d.delta != null ? ` (Δ ${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)})` : ''}. Há sinais de que essa dimensão sustenta o ambiente de desenvolvimento.`,
        dimensions: [d.dimension_name],
        confidence: temT2 ? 'medium' : 'low',
      });
    }
  }

  // ─── Bloqueadores: dimensões com score baixo
  for (const d of dimensions) {
    const score = vigente(d);
    if (score == null) continue;
    if (score < 3.0) {
      blockers.push({
        title: `${d.dimension_name} requer atenção`,
        detail: `Score ${score.toFixed(2)}. Os dados sugerem que essa dimensão pode estar limitando o desenvolvimento da equipe.`,
        dimensions: [d.dimension_name],
        confidence: 'medium',
      });
    }
  }

  // ─── Alertas: dimensões com queda significativa
  for (const d of dimensions) {
    if (d.delta != null && d.delta <= -0.4) {
      alerts.push({
        title: `Recuo em ${d.dimension_name}`,
        detail: `Queda de ${Math.abs(d.delta).toFixed(2)} entre T0 e T2. Recomenda-se investigar o que mudou no período.`,
        dimensions: [d.dimension_name],
        confidence: 'medium',
      });
    }
  }

  // ─── Sinais comportamentais
  for (const s of signals) {
    if (s.score <= 2) {
      blockers.push({
        title: `${SIGNAL_LABELS[s.signal]} abaixo do esperado`,
        detail: `Indicador comportamental sinaliza nível baixo (${s.score}/5). Pode afetar ${s.dimensions.map(k => DIM_LABEL[k]).join(', ')}.`,
        dimensions: s.dimensions.map(k => DIM_LABEL[k]),
        confidence: 'low',
      });
    } else if (s.score >= 4) {
      accelerators.push({
        title: `${SIGNAL_LABELS[s.signal]} consistente`,
        detail: `Indicador comportamental positivo (${s.score}/5). Reforça as dimensões ${s.dimensions.map(k => DIM_LABEL[k]).join(', ')}.`,
        dimensions: s.dimensions.map(k => DIM_LABEL[k]),
        confidence: 'low',
      });
    }
  }

  // ─── Divergências: pulso alto + sinais baixos (ou vice-versa)
  const declaradoMedio = dimensions.reduce((acc, d) => {
    const s = vigente(d);
    return s != null ? acc + s : acc;
  }, 0) / Math.max(1, dimensions.filter(d => vigente(d) != null).length);

  const comportamentalMedio = signals.length
    ? signals.reduce((acc, s) => acc + s.score, 0) / signals.length
    : 0;

  if (Math.abs(declaradoMedio - comportamentalMedio) >= 1.0 && signals.length > 0) {
    if (declaradoMedio > comportamentalMedio) {
      divergences.push({
        title: 'Percepção declarada acima do comportamento observado',
        detail: `Pulso médio ${declaradoMedio.toFixed(2)} vs. sinais comportamentais ${comportamentalMedio.toFixed(2)}. Há indícios de desejabilidade social ou de barreiras práticas não declaradas.`,
        dimensions: ['Geral'],
        confidence: 'low',
      });
    } else {
      divergences.push({
        title: 'Comportamento observado acima da percepção declarada',
        detail: `Sinais comportamentais ${comportamentalMedio.toFixed(2)} vs. Pulso ${declaradoMedio.toFixed(2)}. Há esforço individual, mas o ambiente pode estar limitando a sustentação.`,
        dimensions: ['Geral'],
        confidence: 'low',
      });
    }
  }

  // ─── Recomendações por dimensão crítica
  const dimCriticas = [...dimensions].filter(d => vigente(d) != null && vigente(d)! < 3.5);
  for (const d of dimCriticas.slice(0, 3)) {
    recommendations.push(getRecommendation(d.dimension_key as DimensionKey, vigente(d)!));
  }
  if (recommendations.length === 0 && dimensions.some(d => vigente(d) != null)) {
    recommendations.push({
      title: 'Sustentar o que está funcionando',
      detail: 'Os dados sugerem ambiente parcialmente favorável. Recomenda-se reforçar rituais existentes (feedback, acompanhamento de PDI) e monitorar próximos pulsos.',
      dimensions: ['Geral'],
      confidence: 'medium',
    });
  }

  // Summary executiva
  const dimForte = [...dimensions].filter(d => vigente(d) != null).sort((a, b) => vigente(b)! - vigente(a)!)[0];
  const dimFraca = [...dimensions].filter(d => vigente(d) != null).sort((a, b) => vigente(a)! - vigente(b)!)[0];
  const partes: string[] = [];
  if (dimForte && dimFraca && dimForte.dimension_key !== dimFraca.dimension_key) {
    partes.push(`A equipe sustenta ${dimForte.dimension_name.toLowerCase()} (${vigente(dimForte)!.toFixed(2)})`);
    partes.push(`mas mantém baixa percepção de ${dimFraca.dimension_name.toLowerCase()} (${vigente(dimFraca)!.toFixed(2)})`);
  }
  if (declaradoMedio > 0 && comportamentalMedio > 0 && Math.abs(declaradoMedio - comportamentalMedio) >= 1.0) {
    partes.push(`Há divergência entre declarado e comportamento observado`);
  }
  const summary = partes.length > 0
    ? partes.join('. ') + '.'
    : 'Dados ainda insuficientes para leitura consolidada.';

  return {
    summary,
    accelerators: accelerators.slice(0, 5),
    blockers: blockers.slice(0, 5),
    alerts: alerts.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    divergences,
    confidence_level,
  };
}

function getRecommendation(dim: DimensionKey, score: number): TriangulationItem {
  const recipes: Record<DimensionKey, { title: string; detail: string }> = {
    clareza: {
      title: 'Reforçar clareza de papel',
      detail: 'Recomenda-se rituais de alinhamento de expectativas — 1:1s estruturados, descritivos de cargo revisados, OKRs/metas com critérios de sucesso explícitos.',
    },
    condicoes: {
      title: 'Revisar condições de execução',
      detail: 'Os sinais sugerem barreira de tempo ou recursos. Mapear ferramentas, carga e dependências bloqueando a aplicação prática.',
    },
    lideranca: {
      title: 'Fortalecer cadência de feedback',
      detail: 'Recomenda-se reforçar feedbacks úteis e acompanhamento consistente do PDI. Avaliar capacitação de lideranças em conversas de desenvolvimento.',
    },
    seguranca_aprender: {
      title: 'Cultivar ambiente de aprendizado',
      detail: 'Há indícios de baixa segurança pra pedir ajuda ou errar. Recomenda-se rituais de retrospectiva, normalizar dúvidas em fórum aberto, reduzir punição por experimentação.',
    },
    aplicacao_pratica: {
      title: 'Conectar aprendizado ao dia a dia',
      detail: 'Recomenda-se vincular missões/conteúdos a desafios reais da rotina, com checkpoints de aplicação prática (semana 4, 8, 12).',
    },
    futuro_permanencia: {
      title: 'Comunicar trilha de evolução',
      detail: 'Os dados sugerem percepção baixa de futuro. Recomenda-se transparência sobre planos de carreira, reconhecimento estruturado e mobilidade interna.',
    },
  };
  return {
    title: recipes[dim].title,
    detail: recipes[dim].detail,
    dimensions: [DIM_LABEL[dim]],
    confidence: score < 3 ? 'medium' : 'low',
  };
}
