import { describe, expect, it } from 'vitest';
import { aplicarFiltro, FILTROS_ACAO } from '@/lib/gestor/filtro-equipe';

describe('destinos dos cartões de ação do RH', () => {
  const equipe = [
    { colabId: 'ana', status: 'sem_trilha', motivoSemTrilha: 'sem_perfil' },
    { colabId: 'paulo', status: 'sem_trilha', motivoSemTrilha: 'sem_mapeamento' },
    { colabId: 'maria', status: 'sem_trilha', motivoSemTrilha: 'aguardando_geracao' },
    { colabId: 'rafael', status: 'em_andamento', atrasada: true },
    { colabId: 'bruna', status: 'em_andamento', atrasada: false },
    { colabId: 'lucas', status: 'concluida', atrasada: false },
  ];
  it.each([
    ['sem_perfil', ['ana']], ['sem_mapeamento', ['paulo']],
    ['aguardando_geracao', ['maria']], ['atrasada', ['rafael']],
  ] as const)('abre somente o grupo %s', (filtro, ids) => {
    expect(aplicarFiltro(equipe, filtro).map(e => e.colabId)).toEqual(ids);
  });
  it('limpar o recorte restaura a equipe completa sem mutar a lista', () => {
    const original = structuredClone(equipe);
    for (const filtro of FILTROS_ACAO) aplicarFiltro(equipe, filtro);
    expect(aplicarFiltro(equipe, 'todos')).toEqual(original);
    expect(equipe).toEqual(original);
  });
  it('preserva o recorte autorizado e retorna vazio para grupos ausentes', () => {
    expect(aplicarFiltro([equipe[4]], 'atrasada')).toEqual([]);
    expect(aplicarFiltro([], 'todos')).toEqual([]);
    expect(aplicarFiltro(equipe, 'em_andamento').map(e => e.colabId)).toEqual(['rafael', 'bruna']);
  });
});
