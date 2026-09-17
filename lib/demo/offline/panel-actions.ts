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
  if (!demo.panels.team.rows.some(row => row.colabEmail === key)) return { error: 'Pessoa fora desta equipe.' };
  return demo.panels.details[key] || { error: 'Esta jornada ainda não está concluída.' };
}
export async function listarCargosComRanking() {
  return { cargos: Object.keys(demo.panels.rankings).sort((a,b) => a.localeCompare(b)) };
}
export async function getRankingAdequacao(cargo: string) {
  return demo.panels.rankings[cargo] || { success: false, error: 'Cargo sem ranking no pacote de demonstração.' };
}
export async function exportarRankingPDF(cargo: string) {
  const path = demo.panels.rankings[cargo]?.pdfPath;
  return path ? { success: true, url: ENVIRONMENT.base + path } : { success: false, error: 'PDF não incluído neste pacote.' };
}
