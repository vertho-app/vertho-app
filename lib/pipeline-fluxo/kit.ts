import { levantarPlanoKitsCoorte } from '@/lib/season-engine/kit/plano-coorte';
import type { KitItem } from './executor';

/**
 * Kits que FALTAM para as trilhas já montadas (`levantarPlanoKitsCoorte`, a mesma varredura do botão da coorte), no
 * escopo do fluxo: turma entra como recorte do plano; cargos filtram os temas (o plano é por tema × CARGO). `sb` tem
 * que ser o client RAW: a varredura precisa enxergar também os kits GLOBAIS (`empresa_id` nulo), que `tenantDb` esconde.
 * Sem trilha (ou sem pessoas no recorte) não é erro: é fila vazia. Qualquer outro erro LANÇA.
 * Cada item leva os formatos da célula (2 primeiros das preferências, `formatos-por-preferencia.ts`) e se tem vídeo.
 */
export async function filaKitEscopo(sb: any, empresaId: string, escopo: { turmaId?: string | null; cargos?: string[] | null }): Promise<KitItem[]> {
  const plano = await levantarPlanoKitsCoorte(sb, empresaId, { turmaId: escopo.turmaId || undefined });
  if ('error' in plano) {
    if (/^(Nenhuma semana|Empresa sem|Turma sem)/.test(plano.error)) return [];
    throw new Error(`fila do kit: ${plano.error}`);
  }
  const cargos = new Set((escopo.cargos || []).filter(Boolean));
  const itens: KitItem[] = [];
  for (const i of plano.plano) {
    if (i.faltantes.length === 0 || (cargos.size > 0 && !cargos.has(i.cargo))) continue;
    // DISC do MESMO tema com conjuntos de formatos diferentes viram jobs separados: cada job leva UM conjunto de
    // formatos (preferências de aprendizagem de quem está em cada célula) e UMA decisão de vídeo.
    const grupos = new Map<string, { formatos: string[]; video: boolean; faltantes: string[] }>();
    for (const disc of i.faltantes) {
      const f = i.formatosPorDisc[disc];
      const formatos = f?.formatos?.length ? f.formatos : ['texto', 'case'];
      const video = !!f?.video;
      const chave = `${formatos.join(',')}|${video}`;
      const g = grupos.get(chave) || { formatos, video, faltantes: [] };
      g.faltantes.push(disc);
      grupos.set(chave, g);
    }
    for (const g of grupos.values()) {
      itens.push({ competencia: i.competencia, descritor: i.descritor, cargo: i.cargo, faltantes: g.faltantes, formatos: g.formatos, video: g.video, contexto: i.contexto, nivelMin: i.nivelMin, nivelMax: i.nivelMax });
    }
  }
  return itens;
}
