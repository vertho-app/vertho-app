import { describe, it, expect } from 'vitest';
import { conteudosDoBuild, conteudosServiveisPorCargo } from '@/lib/season-engine/build-season';

/**
 * INVARIANTE: conteúdo de KIT é escrito para UM perfil DISC e é entregue SÓ pelo
 * overlay (overlayKitNaSemana), que resolve por (DISC × cargo) na LEITURA. O
 * buildSeason é CEGO A DISC: se servir conteúdo de kit, entrega o perfil de outra
 * pessoa. O overlay só corrige quando existe kit do DISC de quem lê — com cobertura
 * parcial de DISC, escapa. Medido em produção (Ibipeba, 16/07): 23 de 648 entregas
 * liam o DISC errado, 4 delas na semana 2.
 *
 * Irmão de `conteudo-isolamento-cargo`. Se a regra for afrouxada, os testes quebram.
 */
describe('isolamento de conteúdo por DISC (kit fora do build)', () => {
  const itens = [
    { id: 'kit-D', kit_id: 'k1', cargo: 'Gestão Escolar' },
    { id: 'kit-S', kit_id: 'k2', cargo: 'Gestão Escolar' },
    { id: 'generico', kit_id: null, cargo: 'Gestão Escolar' },
    { id: 'generico-2', kit_id: undefined as any, cargo: 'todos' },
  ];

  it('remove TODO conteúdo de kit — o build nunca serve conteúdo DISC-específico', () => {
    const ids = conteudosDoBuild(itens).map((c) => c.id).sort();
    expect(ids).toEqual(['generico', 'generico-2']);
    expect(ids).not.toContain('kit-D');
    expect(ids).not.toContain('kit-S');
  });

  it('trata kit_id null/undefined como conteúdo genérico (servível)', () => {
    expect(conteudosDoBuild([{ id: 'a', kit_id: null }]).map((c) => c.id)).toEqual(['a']);
    expect(conteudosDoBuild([{ id: 'b' } as any]).map((c) => c.id)).toEqual(['b']);
  });

  it('lista sem conteúdo de kit passa intacta', () => {
    const puros = [{ id: 'x', kit_id: null }, { id: 'y', kit_id: null }];
    expect(conteudosDoBuild(puros)).toHaveLength(2);
  });

  it('tolera lista vazia/nula', () => {
    expect(conteudosDoBuild([])).toEqual([]);
    expect(conteudosDoBuild(null as any)).toEqual([]);
  });

  /**
   * O cenário REAL medido: "Troca de práticas" só tem kit do DISC D publicado. Uma
   * pessoa de perfil C, mesmo cargo, caía no conteúdo do D porque o build filtra
   * cargo mas não DISC — e o overlay não a corrigia (não há kit C pra ela).
   */
  it('caso real (Taluana/C × kit do D): compondo com o filtro de cargo, o kit some', () => {
    const catalogo = [
      { id: 'troca-kit-D', kit_id: 'kD', cargo: 'Coordenação Pedagógica' },
      { id: 'troca-generico', kit_id: null, cargo: 'Coordenação Pedagógica' },
      { id: 'outro-cargo', kit_id: null, cargo: 'Gestão Escolar' },
    ];
    const servivel = conteudosServiveisPorCargo(conteudosDoBuild(catalogo), 'Coordenação Pedagógica');
    expect(servivel.map((c) => c.id)).toEqual(['troca-generico']);
    // as duas invariantes juntas: nem DISC de outro perfil, nem cargo alheio
    expect(servivel.map((c) => c.id)).not.toContain('troca-kit-D');
    expect(servivel.map((c) => c.id)).not.toContain('outro-cargo');
  });
});
