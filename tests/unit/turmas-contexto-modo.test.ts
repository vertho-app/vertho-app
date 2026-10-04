import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { carregarConfigsEfetivasEmLote, carregarContextoTurma } from '@/lib/turmas/contexto';

/**
 * R-101 (revisão de 02/10/2026): o formato de uma geração e a prontidão do
 * piloto liam o formato POR FONTES DIFERENTES.
 *
 * O resolvedor (`resolverConfigEfetiva`) documenta, e testa, a precedência
 * participação → turma → override do colaborador (legado) → empresa. Mas a
 * geração o chamava DUAS vezes: a primeira resolvia empresa, turma e
 * participação, e a segunda recebia esse resultado como se fosse "a empresa" e
 * aplicava o override da pessoa por cima. Resultado: o `programa_modo` da pessoa
 * vencia o da turma, ao contrário do que a função diz de si mesma. E a
 * prontidão do piloto nem olhava a turma.
 *
 * A correção entrega as fontes separadas ao resolvedor, uma vez só. Validado por
 * mutação (ver o relatório): tirar `colaboradorLegado` de `fontes` em
 * `carregarContextoTurma` derruba os casos de precedência; aplicar o legado
 * por último em `carregarConfigsEfetivasEmLote` derruba o caso "a turma vence".
 */

const membro = (extra: any = {}) => ({ id: 'm1', turma_id: 't1', config_override: {}, ...extra });
const turma = (sys_config: any) => ({ id: 't1', nome: 'Safra 1', sys_config, data_inicio: null, status: 'ativa' });

function sbCom({ membroRow, turmaRow }: { membroRow?: any; turmaRow?: any }) {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'turma_membros') return membroRow ?? null;
      if (tabela === 'turmas') return turmaRow ?? null;
      return null;
    },
  }).client;
}

describe('carregarContextoTurma: o override da pessoa entra como FONTE, abaixo da turma', () => {
  it('🔴 a turma VENCE o override legado do colaborador (era o contrário na geração)', async () => {
    const sb = sbCom({ membroRow: membro(), turmaRow: turma({ programa_modo: 'custom' }) });
    const ctx = await carregarContextoTurma(sb, 'emp-1', 'c1', { programa_modo: 'jornada' }, {
      colaboradorLegado: { programa_modo: 'onboarding' },
    });
    expect(ctx.config.programa_modo).toBe('custom');
  });

  it('a participação vence a turma e o legado', async () => {
    const sb = sbCom({
      membroRow: membro({ config_override: { programa_modo: 'jornada' } }),
      turmaRow: turma({ programa_modo: 'custom' }),
    });
    const ctx = await carregarContextoTurma(sb, 'emp-1', 'c1', {}, { colaboradorLegado: { programa_modo: 'onboarding' } });
    expect(ctx.config.programa_modo).toBe('jornada');
  });

  it('sem turma, o override da pessoa vence a empresa (a regra que o acme já usa)', async () => {
    const sb = sbCom({});
    const ctx = await carregarContextoTurma(sb, 'emp-1', 'c1', { programa_modo: 'regular' }, {
      colaboradorLegado: { programa_modo: 'piloto' },
    });
    expect(ctx.config.programa_modo).toBe('piloto');
  });

  it('turma que NÃO define o formato deixa o override da pessoa valer sobre a empresa', async () => {
    const sb = sbCom({ membroRow: membro(), turmaRow: turma({ cadencia: { fase4_dia_pilula: 3 } }) });
    const ctx = await carregarContextoTurma(sb, 'emp-1', 'c1', { programa_modo: 'jornada' }, {
      colaboradorLegado: { programa_modo: 'onboarding' },
    });
    expect(ctx.config.programa_modo).toBe('onboarding');
  });

  it('sem o terceiro argumento nada muda para os outros gates (só a empresa, e a turma)', async () => {
    const sb = sbCom({ membroRow: membro(), turmaRow: turma({ programa_modo: 'custom' }) });
    const ctx = await carregarContextoTurma(sb, 'emp-1', 'c1', { programa_modo: 'jornada' });
    expect(ctx.config.programa_modo).toBe('custom');
  });
});

describe('carregarConfigsEfetivasEmLote: a mesma precedência, para a população', () => {
  const empresa = { programa_modo: 'jornada', programa_custom: { semanas: 3, numCompetencias: 1, fechamento: false } };

  function sbLote({ membros, turmas }: { membros: any[]; turmas: any[] }) {
    return criarSupabaseMock({
      lista: (tabela) => (tabela === 'turma_membros' ? membros : tabela === 'turmas' ? turmas : []),
    });
  }

  it('🔴 quem está na turma lê o formato DA TURMA, e não o da empresa nem o override', async () => {
    const sb = sbLote({
      membros: [{ colaborador_id: 'c1', turma_id: 't1', config_override: {} }],
      turmas: [{ id: 't1', sys_config: { programa_modo: 'custom' } }],
    });
    const mapa = await carregarConfigsEfetivasEmLote(sb.client, 'emp-1', [
      { id: 'c1', programa_modo: 'onboarding' },   // override da pessoa: perde para a turma
      { id: 'c2', programa_modo: 'onboarding' },   // sem turma: o override vale
      { id: 'c3', programa_modo: null },            // sem turma e sem override: a empresa
    ], empresa);
    expect(mapa.get('c1')!.programa_modo).toBe('custom');
    expect(mapa.get('c2')!.programa_modo).toBe('onboarding');
    expect(mapa.get('c3')!.programa_modo).toBe('jornada');
    // O `programa_custom` institucional atravessa: a turma só escolhe o formato.
    expect(mapa.get('c1')!.programa_custom).toEqual(empresa.programa_custom);
  });

  it('a participação vence a turma', async () => {
    const sb = sbLote({
      membros: [{ colaborador_id: 'c1', turma_id: 't1', config_override: { programa_modo: 'jornada' } }],
      turmas: [{ id: 't1', sys_config: { programa_modo: 'custom' } }],
    });
    const mapa = await carregarConfigsEfetivasEmLote(sb.client, 'emp-1', [{ id: 'c1' }], empresa);
    expect(mapa.get('c1')!.programa_modo).toBe('jornada');
  });

  it('lê só as participações ATIVAS desta empresa, paginando', async () => {
    const sb = sbLote({ membros: [], turmas: [] });
    await carregarConfigsEfetivasEmLote(sb.client, 'emp-1', [{ id: 'c1' }], empresa);
    expect(sb.usou('turma_membros', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('turma_membros', 'eq', 'status')).toBe(true);
    expect(sb.usou('turma_membros', 'range')).toBe(true);
    expect(sb.usou('turmas', 'eq', 'empresa_id')).toBe(true);
  });

  it('🔴 falha de leitura LANÇA: "não li as turmas" não vira "ninguém está em turma"', async () => {
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    await expect(carregarConfigsEfetivasEmLote(sb.client, 'emp-1', [{ id: 'c1' }], empresa)).rejects.toThrow(/participações/);

    const sb2 = criarSupabaseMock();
    sb2.falharEm({ tabela: 'turmas', op: 'select', mensagem: 'timeout no pool' });
    await expect(carregarConfigsEfetivasEmLote(sb2.client, 'emp-1', [{ id: 'c1' }], empresa)).rejects.toThrow(/turmas/);
  });
});
