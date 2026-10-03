import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';

const h = vi.hoisted(() => ({ degradacoes: [] as any[] }));

vi.mock('@/lib/degradacao', () => ({
  registrarDegradacao: async (d: any) => { h.degradacoes.push(d); },
  DEGRADACAO: {
    JORNADA_ENCADEAMENTO_FALHOU: 'jornada-encadeamento-falhou',
    JORNADA_COMPETENCIA_PULADA: 'jornada-competencia-pulada',
    JORNADA_CADENCIA_NAO_REATIVADA: 'jornada-cadencia-nao-reativada',
  },
}));

import { proximaCompetencia, competenciasPendentes, encadearProximaJornada } from '@/lib/season-engine/encadear-jornada';

/**
 * DUO = duas jornadas em sequência (05/08/2026). Terminou a primeira, com
 * fechamento completo, a segunda começa na competência seguinte.
 *
 * O que estes testes protegem:
 *  - repetir a competência que a pessoa acabou de fazer (o pior resultado
 *    possível: 7 semanas do mesmo conteúdo com outro rótulo);
 *  - encadear num modo que não é jornada, criando uma trilha 2 para quem tem
 *    programa de 14 semanas;
 *  - o fechamento ser desfeito porque a geração da próxima falhou;
 *  - (03/10/2026) gerar uma 3ª trilha quando o relatório é refeito com a 2ª já
 *    em curso; a trilha nova nascer sem envio semanal (R-15); a próxima
 *    competência sem mapeamento derrubar o encadeamento (R-90).
 */

const TRILHA_JORNADA = {
  id: 't1',
  colaborador_id: 'c1',
  empresa_id: 'e1',
  programa_modo: 'jornada',
  competencia_foco: 'Liderança',
  numero_temporada: 1,
};

const temElo = (cadeia: Chamada[], metodo: string, arg0?: any) =>
  cadeia.some((c) => c.metodo === metodo && (arg0 === undefined || c.args[0] === arg0));

interface Cenario {
  trilha?: any;
  /** Trilha com numero_temporada MAIOR (o encadeamento já aconteceu). */
  posterior?: any;
  snapshot?: any;
  cargo?: any;
  anteriores?: any[];
  /** Competências em que a pessoa tem `descriptor_assessments`. */
  mapeadas?: string[];
  /** Linhas de `fase4_envios` que o update de reativação atinge. */
  linhasCadencia?: number;
}

/** tdb do encadeamento: responde pela CADEIA pedida, não pela ordem das chamadas. */
function tdbDe(c: Cenario) {
  return criarSupabaseMock({
    resolver: (tabela, cols, cadeia) => {
      if (tabela === 'trilhas') {
        if (temElo(cadeia, 'gt')) return c.posterior ?? null;
        if (cols.includes('programa_config')) return c.snapshot !== undefined ? { programa_config: c.snapshot } : null;
        return c.trilha ?? TRILHA_JORNADA;
      }
      if (tabela === 'cargos_empresa') return c.cargo ?? null;
      return null;
    },
    lista: (tabela, _cols, cadeia) => {
      if (tabela === 'trilhas') return c.anteriores ?? [{ competencia_foco: 'Liderança' }];
      if (tabela === 'descriptor_assessments') {
        const pedidas: string[] = cadeia.find((e) => e.metodo === 'in')?.args[1] || [];
        return pedidas.filter((p) => (c.mapeadas ?? pedidas).includes(p)).map((competencia) => ({ competencia }));
      }
      return [];
    },
    escrita: (tabela, op) => (tabela === 'fase4_envios' && op === 'update'
      ? Array.from({ length: c.linhasCadencia ?? 1 }, (_, i) => ({ id: `env-${i}` }))
      : null),
  });
}

/** Cliente raw (só `colaboradores`): o encadeamento filtra por id E por empresa. */
function sbRaw(colab: any = { id: 'c1', cargo: 'Coordenador', empresa_id: 'e1' }) {
  return criarSupabaseMock({ resolver: (tabela) => (tabela === 'colaboradores' ? colab : null) });
}

const CARGO_2 = { competencias_foco: ['Liderança', 'Relacionamento com Clientes'] };
const CARGO_3 = { competencias_foco: ['Liderança', 'Relacionamento com Clientes', 'Comunicação'] };
const gerarOk = () => vi.fn(async () => ({ ok: true, trilhaId: 't2', dataInicio: '2026-10-12' }));
const atualizacoesDaCadencia = (tdb: any) => tdb.escritas.filter((e: any) => e.tabela === 'fase4_envios' && e.op === 'update');

beforeEach(() => { h.degradacoes.length = 0; });

