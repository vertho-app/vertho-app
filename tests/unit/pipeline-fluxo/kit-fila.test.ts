import { describe, it, expect, vi } from 'vitest';

const levantar = vi.fn();
vi.mock('@/lib/season-engine/kit/plano-coorte', () => ({ levantarPlanoKitsCoorte: (...a: any[]) => levantar(...a) }));

import { filaKitEscopo } from '@/lib/pipeline-fluxo/kit';

const it1 = (cargo: string, faltantes: string[], competencia = 'c') => ({ competencia, descritor: 'd', cargo, faltantes, demandadas: [], existentes: [], pessoas: 1, contexto: 'g', nivelMin: 1, nivelMax: 2, briefExistente: false, semanas: [1], discsPorSemana: [] });

/**
 * A fila do kit é a varredura do botão da coorte, recortada pelo escopo do fluxo. O que importa: só entra tema com DISC
 * faltando, cargo filtra, "sem trilha" é fila vazia, e QUALQUER outro erro lança (fila que falha não pode virar vazia).
 */
describe('filaKitEscopo', () => {
  it('só temas com DISC faltando; cargo filtra; turma vira recorte do plano', async () => {
    levantar.mockResolvedValue({ plano: [it1('CAIXA', ['D']), it1('GERENTE', ['I', 'S'], 'c2'), it1('CAIXA', [], 'c3')], totalFaltantes: 3, colaboradores: 5, inicioMaisCedo: null });
    const todos = await filaKitEscopo({}, 'e1', { turmaId: 't1' });
    expect(todos.map((i) => i.competencia)).toEqual(['c', 'c2']);
    expect(levantar).toHaveBeenCalledWith({}, 'e1', { turmaId: 't1' });
    const soCaixa = await filaKitEscopo({}, 'e1', { cargos: ['CAIXA'] });
    expect(soCaixa.map((i) => i.competencia)).toEqual(['c']);
  });

  it.each(['Nenhuma semana de conteúdo encontrada na coorte', 'Empresa sem colaboradores', 'Turma sem colaboradores'])('"%s" é fila vazia, não erro', async (msg) => {
    levantar.mockResolvedValue({ error: msg });
    expect(await filaKitEscopo({}, 'e1', {})).toEqual([]);
  });

  it('erro de leitura LANÇA (não vira fila vazia)', async () => {
    levantar.mockResolvedValue({ error: 'Falha ao ler os kits publicados: timeout' });
    await expect(filaKitEscopo({}, 'e1', {})).rejects.toThrow(/timeout/);
  });
});
