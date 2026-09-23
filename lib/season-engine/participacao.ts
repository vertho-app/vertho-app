/**
 * Participação da temporada — critério de emissão do Certificado de Conclusão.
 *
 * Regra (produto, 23/07/2026): certificado só para temporada CONCLUÍDA com
 * ≥ 75% das semanas do plano com pelo menos 1 entrega real:
 *   - semana de CONTEÚDO  → entrega = `reflexao` preenchida;
 *   - semana de APLICAÇÃO (missão) / AVALIAÇÃO (cenário B) → entrega = `feedback`.
 *
 * O denominador é o nº de semanas do `temporada_plano`, NUNCA hardcoded. Esse
 * tamanho NÃO é a duração do programa (medido 22/09/2026: jornada 7, regular_duo
 * 9 para um programa de 14 semanas), por isso a carga horária usa a config, não
 * o plano. Piloto (degustação) NÃO emite certificado — ver isTrilhaPiloto.
 *
 * Função PURA (sem Supabase): as queries ficam no loader (actions/certificado.ts).
 */

export const PARTICIPACAO_MINIMA = 0.75;

/**
 * Carga horária impressa no certificado: PROPORCIONAL à duração do programa da
 * temporada, 48h a cada 14 semanas (decisão do dono, 23/09/2026).
 *
 * Até essa data eram 48h fixas por temporada, calibradas quando temporada = 14
 * semanas. Com a Jornada de 7 semanas a mesma pessoa saía com 2 × 48h no período
 * que antes valia 48h. Agora: Jornada 7 = 24h, programa de 14 = 48h, Onboarding
 * 10 = 34h, Personalizado de N semanas = 48N/14 arredondado.
 *
 * A duração vem da CONFIG do programa (`ProgramaConfig.semanas`, pelo carimbo ou
 * pelo snapshot do Personalizado), não do `temporada_plano`: nas trilhas
 * `regular_duo` o plano tem 9 entradas para um programa de 14 semanas (medido em
 * 22/09/2026), e contar o plano daria 31h em vez de 48h.
 */
export const CARGA_REFERENCIA = { horas: 48, semanas: 14 } as const;

export function cargaHorariaDoCertificado(semanasDoPrograma: number): number {
  if (!Number.isFinite(semanasDoPrograma) || semanasDoPrograma <= 0) {
    // Número impresso num documento formal: sem duração válida, não se inventa um.
    throw new Error(`duração do programa inválida para a carga do certificado: ${semanasDoPrograma}`);
  }
  return Math.round((CARGA_REFERENCIA.horas * semanasDoPrograma) / CARGA_REFERENCIA.semanas);
}

export interface ProgressoSemana {
  semana: number;
  tipo?: string | null;
  reflexao?: Record<string, unknown> | null;
  feedback?: Record<string, unknown> | null;
}

export interface Participacao {
  semanasComEntrega: number;
  totalSemanas: number;
  /** 0..1 */
  pct: number;
  elegivel: boolean;
}

function preenchido(v: unknown): boolean {
  return !!v && typeof v === 'object' && Object.keys(v as object).length > 0;
}

function temEntrega(p: ProgressoSemana): boolean {
  if (p.tipo === 'conteudo') return preenchido(p.reflexao);
  // aplicacao / avaliacao (e qualquer tipo futuro): feedback é a entrega;
  // reflexao preenchida conta como fallback defensivo.
  return preenchido(p.feedback) || preenchido(p.reflexao);
}

export function calcularParticipacao(
  plano: Array<{ semana?: number } | null> | null | undefined,
  progressos: ProgressoSemana[] | null | undefined,
): Participacao {
  const semanas = (Array.isArray(plano) ? plano : [])
    .map((s) => s?.semana)
    .filter((n): n is number => typeof n === 'number');
  const totalSemanas = semanas.length;
  if (!totalSemanas) return { semanasComEntrega: 0, totalSemanas: 0, pct: 0, elegivel: false };

  const entregues = new Set((progressos || []).filter(temEntrega).map((p) => p.semana));
  const semanasComEntrega = semanas.filter((s) => entregues.has(s)).length;
  const pct = semanasComEntrega / totalSemanas;
  return { semanasComEntrega, totalSemanas, pct, elegivel: pct >= PARTICIPACAO_MINIMA };
}

/**
 * Piloto (degustação de 2 semanas) NÃO emite certificado — decisão de produto.
 * Checa os DOIS sinais persistidos: o carimbo da geração (programa_modo) e o
 * modo gravado no evolution_report (evolution-report-core.ts, branch piloto).
 */
export function isTrilhaPiloto(trilha: {
  programa_modo?: string | null;
  evolution_report?: { modo?: string } | null;
}): boolean {
  return trilha.programa_modo === 'piloto' || trilha.evolution_report?.modo === 'piloto';
}
