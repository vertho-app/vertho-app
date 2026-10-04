import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * "Minha evolução" da PESSOA (R-08, 04/10/2026).
 *
 * A tela antiga lia `trilhas.evolution_report` e desenhava o par de notas com
 * duas casas, a queda em vermelho com sinal negativo, uma barra proporcional à
 * nota e "Nota média X de 4.0". Decisão do dono: ninguém do cliente vê nota
 * decimal, a evolução é só avanço, e "Minha evolução vai ao relatório da
 * temporada". Agora a action só responde QUAL relatório abrir, e a página
 * redireciona. O que estes testes travam:
 *
 *  · o relatório aberto é o da temporada concluída mais recente, com o `id` da
 *    trilha (sem ele o PDF e o certificado pegavam a jornada seguinte, ainda aberta);
 *  · o relatório do piloto também conta: a tela de destino sabe mostrá-lo como
 *    ponto de partida, sem avanço;
 *  · o supabase-js RETORNA `{ error }`. Sem checar, uma falha de leitura vira
 *    "você ainda não concluiu nenhuma temporada" na tela de quem concluiu;
 *  · a resposta não carrega nota, média nem delta (nem para a tela ignorar).
 */

const sb = criarSupabaseMock();
let trilhasNoBanco: any[] = [];
let erroProgramado: string | null = null;
let filtros: Array<[string, unknown]> = [];
let ordenacao: Array<[string, unknown]> = [];

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => ({
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: (coluna: string, valor: unknown) => { filtros.push([coluna, valor]); return chain; },
        not: () => chain,
        order: (coluna: string, opcoes: unknown) => {
          ordenacao.push([coluna, opcoes]);
          return Promise.resolve(erroProgramado
            ? { data: null, error: { message: erroProgramado } }
            : { data: trilhasNoBanco, error: null });
        },
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

const { loadEvolucao } = await import('@/app/dashboard/evolucao/evolucao-actions');

const relatorioRegular = {
  id: 'tr-regular',
  numero_temporada: 2,
  evolution_generated_at: '2026-08-20T12:00:00Z',
  evolution_report: {
    descritores: [
      { competencia: 'Planejamento e Organização', descritor: 'Definição de metas', nota_pre: 2, nota_pos: 3, convergencia: 'evolucao_confirmada' },
    ],
  },
};
const relatorioPiloto = {
  id: 'tr-piloto',
  numero_temporada: 1,
  evolution_generated_at: '2026-07-03T12:00:00Z',
  evolution_report: {
    modo: 'piloto',
    descritores: [{ competencia: 'Comunicação', descritor: 'Clareza na devolutiva', baseline: 2, nota_avaliacao: 2.5 }],
  },
};

describe('loadEvolucao: qual relatório a "Minha evolução" abre', () => {
  beforeEach(() => {
    trilhasNoBanco = [];
    erroProgramado = null;
    filtros = [];
    ordenacao = [];
  });

  it('abre a temporada concluída mais recente, pelo id da trilha', async () => {
    // A ordem vem do banco (`evolution_generated_at` decrescente): a primeira é a mais recente.
    trilhasNoBanco = [relatorioRegular, relatorioPiloto];
    const r: any = await loadEvolucao();

    expect(r.error).toBeUndefined();
    expect(r.trilhaId).toBe('tr-regular');
    expect(r.totalTemporadas).toBe(2);
    expect(ordenacao).toEqual([['evolution_generated_at', { ascending: false }]]);
  });

  it('só olha as trilhas CONCLUÍDAS da própria pessoa', async () => {
    trilhasNoBanco = [relatorioRegular];
    await loadEvolucao();

    expect(filtros).toContainEqual(['colaborador_id', 'colab-1']);
    expect(filtros).toContainEqual(['status', 'concluida']);
  });

  it('o relatório do piloto também é aberto (a tela de destino mostra o ponto de partida)', async () => {
    trilhasNoBanco = [relatorioPiloto];
    const r: any = await loadEvolucao();

    expect(r.trilhaId).toBe('tr-piloto');
  });

  it('relatório de forma desconhecida (sem descritores) é ignorado, e o próximo é o aberto', async () => {
    trilhasNoBanco = [
      { id: 'tr-sem-forma', numero_temporada: 3, evolution_generated_at: '2026-09-01T12:00:00Z', evolution_report: { insight_geral: 'x' } },
      relatorioRegular,
    ];
    const r: any = await loadEvolucao();

    expect(r.trilhaId).toBe('tr-regular');
    expect(r.totalTemporadas).toBe(1);
  });

  it('distingue falha de leitura de ausência de relatório', async () => {
    erroProgramado = 'timeout no pool';
    const r: any = await loadEvolucao();

    expect(r.error).toContain('timeout no pool');
    // O que NÃO pode acontecer: devolver "nenhuma temporada" como se a pessoa
    // simplesmente não tivesse concluído nada.
    expect(r.trilhaId).toBeUndefined();
  });

  it('devolve vazio de verdade quando não há temporada concluída', async () => {
    const r: any = await loadEvolucao();

    expect(r.error).toBeUndefined();
    expect(r.trilhaId).toBeNull();
    expect(r.totalTemporadas).toBe(0);
  });

  it('a resposta não carrega nota, média nem delta', async () => {
    trilhasNoBanco = [relatorioRegular, relatorioPiloto];
    const r: any = await loadEvolucao();

    expect(Object.keys(r).sort()).toEqual(['totalTemporadas', 'trilhaId']);
    expect(JSON.stringify(r)).not.toMatch(/nota|media|delta|baseline/i);
  });
});

describe('a página "Minha evolução" redireciona e não desenha nota (R-08)', () => {
  const PAGINA = readFileSync('app/dashboard/evolucao/page.tsx', 'utf8');

  it('vai ao relatório da temporada, com o id da trilha e a origem', () => {
    expect(PAGINA).toContain('router.replace(`/dashboard/temporada/concluida?trilha=${encodeURIComponent(result.trilhaId)}&origem=temporada`)');
  });

  it('não formata nota, não calcula delta e não pinta queda', () => {
    expect(PAGINA).not.toMatch(/toFixed|nota_|delta|E57373|red-\d00/);
    expect(PAGINA).not.toContain('convergencia-cores');
  });
});
