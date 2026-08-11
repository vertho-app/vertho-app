import { describe, it, expect } from 'vitest';
import { montarListaWorkshop, normalizarComp } from '@/lib/workshop-competencias';

// Caso real que motivou o helper (Macaé, cargo Professor(a), 11/08/2026): a
// Top 10 da IA1 é TCH01..TCH13 menos TCH12, e TCH12 ("Autocuidado e bem-estar
// profissional") é a competência FOCO do piloto. Enquanto a curadoria listava
// só a Top 10, a única forma de selecioná-la era inflar o ranking da IA.
const TOP10_PROFESSOR = [
  'Gestão da Aprendizagem',
  'Planejamento e intencionalidade pedagógica',
  'Didática e estratégias de ensino',
];
const CATALOGO_PROFESSOR = [
  ...TOP10_PROFESSOR,
  'Autocuidado e bem-estar profissional',
  'Fluência Digital',
];

describe('lista de competências do workshop', () => {
  it('oferece competência do cargo que ficou fora da Top 10', () => {
    const { workshop, catalogoExtra } = montarListaWorkshop({
      top10: TOP10_PROFESSOR,
      catalogo: CATALOGO_PROFESSOR,
    });
    expect(workshop).toContain('Autocuidado e bem-estar profissional');
    expect(catalogoExtra).toEqual(['Autocuidado e bem-estar profissional', 'Fluência Digital']);
  });

  it('não repete a competência que já está na Top 10', () => {
    const { workshop } = montarListaWorkshop({ top10: TOP10_PROFESSOR, catalogo: CATALOGO_PROFESSOR });
    const ocorrencias = workshop.filter((c) => c === 'Gestão da Aprendizagem');
    expect(ocorrencias).toHaveLength(1);
    expect(workshop).toHaveLength(5);
  });

  it('mantém a ordem das fontes: Top 10 → votadas → catálogo → já selecionadas', () => {
    const { workshop } = montarListaWorkshop({
      top10: ['A'],
      votadas: ['B'],
      catalogo: ['C'],
      selecionadas: ['D'],
    });
    expect(workshop).toEqual(['A', 'B', 'C', 'D']);
  });

  it('trata grafias divergentes como a MESMA competência', () => {
    // A votação guarda o texto digitado; sem normalizar, o mesmo item aparece
    // duas vezes e o admin marca um dos dois sem saber qual conta.
    const { workshop, votadasExtra } = montarListaWorkshop({
      top10: ['Gestão de sala e rotinas'],
      votadas: ['  GESTÃO DE SALA E ROTINAS '],
    });
    expect(votadasExtra).toEqual([]);
    expect(workshop).toEqual(['Gestão de sala e rotinas']);
  });

  it('mantém visível o que já está salvo mesmo fora de todas as fontes', () => {
    // top5_workshop é o que o mapeamento e a fila da IA3 leem: sumir da tela
    // sem sumir do banco faria o admin salvar por cima sem perceber.
    const { workshop } = montarListaWorkshop({
      top10: ['A'],
      selecionadas: ['Competência de um catálogo antigo'],
    });
    expect(workshop).toEqual(['A', 'Competência de um catálogo antigo']);
  });

  it('descarta vazios e não quebra sem fonte nenhuma', () => {
    expect(montarListaWorkshop({}).workshop).toEqual([]);
    expect(montarListaWorkshop({ top10: ['', '   '], catalogo: ['X'] }).workshop).toEqual(['X']);
  });

  it('normalizarComp tolera nulo/indefinido', () => {
    expect(normalizarComp(null)).toBe('');
    expect(normalizarComp(undefined)).toBe('');
    expect(normalizarComp('  Foo BAR ')).toBe('foo bar');
  });
});
