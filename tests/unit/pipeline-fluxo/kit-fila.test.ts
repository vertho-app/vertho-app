import { describe, it, expect, vi } from 'vitest';

const levantar = vi.fn();
vi.mock('@/lib/season-engine/kit/plano-coorte', () => ({ levantarPlanoKitsCoorte: (...a: any[]) => levantar(...a) }));

import { filaKitEscopo } from '@/lib/pipeline-fluxo/kit';

const it1 = (cargo: string, faltantes: string[], competencia = 'c') => ({ competencia, descritor: 'd', cargo, faltantes, demandadas: [], existentes: [], pessoas: 1, contexto: 'g', nivelMin: 1, nivelMax: 2, briefExistente: false, semanas: [1], discsPorSemana: [], formatosPorDisc: {} });

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

describe('filaKitEscopo: formatos por DISC (2 primeiros das preferências)', () => {
  const comFormatos = (faltantes: string[], porDisc: Record<string, { formatos: string[]; video: boolean }>) => ({ ...it1('CAIXA', faltantes), formatosPorDisc: Object.fromEntries(Object.entries(porDisc).map(([d, v]) => [d, { ...v, semPreferencia: 0 }])) });

  it('DISC com o mesmo conjunto de formatos ficam num job; conjuntos diferentes viram jobs separados', async () => {
    levantar.mockResolvedValue({ plano: [comFormatos(['D', 'I', 'S'], {
      D: { formatos: ['texto', 'case'], video: false },
      I: { formatos: ['texto', 'case'], video: false },
      S: { formatos: ['audio', 'texto'], video: true },
    })], totalFaltantes: 3, colaboradores: 3, inicioMaisCedo: null });
    const r = await filaKitEscopo({}, 'e1', {});
    expect(r).toHaveLength(2);
    expect(r.find((i) => i.faltantes.includes('D'))).toMatchObject({ faltantes: ['D', 'I'], formatos: ['texto', 'case'], video: false });
    expect(r.find((i) => i.faltantes.includes('S'))).toMatchObject({ faltantes: ['S'], formatos: ['audio', 'texto'], video: true });
  });

  it('mesmos formatos mas vídeo diferente também separam (a decisão de vídeo é por job)', async () => {
    levantar.mockResolvedValue({ plano: [comFormatos(['D', 'I'], { D: { formatos: ['texto'], video: true }, I: { formatos: ['texto'], video: false } })], totalFaltantes: 2, colaboradores: 2, inicioMaisCedo: null });
    expect(await filaKitEscopo({}, 'e1', {})).toHaveLength(2);
  });

  it('DISC sem decisão de formatos no plano cai em texto + caso, sem vídeo', async () => {
    levantar.mockResolvedValue({ plano: [{ ...it1('CAIXA', ['D']), formatosPorDisc: {} }], totalFaltantes: 1, colaboradores: 1, inicioMaisCedo: null });
    expect((await filaKitEscopo({}, 'e1', {}))[0]).toMatchObject({ formatos: ['texto', 'case'], video: false });
  });
});

describe('filaKitEscopo: limite de semana (piloto)', () => {
  it('passa semanaMax ao plano da coorte; sem limite, não manda a chave (horizonte inteiro)', async () => {
    levantar.mockResolvedValue({ plano: [], totalFaltantes: 0, colaboradores: 1, inicioMaisCedo: null });
    await filaKitEscopo({}, 'e1', { semanaMax: 1 });
    expect(levantar).toHaveBeenLastCalledWith({}, 'e1', { turmaId: undefined, semanaMax: 1 });
    await filaKitEscopo({}, 'e1', {});
    expect(levantar).toHaveBeenLastCalledWith({}, 'e1', { turmaId: undefined });
  });
});