describe('próxima competência', () => {
  it('pula as que a pessoa já percorreu', () => {
    expect(proximaCompetencia(['Liderança', 'Relacionamento com Clientes'], ['Liderança']))
      .toBe('Relacionamento com Clientes');
  });

  it('ignora diferença de caixa e espaço — texto livre nos dois lados', () => {
    // `competencia_foco` é texto livre gravado no cargo E na trilha. Sem
    // normalizar, " liderança " ≠ "Liderança" e a pessoa refaria a jornada.
    expect(proximaCompetencia(['Liderança', 'Resolução de Problemas'], ['  liderança ']))
      .toBe('Resolução de Problemas');
  });

  it('sem próxima, devolve null (programa completo)', () => {
    expect(proximaCompetencia(['Liderança'], ['Liderança'])).toBeNull();
  });

  it('as pendentes saem na ORDEM do cargo', () => {
    expect(competenciasPendentes(CARGO_3.competencias_foco, ['Liderança']))
      .toEqual(['Relacionamento com Clientes', 'Comunicação']);
  });
});

describe('encadeamento', () => {
  it('gera a próxima jornada com a competência seguinte', async () => {
    const gerar = gerarOk();
    const r = await encadearProximaJornada(sbRaw().client, tdbDe({ cargo: CARGO_2 }).client, 't1', gerar);
    expect(r.encadeou).toBe(true);
    expect(r.competencia).toBe('Relacionamento com Clientes');
    expect(r.numeroTemporada).toBe(2);
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ novaJornada: true, competencia: 'Relacionamento com Clientes' }));
  });

  it('não encadeia em modo de 14 semanas', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(
      sbRaw().client, tdbDe({ trilha: { ...TRILHA_JORNADA, programa_modo: 'regular_duo' } }).client, 't1', gerar,
    );
    expect(r).toEqual({ encadeou: false, motivo: 'modo-nao-encadeia' });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('cargo sem próxima competência: encerra sem erro', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbRaw().client, tdbDe({ cargo: { competencias_foco: ['Liderança'] } }).client, 't1', gerar);
    expect(r.motivo).toBe('sem-proxima-competencia');
    expect(gerar).not.toHaveBeenCalled();
  });

  it('geração falhou: reporta, mas não lança — o fechamento não se desfaz', async () => {
    const gerar = vi.fn(async () => ({ error: 'IA fora do ar' }));
    const tdb = tdbDe({ cargo: CARGO_2 });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerar);
    expect(r.encadeou).toBe(false);
    expect(r.motivo).toBe('falhou');
    expect(r.competencia).toBe('Relacionamento com Clientes');
    expect(h.degradacoes.map((d) => d.tipo)).toEqual(['jornada-encadeamento-falhou']);
    // Sem trilha nova, a cadência não é mexida.
    expect(atualizacoesDaCadencia(tdb)).toHaveLength(0);
  });

  it('🔴 falha ao ler as trilhas anteriores NÃO vira "nada feito" (repetiria a competência que acabou de fechar)', async () => {
    // A leitura da trilha e a do "posterior" também são `trilhas`, por
    // `maybeSingle`: a falha vai só na LISTA (o `then`), que é a das anteriores.
    const gerar = vi.fn();
    const tdb = tdbDe({ cargo: CARGO_2 });
    const from = tdb.client.from;
    tdb.client.from = (t: string) => {
      const b = from(t);
      if (t === 'trilhas') b.then = (res: any, rej: any) => Promise.resolve({ data: null, error: { message: 'timeout no pool' } }).then(res, rej);
      return b;
    };
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerar);
    expect(r).toMatchObject({ encadeou: false, motivo: 'falhou' });
    expect(gerar).not.toHaveBeenCalled();
    expect(h.degradacoes[0]?.detalhe?.erro).toMatch(/trilhas anteriores/);
  });
});

/**
 * R-15 (03/10/2026): a trilha nova reativa a linha da pessoa em `fase4_envios`.
 * Sem isso o cron seguia com o relógio da jornada 1 e, passado o fim do plano,
 * marcava a linha `concluido`, que ele nunca mais lê.
 */
