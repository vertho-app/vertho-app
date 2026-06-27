/**
 * Mapa traço → trilha de Mentor IA (T3 — Plano de Desenvolvimento).
 *
 * ⚠️ O catálogo real de trilhas do Mentor IA por traço AINDA NÃO EXISTE no código.
 * Conforme guardrail (não fabricar conteúdo psicológico/trilha), a interface está
 * tipada e o lookup retorna null até haver um mapeamento real. O PDF renderiza
 * "trilha a definir" quando null — nunca inventa uma trilha.
 *
 * TODO: popular MAPA_TRILHAS quando o catálogo do Mentor IA estiver disponível
 * (traço/competência → módulo/trilha + url), com curadoria humana.
 */
export interface TrilhaMentorIA {
  id: string;
  titulo: string;
  url?: string;
}

const MAPA_TRILHAS: Record<string, TrilhaMentorIA> = {
  // TODO: ex. 'comp_persuasao': { id: '...', titulo: 'Persuasão e fechamento', url: '...' }
};

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Trilha do Mentor IA para um traço (por key comp_* ou nome). null = ainda não mapeado. */
export function trilhaParaTraco(tracoOuKey: string): TrilhaMentorIA | null {
  return MAPA_TRILHAS[tracoOuKey] || MAPA_TRILHAS[norm(tracoOuKey)] || null;
}
