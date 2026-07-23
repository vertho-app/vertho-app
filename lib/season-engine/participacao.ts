/**
 * Participação da temporada — critério de emissão do Certificado de Conclusão.
 *
 * Regra (produto, 23/07/2026): certificado só para temporada CONCLUÍDA com
 * ≥ 75% das semanas do plano com pelo menos 1 entrega real:
 *   - semana de CONTEÚDO  → entrega = `reflexao` preenchida;
 *   - semana de APLICAÇÃO (missão) / AVALIAÇÃO (cenário B) → entrega = `feedback`.
 *
 * O denominador é o nº de semanas do `temporada_plano` (regular=14, onboarding=10),
 * NUNCA hardcoded. Piloto (degustação) NÃO emite certificado — ver isTrilhaPiloto.
 *
 * Função PURA (sem Supabase): as queries ficam no loader (actions/certificado.ts).
 */

export const PARTICIPACAO_MINIMA = 0.75;

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
