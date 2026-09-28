/**
 * Falha de leitura da TURMA não vira "fora da população" (revisão de
 * 27/09/2026, item L-4).
 *
 * Programa de liderança com escopo por turma. Até 27/09 `resolverEscopoDeLote`
 * e `carregarParticipacaoAtiva` liam `turma_membros` sem olhar o `error`: a
 * população virava [] em silêncio, o painel da equipe mostrava "Ninguém da sua
 * equipe está na população" e quem treina lia "não está aberto para você nesta
 * rodada". A sonda da revisão provava o defeito; aqui ela está invertida, e o
 * caso sem falha fica como controle (o teste não passa por a leitura nunca
 * acontecer).
 */
import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { carregarPopulacao } from '@/lib/prontidao-lideranca/agregar';
import { resolverTrilhoLideranca } from '@/lib/prontidao-lideranca/trilho';
import { carregarParticipacaoAtiva } from '@/lib/turmas/contexto';
import { resolverEscopoDeLote } from '@/lib/turmas/escopo';

const EMP = '10000000-0000-4000-8000-000000000001';
const TURMA = '20000000-0000-4000-8000-000000000002';
const cfg = { cargo_alvo: 'Gerente', escopo: { tipo: 'turma', turmaId: TURMA }, um_por_dia: false, corte_nota: 3 } as any;

describe('escopo por turma × falha de leitura', () => {
  it('painel: erro em turma_membros LANÇA, em vez de virar população vazia', async () => {
    const sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'turmas' ? { id: TURMA, nome: 'Turma A' } : null),
      lista: (tabela) =>
        tabela === 'turma_membros' ? [{ colaborador_id: 'ana' }]
          : tabela === 'colaboradores' ? [{ id: 'ana', nome_completo: 'Ana', cargo: 'Analista', email: 'ana@x.test', role: 'colaborador' }]
            : [],
    });
    // Controle: sem falha, a Ana está na população.
    expect((await carregarPopulacao(sb.client, EMP, cfg)).map((p) => p.id)).toEqual(['ana']);
    sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    await expect(carregarPopulacao(sb.client, EMP, cfg)).rejects.toThrow('timeout no pool');
    await expect(resolverEscopoDeLote(sb.client, EMP, { tipo: 'turma', turmaId: TURMA })).rejects.toThrow(
      'membros da turma',
    );
  });

  it('escopo: erro ao ler a TURMA não se disfarça de "turma não encontrada"', async () => {
    const sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'turmas' ? { id: TURMA, nome: 'Turma A' } : null) });
    sb.falharEm({ tabela: 'turmas', op: 'select', mensagem: 'timeout no pool' });
    await expect(resolverEscopoDeLote(sb.client, EMP, { tipo: 'turma', turmaId: TURMA })).rejects.toThrow(
      'não foi possível ler a turma',
    );
  });

  it('treino: erro em turma_membros LANÇA, em vez de virar "fora da população"', async () => {
    const sb = criarSupabaseMock({
      resolver: (tabela) =>
        tabela === 'turma_membros' ? { id: 'm1', turma_id: TURMA, config_override: {} }
          : tabela === 'turmas' ? { id: TURMA, nome: 'Turma A', sys_config: {}, data_inicio: null, status: 'ativa' }
            : null,
      lista: (tabela) => (tabela === 'cargos_empresa' ? [{ nome: 'Gerente' }] : []),
    });
    const sys = { modulos: { prontidao_lideranca: true }, prontidao_lideranca: { cargo_alvo: 'Gerente', escopo: { tipo: 'turma', turmaId: TURMA } } };
    const colab = { id: 'ana', empresa_id: EMP, role: 'colaborador', cargo: 'Analista', email: 'ana@cliente.test' };
    // Controle: sem falha, a Ana entra no trilho.
    expect(await resolverTrilhoLideranca(sb.client, colab, sys)).toMatchObject({ ok: true });
    sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    await expect(resolverTrilhoLideranca(sb.client, colab, sys)).rejects.toThrow('timeout no pool');
  });

  it('participação: erro ao ler a turma da pessoa também lança (antes virava "sem turma")', async () => {
    const sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'turma_membros' ? { id: 'm1', turma_id: TURMA, config_override: {} } : null),
    });
    sb.falharEm({ tabela: 'turmas', op: 'select', mensagem: 'timeout no pool' });
    await expect(carregarParticipacaoAtiva(sb.client, EMP, 'ana')).rejects.toThrow('não foi possível ler a turma');
  });
});
