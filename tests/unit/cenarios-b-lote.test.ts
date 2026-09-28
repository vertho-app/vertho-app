import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

let sb: SupabaseMock;
let rows: any[];
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/ia2-gabarito', () => ({ buscarContextoPPP: async () => '', buscarValoresDaRede: async () => [] }));
vi.mock('@/lib/matriz-por-cargo', () => ({ buscarDescritoresDaCompetencia: async () => [] }));
import { listarFilaCenariosB, prepararCenariosB, salvarCenarioB, salvarCheckCenarioB } from '@/lib/cenarios-b-lote';
import { normalizarCheckCenB, validarCenarioB } from '@/lib/cenarios-b';

const a = { id: 'a1', competencia_id: 'comp1', cargo: 'Gestor', tipo_cenario: null, descricao: 'Planejamento financeiro anual' };
const resposta = { titulo: 'Entrega atrasada', descricao: 'Cliente exige atendimento urgente', p1: 'Situação?', p2: 'Ação?', p3: 'Critério?', p4: 'Limite?' };
beforeEach(() => {
  rows = [a];
  sb = criarSupabaseMock({
    lista: tabela => tabela === 'banco_cenarios' ? rows : tabela === 'competencias' ? [{ id: 'comp1' }] : [],
    resolver: tabela => tabela === 'empresas' ? { nome: 'Empresa' } : null,
  });
});

describe('fila de cenários B', () => {
  it('deduplica cargo/competência e inclui B sem check, sem regenerar aprovados', async () => {
    rows = [a, { ...a, id: 'a2' }, { ...a, id: 'a3', cargo: 'Diretor' },
      { ...a, id: 'b1', tipo_cenario: 'cenario_b', nota_check: null },
      { ...a, id: 'b2', cargo: 'Diretor', tipo_cenario: 'cenario_b', nota_check: 0 },
      { ...a, id: 'a4', competencia_id: 'comp-ausente' }];
    expect(await listarFilaCenariosB('empresa-1')).toEqual([{ cenarioAId: 'a1', competenciaId: 'comp1', cargo: 'Gestor' }]);
    for (const tabela of ['banco_cenarios', 'competencias']) {
      expect(sb.chamadas).toContainEqual({ tabela, metodo: 'eq', args: ['empresa_id', 'empresa-1'] });
    }
  });
  it('falha na leitura não vira fila vazia', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'offline' });
    await expect(listarFilaCenariosB('empresa-1')).rejects.toThrow('offline');
  });
  it('prefere o cenário A de rede e exclui os cargos-âncora de liderança', async () => {
    rows = [{ ...a, id: 'escola', ppp_escola_id: 'ppp1', created_at: '2026-09-28' },
      { ...a, id: 'rede', ppp_escola_id: null, created_at: '2026-09-01' },
      { ...a, id: 'lider', cargo: 'Líder' }, { ...a, id: 'futuro', cargo: 'Futuro Líder' }];
    expect(await listarFilaCenariosB('empresa-1')).toEqual([{ cenarioAId: 'rede', competenciaId: 'comp1', cargo: 'Gestor' }]);
  });
  it('preserva a cobertura de um B integrador já checado', async () => {
    rows = [a, { ...a, id: 'integrador', competencia_id: 'outra', tipo_cenario: 'cenario_b', nota_check: 94,
      alternativas: { competencias_integradas: ['Planejamento', 'Comunicação'] } }];
    sb = criarSupabaseMock({ lista: tabela => tabela === 'banco_cenarios' ? rows : [{ id: 'comp1', nome: 'Planejamento' }] });
    expect(await listarFilaCenariosB('empresa-1')).toEqual([]);
  });
  it('recusa cenário A que não existe no tenant', async () => {
    await expect(prepararCenariosB('empresa-1', [{ cenarioAId: 'outro', competenciaId: 'comp1', cargo: 'Gestor' }])).rejects.toThrow('não encontrado nesta empresa');
    expect(sb.chamadas).toContainEqual({ tabela: 'banco_cenarios', metodo: 'eq', args: ['empresa_id', 'empresa-1'] });
    expect(sb.escritas).toHaveLength(0);
  });
});

describe('contrato dos cenários B', () => {
  it('preserva as quatro perguntas, o tipo B e o tenant na gravação', async () => {
    await salvarCenarioB('empresa-1', a, resposta);
    expect(sb.escritas[0].payload).toMatchObject({ empresa_id: 'empresa-1', tipo_cenario: 'cenario_b', p4: 'Limite?', alternativas: { p4: 'Limite?' } });
  });
  it('erro de insert propaga para a retomada do lote pago', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'insert', mensagem: 'disco cheio' });
    await expect(salvarCenarioB('empresa-1', a, resposta)).rejects.toThrow('disco cheio');
  });
  it('erro de check não é anunciado como salvo', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'update', mensagem: 'timeout' });
    await expect(salvarCheckCenarioB('empresa-1', 'b1', { nota: 93 })).rejects.toThrow('timeout');
  });
  it('aceita nota zero e limita erro grave a 60', async () => {
    expect(normalizarCheckCenB({ nota: 0 })?.statusCheck).toBe('revisar');
    expect(normalizarCheckCenB({ nota: 99, erro_grave: true })).toMatchObject({ resultado: { nota: 60 }, statusCheck: 'revisar' });
    expect(normalizarCheckCenB({ nota: 101 })).toBeNull();
    await salvarCheckCenarioB('empresa-1', 'b1', { nota: 0 });
    expect(sb.escritas[0].payload).toMatchObject({ nota_check: 0, status_check: 'revisar' });
    expect(sb.chamadas).toContainEqual({ tabela: 'banco_cenarios', metodo: 'eq', args: ['empresa_id', 'empresa-1'] });
  });
  it('geração rejeita perguntas ausentes e cópia do original', () => {
    expect(validarCenarioB(resposta, a)).toEqual([]);
    expect(validarCenarioB({ ...resposta, p4: null }, a)).toContain('Faltam perguntas p1-p4');
    expect(validarCenarioB({ ...resposta, descricao: a.descricao }, a).join()).toContain('Semelhança excessiva');
  });
});
