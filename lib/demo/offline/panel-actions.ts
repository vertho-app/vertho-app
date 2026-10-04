import { ENVIRONMENT } from './environment';
import { currentLocation, demo } from './runtime';

// These are frozen outputs of the same readers used online, including each
// week/role filter. No recomputation, live queries, or fabricated activity.
function savedEngagement(role: 'manager' | 'organization', week?: number | null, cargo?: string | null) {
  const result = demo.panels.engagement[role][JSON.stringify([week || null, cargo || null])];
  if (!result) throw new Error('Este recorte não está no pacote de demonstração.');
  return result;
}
export async function getEngajamentoDoTime(week?: number | null, cargo?: string | null) {
  const role = currentLocation().role === 'organization' ? 'organization' : 'manager';
  return { ...savedEngagement(role, week, cargo), ok: true, scope: role === 'organization' ? 'rh' : 'gestor' };
}
export async function getEngajamentoRh(week?: number | null, cargo?: string | null) {
  return savedEngagement('organization', week, cargo);
}
export async function getEvolucaoEngajamentoRh(area?: string | null) {
  return demo.panels.evolution[area || ''] || { ok: false as const, error: 'Área não encontrada na demonstração.' };
}
export async function listarEquipeEvolucao() { return demo.panels.team; }
export async function loadLideradoConcluida(key: string) {
  // Mesmo contrato da action online (R-67): `codigo`, nunca texto.
  if (!demo.panels.team.rows.some(row => row.colabEmail === key)) return { ok: false as const, codigo: 'fora-do-escopo' };
  return demo.panels.details[key] || { ok: false as const, codigo: 'jornada-nao-encontrada' };
}
export async function listarCargosComRanking() {
  return { cargos: Object.keys(demo.panels.rankings).sort((a,b) => a.localeCompare(b)) };
}
export async function getRankingAdequacao(cargo: string) {
  return demo.panels.rankings[cargo] || { success: false, codigo: 'ranking-nao-gerado' };
}
export async function exportarRankingPDF(cargo: string) {
  const path = demo.panels.rankings[cargo]?.pdfPath;
  return path ? { success: true, url: ENVIRONMENT.base + path } : { success: false, codigo: 'falha-no-pdf' };
}
