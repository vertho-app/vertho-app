import { PROGRESSO, TRILHA } from '@/lib/status';

export const FILTROS_STATUS = ['todos', PROGRESSO.EM_ANDAMENTO, 'sem_trilha', TRILHA.CONCLUIDA] as const;
export const FILTROS_ACAO = ['sem_perfil', 'sem_mapeamento', 'aguardando_geracao', 'atrasada'] as const;
export type FiltroEquipe = (typeof FILTROS_STATUS)[number] | (typeof FILTROS_ACAO)[number];

export function aplicarFiltro(equipe: any[], filtro: FiltroEquipe) {
  if (filtro === 'todos') return equipe;
  if (filtro === 'atrasada') return equipe.filter((e) => e.atrasada === true);
  if (filtro === 'sem_perfil' || filtro === 'sem_mapeamento' || filtro === 'aguardando_geracao') {
    return equipe.filter((e) => e.motivoSemTrilha === filtro);
  }
  return equipe.filter((e) => e.status === filtro);
}
