import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Filtro de FUNÇÃO na tela de engajamento.
 *
 * `Medido: 08/09/2026` em Macaé — 81 pessoas na cadência, professores com 40% de
 * atividade no dia e diretores com 11%, somados num único número que não
 * descreve nenhum dos dois grupos. Com duas turmas no ar ao mesmo tempo, a média
 * do total é a única leitura que a tela oferecia.
 *
 * 🔴 O recorte tem que cortar a POPULAÇÃO, não a exibição. Filtrar na hora de
 * desenhar deixa os cards do topo contando a lista inteira enquanto a lista
 * abaixo mostra outra coisa — e o total continua plausível, então ninguém
 * desconfia. É a mesma classe do contador que ignorava o filtro no ranking.
 */

const PESSOAS = [
  { colaborador_id: 'p1', semana_atual: 1, status: 'ativo', colaboradores: { nome_completo: 'Ana', cargo: 'Professor(a)' } },
  { colaborador_id: 'p2', semana_atual: 1, status: 'ativo', colaboradores: { nome_completo: 'Bia', cargo: 'Professor(a)' } },
  { colaborador_id: 'd1', semana_atual: 4, status: 'ativo', colaboradores: { nome_completo: 'Caio', cargo: 'Diretor(a) Escolar' } },
];

const sb = criarSupabaseMock({
  lista: (tabela) => (tabela === 'fase4_envios' ? PESSOAS : []),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));

import { rollUpEngajamento } from '@/lib/engajamento/roll-up';

describe('engajamento por função', () => {
  beforeEach(() => sb.reset());

  it('sem filtro, conta todo mundo da cadência', async () => {
    const r: any = await rollUpEngajamento('emp-1');
    expect(r.resumo.inscritos).toBe(3);
  });

  it('🔴 com filtro, o resumo desce da população recortada', async () => {
    const r: any = await rollUpEngajamento('emp-1', null, null, 'Professor(a)');
    expect(r.resumo.inscritos).toBe(2);
    expect(r.colaboradores.map((c: any) => c.nome)).toEqual(['Ana', 'Bia']);
  });

  it('🔴 a lista de funções NÃO encolhe com o filtro aplicado', async () => {
    // senão o seletor prende a pessoa no recorte que ela acabou de escolher
    const r: any = await rollUpEngajamento('emp-1', null, null, 'Professor(a)');
    expect(r.cargos).toEqual(['Diretor(a) Escolar', 'Professor(a)']);
  });

  it('função sem ninguém devolve zero, e ainda assim oferece a volta', async () => {
    const r: any = await rollUpEngajamento('emp-1', null, null, 'Coordenação');
    expect(r.resumo.inscritos).toBe(0);
    expect(r.colaboradores).toEqual([]);
    expect(r.cargos).toContain('Professor(a)');
  });

  it('o recorte por função não é confundido com o recorte do gestor', async () => {
    // `colaboradorIds: []` é fail-closed (gestor sem liderados vê zero); cargo
    // vazio é "todas as funções". Dois eixos, dois significados para o vazio.
    const semLiderados: any = await rollUpEngajamento('emp-1', null, []);
    expect(semLiderados.resumo.inscritos).toBe(0);
    const todasFuncoes: any = await rollUpEngajamento('emp-1', null, null, '');
    expect(todasFuncoes.resumo.inscritos).toBe(3);
  });
});
