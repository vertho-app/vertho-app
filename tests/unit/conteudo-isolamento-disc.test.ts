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

/**
 * F-I4 (docs/FMEA-PIPELINE.md): `kit_id` é FK ON DELETE SET NULL (mig 142). Deletar/
 * regerar um kit apaga o vínculo e o conteúdo DISC-específico virava "genérico" —
 * voltava ao pool do build, que é cego a DISC. A coluna `disc` (denormalização da
 * mig 142, gravada no insert) NÃO é FK: sobrevive ao SET NULL e denuncia a origem.
 * Se o filtro de `disc` for removido de `conteudosDoBuild`, o 1º teste quebra (mutação).
 */
describe('F-I4: órfão de kit (kit_id NULL após SET NULL) não volta ao pool do build', () => {
  it('conteúdo com disc preenchido e kit_id null NÃO entra no pool', () => {
    const orfaos = [
      { id: 'orfao-D', kit_id: null, disc: 'D', cargo: 'Gestão Escolar' },
      { id: 'orfao-C', kit_id: null, disc: 'C', cargo: 'todos' },
      { id: 'generico', kit_id: null, disc: null, cargo: 'Gestão Escolar' },
    ];
    const ids = conteudosDoBuild(orfaos).map((c) => c.id);
    expect(ids).toEqual(['generico']);
    expect(ids).not.toContain('orfao-D');
    expect(ids).not.toContain('orfao-C');
  });

  it('conteúdo com kit_id e disc null entra normalmente (sem regressão)', () => {
    expect(conteudosDoBuild([{ id: 'g', kit_id: null, disc: null }])).toHaveLength(1);
    // linhas sem a coluna no select (undefined) seguem servíveis
    expect(conteudosDoBuild([{ id: 'h', kit_id: null } as any])).toHaveLength(1);
  });

  it('kit vivo com disc segue fora (defesa dupla)', () => {
    const itens = [{ id: 'kit-vivo', kit_id: 'k1', disc: 'I' }];
    expect(conteudosDoBuild(itens)).toHaveLength(0);
  });
});