describe('encadeamento reativa a cadência (R-15)', () => {
  it('trilha nova → update em fase4_envios: ativo, relógio 1, data da trilha nova, só ativo/concluido', async () => {
    const tdb = tdbDe({ cargo: CARGO_2 });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerarOk());
    expect(r.cadencia).toBe('reativada');
    const ups = atualizacoesDaCadencia(tdb);
    expect(ups).toHaveLength(1);
    expect(ups[0].payload).toEqual({ status: 'ativo', semana_atual: 1, data_inicio: '2026-10-12' });
    // A linha da PESSOA, e nunca a de quem foi pausado por um operador.
    expect(tdb.usou('fase4_envios', 'eq', 'colaborador_id')).toBe(true);
    const filtroStatus = tdb.chamadas.find((c) => c.tabela === 'fase4_envios' && c.metodo === 'in');
    expect(filtroStatus?.args).toEqual(['status', ['ativo', 'concluido']]);
  });

  it('pessoa sem linha na cadência: nada é criado, e o resultado diz isso', async () => {
    const tdb = tdbDe({ cargo: CARGO_2, linhasCadencia: 0 });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerarOk());
    expect(r).toMatchObject({ encadeou: true, cadencia: 'sem-inscricao' });
    expect(tdb.escritas.filter((e) => e.tabela === 'fase4_envios' && e.op !== 'update')).toHaveLength(0);
  });

  it('falha ao reativar: a trilha nova continua, e a falha vira degradação CRÍTICA', async () => {
    const tdb = tdbDe({ cargo: CARGO_2 });
    tdb.falharEm({ tabela: 'fase4_envios', op: 'update', mensagem: 'timeout no pool' });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerarOk());
    expect(r).toMatchObject({ encadeou: true, trilhaId: 't2', cadencia: 'falhou' });
    const d = h.degradacoes.find((x) => x.tipo === 'jornada-cadencia-nao-reativada');
    expect(d?.severidade).toBe('critico');
  });

  it('o Personalizado de 2 competências também reativa', async () => {
    const tdb = tdbDe({
      trilha: { ...TRILHA_JORNADA, programa_modo: 'custom' },
      snapshot: snapshotCustom(1),
    });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerarOk());
    expect(r).toMatchObject({ encadeou: true, cadencia: 'reativada' });
    expect(atualizacoesDaCadencia(tdb)).toHaveLength(1);
  });
});

/**
 * Idempotência (03/10/2026). O relatório pode ser refeito (retomada da tela,
 * auditoria do admin) e cada refação chamava o encadeamento: a jornada 1
 * refeita com a 2 em curso geraria uma 3ª, na competência seguinte.
 */
describe('encadeamento idempotente', () => {
  it('já existe trilha DEPOIS desta: nada é gerado, nada é escrito', async () => {
    const gerar = vi.fn();
    const tdb = tdbDe({ cargo: CARGO_3, posterior: { id: 't2' } });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'ja-encadeada', trilhaId: 't2' });
    expect(gerar).not.toHaveBeenCalled();
    expect(tdb.escritas).toHaveLength(0);
    // A pergunta é "existe temporada MAIOR que esta?", da mesma pessoa.
    const gt = tdb.chamadas.find((c) => c.tabela === 'trilhas' && c.metodo === 'gt');
    expect(gt?.args).toEqual(['numero_temporada', 1]);
  });

  it('vale também para o Personalizado (a 2ª já existe)', async () => {
    const gerar = vi.fn();
    const tdb = tdbDe({ trilha: { ...TRILHA_JORNADA, programa_modo: 'custom' }, snapshot: snapshotCustom(1), posterior: { id: 't2' } });
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerar);
    expect(r.motivo).toBe('ja-encadeada');
    expect(gerar).not.toHaveBeenCalled();
  });

  it('falha ao ler a trilha seguinte: não gera às cegas', async () => {
    const gerar = vi.fn();
    const tdb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'trilhas' ? TRILHA_JORNADA : null),
    });
    const from = tdb.client.from;
    tdb.client.from = (t: string) => {
      const b = from(t);
      const gtOriginal = b.gt;
      b.gt = (...a: any[]) => {
        gtOriginal(...a);
        b.maybeSingle = async () => ({ data: null, error: { message: 'timeout no pool' } });
        return b;
      };
      return b;
    };
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerar);
    expect(r).toMatchObject({ encadeou: false, motivo: 'falhou' });
    expect(gerar).not.toHaveBeenCalled();
  });
});

/**
 * R-90 (03/10/2026): o gerador exige o mapeamento da competência. A próxima do
 * cargo sem mapeamento fazia a geração falhar e o encadeamento desistir; agora
 * ela é pulada (e registrada), e a seguinte com mapeamento é a escolhida.
 */
