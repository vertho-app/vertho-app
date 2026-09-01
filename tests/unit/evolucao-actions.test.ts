import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * A tela de evolução da PESSOA. Ela passou a ler `trilhas.evolution_report` em
 * 01/09/2026, e o motivo de cada asserção aqui é um caso que o dado REAL de
 * produção produz:
 *
 *  · a única trilha com relatório no banco é de PILOTO, e o relatório do piloto
 *    grava `baseline`/`nota_avaliacao` — não `nota_pre`/`nota_pos`. Lida pela
 *    régua regular, ela renderiza "0,00 → 0,00" para quem fez tudo certo;
 *  · o supabase-js RETORNA `{ error }`. Sem checar, uma falha de leitura vira
 *    "você ainda não concluiu nenhuma temporada" na tela de quem concluiu.
 */

const sb = criarSupabaseMock();
let trilhasNoBanco: any[] = [];

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        order: () => Promise.resolve(erroProgramado
          ? { data: null, error: { message: erroProgramado } }
          : { data: trilhasNoBanco, error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: async () => ({ id: 'colab-1', nome_completo: 'Pessoa Demo', empresa_id: 'emp-1' }),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => 'pessoa@demo.com',
}));

let erroProgramado: string | null = null;

const { loadEvolucao } = await import('@/app/dashboard/evolucao/evolucao-actions');

const relatorioRegular = {
  id: 'tr-1',
  numero_temporada: 1,
  competencia_foco: 'Planejamento e Organização',
  status: 'concluida',
  evolution_generated_at: '2026-08-20T12:00:00Z',
  evolution_report: {
    insight_geral: 'Sustentou o comportamento no fechamento.',
    proximo_passo: 'Elevar a exigência no próximo ciclo.',
    nota_media_pos: 3,
    resumo: { confirmadas: 2, parciais: 0, estagnacoes: 0, regressoes: 0 },
    descritores: [
      { competencia: 'Planejamento e Organização', descritor: 'Definição de metas', nota_pre: 2, nota_pos: 3, nivel_percebido: 3, convergencia: 'evolucao_confirmada' },
      { competencia: 'Planejamento e Organização', descritor: 'Organização do plano', nota_pre: 2, nota_pos: 3, nivel_percebido: 3, convergencia: 'evolucao_confirmada' },
    ],
  },
};

const relatorioPiloto = {
  id: 'tr-piloto',
  numero_temporada: 1,
  competencia_foco: 'Comunicação',
  status: 'concluida',
  evolution_generated_at: '2026-07-03T12:00:00Z',
  evolution_report: {
    modo: 'piloto',
    nota_media_pos: 2.5,
    descritores: [
      { competencia: 'Comunicação', descritor: 'Clareza na devolutiva', baseline: 2, nota_avaliacao: 2.5 },
      { competencia: 'Comunicação', descritor: 'Escuta ativa', baseline: 2.4, nota_avaliacao: 2.6 },
    ],
  },
};

describe('loadEvolucao', () => {
  beforeEach(() => {
    trilhasNoBanco = [];
    erroProgramado = null;
  });

  it('calcula o delta por descritor a partir do relatório regular', async () => {
    trilhasNoBanco = [relatorioRegular];
    const r: any = await loadEvolucao();

    expect(r.error).toBeUndefined();
    expect(r.descritores).toHaveLength(2);
    expect(r.descritores[0]).toMatchObject({ nota_pre: 2, nota_pos: 3, delta: 1, convergencia: 'evolucao_confirmada' });
    expect(r.metricas.confirmadas).toBe(2);
    expect(r.metricas.deltaMedia).toBe(1);
  });

  it('agrupa competência com a média de entrada e a de saída', async () => {
    trilhasNoBanco = [relatorioRegular];
    const r: any = await loadEvolucao();

    expect(r.competencias).toHaveLength(1);
    expect(r.competencias[0].inicial.nota_decimal).toBe(2);
    expect(r.competencias[0].reavaliacao.nota_decimal).toBe(3);
  });

  it('NÃO transforma o relatório de piloto em evolução', async () => {
    // Este é o caso que existe hoje em produção. Se o piloto entrasse pela
    // régua regular, `nota_pre` viria de um campo ausente e a pessoa leria
    // um delta de 0,00 sobre notas 0,00 — pior que não mostrar nada.
    trilhasNoBanco = [relatorioPiloto];
    const r: any = await loadEvolucao();

    expect(r.descritores).toHaveLength(0);
    expect(r.metricas.deltaMedia).toBe(0);
    // A competência aparece como ponto de partida, com a nota REAL do baseline.
    expect(r.competencias).toHaveLength(1);
    expect(r.competencias[0].inicial.nota_decimal).toBe(2.2);
    expect(r.competencias[0].reavaliacao).toBeNull();
  });

  it('separa piloto de regular quando a pessoa tem os dois', async () => {
    trilhasNoBanco = [relatorioRegular, relatorioPiloto];
    const r: any = await loadEvolucao();

    expect(r.descritores).toHaveLength(2);
    expect(r.descritores.every((d: any) => d.nota_pre > 0)).toBe(true);
    expect(r.competencias).toHaveLength(2);
  });

  it('distingue falha de leitura de ausência de evolução', async () => {
    erroProgramado = 'timeout no pool';
    const r: any = await loadEvolucao();

    expect(r.error).toContain('timeout no pool');
    // O que NÃO pode acontecer: devolver estrutura vazia como se a pessoa
    // simplesmente não tivesse concluído nada.
    expect(r.descritores).toBeUndefined();
  });

  it('devolve vazio de verdade quando não há temporada concluída', async () => {
    trilhasNoBanco = [];
    const r: any = await loadEvolucao();

    expect(r.error).toBeUndefined();
    expect(r.descritores).toHaveLength(0);
    expect(r.competencias).toHaveLength(0);
  });
});
