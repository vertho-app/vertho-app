import { levantarPlanoKitsCoorte } from '@/lib/season-engine/kit/plano-coorte';
import type { KitItem } from './executor';

/**
 * Kits que FALTAM para as trilhas já montadas (`levantarPlanoKitsCoorte`, a mesma varredura do botão da coorte), no
 * escopo do fluxo: turma entra como recorte do plano; cargos filtram os temas (o plano é por tema × CARGO). `sb` tem
 * que ser o client RAW: a varredura precisa enxergar também os kits GLOBAIS (`empresa_id` nulo), que `tenantDb` esconde.
 * Sem trilha (ou sem pessoas no recorte) não é erro: é fila vazia. Qualquer outro erro LANÇA.
 */
export async function filaKitEscopo(sb: any, empresaId: string, escopo: { turmaId?: string | null; cargos?: string[] | null }): Promise<KitItem[]> {
  const plano = await levantarPlanoKitsCoorte(sb, empresaId, { turmaId: escopo.turmaId || undefined });
  if ('error' in plano) {
    if (/^(Nenhuma semana|Empresa sem|Turma sem)/.test(plano.error)) return [];
    throw new Error(`fila do kit: ${plano.error}`);
  }
  const cargos = new Set((escopo.cargos || []).filter(Boolean));
  return plano.plano
    .filter((i) => i.faltantes.length > 0 && (cargos.size === 0 || cargos.has(i.cargo)))
    .map((i) => ({ competencia: i.competencia, descritor: i.descritor, cargo: i.cargo, faltantes: i.faltantes, contexto: i.contexto, nivelMin: i.nivelMin, nivelMax: i.nivelMax }));
}