describe('encadeamento só em competência com mapeamento (R-90)', () => {
  it('a próxima do cargo sem mapeamento é PULADA e registrada; gera a seguinte que tem', async () => {
    const gerar = gerarOk();
    const r = await encadearProximaJornada(
      sbRaw().client, tdbDe({ cargo: CARGO_3, mapeadas: ['Comunicação'] }).client, 't1', gerar,
    );
    expect(r).toMatchObject({ encadeou: true, competencia: 'Comunicação', puladas: ['Relacionamento com Clientes'] });
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ competencia: 'Comunicação' }));
    const pulada = h.degradacoes.find((d) => d.tipo === 'jornada-competencia-pulada');
    expect(pulada?.detalhe).toEqual({ puladas: ['Relacionamento com Clientes'], escolhida: 'Comunicação' });
  });

  it('nenhuma pendente com mapeamento: não gera, e o admin fica sabendo', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(
      sbRaw().client, tdbDe({ cargo: CARGO_3, mapeadas: [] }).client, 't1', gerar,
    );
    expect(r).toMatchObject({ encadeou: false, motivo: 'sem-mapeamento' });
    expect(gerar).not.toHaveBeenCalled();
    expect(h.degradacoes[0]).toMatchObject({
      tipo: 'jornada-encadeamento-falhou',
      detalhe: { motivo: 'sem-mapeamento', pendentes: ['Relacionamento com Clientes', 'Comunicação'] },
    });
  });

  it('a consulta de mapeamento é da PESSOA e pelas competências pendentes, por igualdade exata', async () => {
    const tdb = tdbDe({ cargo: CARGO_3 });
    await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerarOk());
    const cadeia = tdb.chamadas.filter((c) => c.tabela === 'descriptor_assessments');
    expect(cadeia.find((c) => c.metodo === 'eq')?.args).toEqual(['colaborador_id', 'c1']);
    expect(cadeia.find((c) => c.metodo === 'in')?.args).toEqual(['competencia', ['Relacionamento com Clientes', 'Comunicação']]);
  });
});

/**
 * Personalizado com 2 competências (03/10/2026): o MESMO encadeamento, mas a
 * próxima competência é a 2ª da sequência gravada no snapshot da 1ª trilha
 * (decidida e validada na geração), e as regras da 2ª são as do snapshot, não
 * as da tela no dia. Terminada a 2ª, o programa acaba.
 */
function snapshotCustom(posicao: number, competencias = ['Liderança', 'Comunicação']) {
  return {
    modo: 'regular', semanas: 5, semanasMissao: [], semanasAvaliacao: [5], semanasCheckpoint: [],
    semanaCenarioB: 5, semanaAcumulada: 4, slotsConteudo: [1, 2, 3, 4], blocosCobertos: {}, complexidadeMap: {},
    nivelMetaAlvo: 3, numCompetencias: 1, conteudosPorSemana: 2, desafioUnicoPorCompetencia: true,
    arguicao: { ativa: true, maxTurnos: 6 },
    sequenciaPersonalizado: { competencias, posicao },
  };
}

describe('encadeamento do Personalizado', () => {
  const trilhaCustom = { ...TRILHA_JORNADA, programa_modo: 'custom', competencia_foco: 'Liderança' };

  it('1ª de 2 concluída: gera a 2ª com novaJornada e as regras congeladas (posição 2)', async () => {
    const gerar = gerarOk();
    const r = await encadearProximaJornada(sbRaw().client, tdbDe({ trilha: trilhaCustom, snapshot: snapshotCustom(1) }).client, 't1', gerar);
    expect(r).toMatchObject({ encadeou: true, competencia: 'Comunicação', numeroTemporada: 2 });
    expect(gerar).toHaveBeenCalledTimes(1);
    const args = (gerar.mock.calls[0] as any[])[0];
    expect(args).toMatchObject({ colaboradorId: 'c1', competencia: 'Comunicação', novaJornada: true, empresaIdEsperado: 'e1' });
    expect(args.configPersonalizado.sequenciaPersonalizado).toEqual({ competencias: ['Liderança', 'Comunicação'], posicao: 2 });
    expect(args.configPersonalizado.semanas).toBe(5);
  });

  it('2ª de 2 concluída: o programa acabou, nada é gerado', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbRaw().client, tdbDe({ trilha: trilhaCustom, snapshot: snapshotCustom(2) }).client, 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'sem-proxima-competencia' });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('Personalizado de 1 competência (snapshot sem sequência) não encadeia', async () => {
    const { sequenciaPersonalizado: _fora, ...semSequencia } = snapshotCustom(1);
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbRaw().client, tdbDe({ trilha: trilhaCustom, snapshot: semSequencia }).client, 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'modo-nao-encadeia' });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('falha ao ler o snapshot: não encadeia e reporta "falhou" (não vira "programa de 1 competência")', async () => {
    const tdb = tdbDe({ trilha: trilhaCustom, snapshot: snapshotCustom(1) });
    const from = tdb.client.from;
    tdb.client.from = (t: string) => {
      const b = from(t);
      const selectOriginal = b.select;
      b.select = (cols: string, o?: any) => {
        selectOriginal(cols, o);
        if (t === 'trilhas' && cols === 'programa_config') b.maybeSingle = async () => ({ data: null, error: { message: 'timeout no pool' } });
        return b;
      };
      return b;
    };
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbRaw().client, tdb.client, 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'falhou' });
    expect(gerar).not.toHaveBeenCalled();
  });
});
