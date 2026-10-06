import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Andamento da base: o agrupamento por cargo não pode conter a equipe Vertho.
 *
 * Medido 06/10/2026 na 4Life: a tela somava 27 pessoas e 3 eram contas
 * `@vertho.ai`. Os NÚMEROS saem de `carregarPanoramaRH` (que corta a equipe por
 * id); este teste protege o outro lado: os `colaboradorIds` que o agrupamento
 * entrega a ele, e que um cargo só com equipe não vire grupo de 0 pessoas.
 */

const sb = criarSupabaseMock({
  lista: (tabela) => {
    if (tabela === 'empresas') return [{ id: 'emp-1', nome: '4Life Educação', is_demo: false }];
    if (tabela === 'colaboradores') {
      return [
        { id: 'a', cargo: 'Professor(a)', role: 'colaborador', email: 'ana@gmail.com' },
        { id: 'b', cargo: 'Professor(a)', role: 'colaborador', email: 'bia@hotmail.com' },
        // Equipe no MESMO cargo dos reais e num cargo só dela.
        { id: 'c', cargo: 'Professor(a)', role: 'colaborador', email: 'rodrigo@vertho.ai' },
        { id: 'd', cargo: 'Coordenação', role: 'colaborador', email: 'simone@VERTHO.AI' },
        // Persona de demo não é equipe.
        { id: 'e', cargo: 'Coordenação', role: 'colaborador', email: 'carla.demo@vertho.ai' },
      ];
    }
    return [];
  },
});

const chamadasPanorama: Array<{ empresaId: string; ids: string[] | null }> = [];

vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));
vi.mock('@/lib/home/loaders', () => ({
  carregarPanoramaRH: async (empresaId: string, opts: { colaboradorIds?: string[] | null } = {}) => {
    const ids = opts.colaboradorIds ?? null;
    chamadasPanorama.push({ empresaId, ids });
    return {
      pessoas: ids ? ids.length : 3,
      comPerfil: 0,
      comMapeamento: 0,
      progressoMapeamento: [],
      emJornada: 0,
      indisponivel: false,
    };
  },
}));
vi.mock('@/lib/turmas', () => ({ listarTurmasDoTenant: async () => [] }));
vi.mock('@/lib/turmas/escopo', () => ({ resolverEscopoDeLote: async () => ({ colaboradorIds: [] }) }));

import { carregarAndamentoEmpresas } from '@/lib/admin/andamento-empresas';

describe('andamento da base: equipe Vertho fora do agrupamento', () => {
  beforeEach(() => { sb.reset(); chamadasPanorama.length = 0; });

  it('por cargo, o grupo recebe só os ids de quem NÃO é da equipe', async () => {
    const [empresa] = await carregarAndamentoEmpresas('cargo');
    const porRotulo = new Map(empresa.grupos.map((g) => [g.rotulo, g.pessoas]));
    expect(porRotulo.get('Professor(a)')).toBe(2);
    const idsDosGrupos = chamadasPanorama.filter((c) => c.ids).flatMap((c) => c.ids as string[]).sort();
    expect(idsDosGrupos).toEqual(['a', 'b', 'e']);
    expect(idsDosGrupos).not.toContain('c');
    expect(idsDosGrupos).not.toContain('d');
  });

  it('cargo que só tinha equipe não vira grupo de 0 pessoas, e a persona .demo@ conta', async () => {
    const [empresa] = await carregarAndamentoEmpresas('cargo');
    // 'Coordenação' tem a equipe (d) e uma persona demo (e): sobra 1, não 0.
    expect(empresa.grupos.find((g) => g.rotulo === 'Coordenação')?.pessoas).toBe(1);
    expect(empresa.grupos.every((g) => g.pessoas > 0)).toBe(true);
  });
});
