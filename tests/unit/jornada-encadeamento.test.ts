import { describe, it, expect, vi } from 'vitest';
import { proximaCompetencia, encadearProximaJornada } from '@/lib/season-engine/encadear-jornada';

vi.mock('@/lib/degradacao', () => ({
  registrarDegradacao: async () => {},
  DEGRADACAO: { JORNADA_ENCADEAMENTO_FALHOU: 'jornada-encadeamento-falhou' },
}));

/**
 * DUO = duas jornadas em sequência (05/08/2026). Terminou a primeira, com
 * fechamento completo, a segunda começa na competência seguinte.
 *
 * O que estes testes protegem:
 *  - repetir a competência que a pessoa acabou de fazer (o pior resultado
 *    possível: 7 semanas do mesmo conteúdo com outro rótulo);
 *  - encadear num modo que não é jornada, criando uma trilha 2 para quem tem
 *    programa de 14 semanas;
 *  - o fechamento ser desfeito porque a geração da próxima falhou.
 */

/** Mock mínimo do tdb: from(tabela) → objeto encadeável com o que o código usa. */
function tdbFake(tabelas: Record<string, any>) {
  return {
    from(tabela: string) {
      const dado = tabelas[tabela];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: Array.isArray(dado) ? dado[0] : dado }),
        then: (res: any) => res({ data: Array.isArray(dado) ? dado : [dado] }),
      };
      return chain;
    },
  };
}


/**
 * Mock do cliente raw. `.eq()` encadeia quantas vezes for preciso: o
 * encadeamento filtra colaborador POR ID E POR EMPRESA (service-role bypassa
 * RLS), e um mock que aceitasse só um `.eq` esconderia a falta do segundo.
 */
function sbFake(colab: any) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: colab }),
  };
  return { from: () => chain };
}

const TRILHA_JORNADA = {
  id: 't1',
  colaborador_id: 'c1',
  empresa_id: 'e1',
  programa_modo: 'jornada',
  competencia_foco: 'Liderança',
  numero_temporada: 1,
};

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
});

describe('encadeamento', () => {
  it('gera a próxima jornada com a competência seguinte', async () => {
    const gerar = vi.fn(async () => ({ ok: true, trilhaId: 't2' }));
    const r = await encadearProximaJornada(
      sbFake({ id: 'c1', cargo: 'Coordenador', empresa_id: 'e1' }),
      tdbFake({
        trilhas: [TRILHA_JORNADA],
        cargos_empresa: { competencias_foco: ['Liderança', 'Relacionamento com Clientes'] },
      }),
      't1',
      gerar,
    );
    expect(r.encadeou).toBe(true);
    expect(r.competencia).toBe('Relacionamento com Clientes');
    expect(r.numeroTemporada).toBe(2);
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ novaJornada: true, competencia: 'Relacionamento com Clientes' }));
  });

  it('não encadeia em modo de 14 semanas', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(
      sbFake({ id: 'c1' }),
      tdbFake({ trilhas: [{ ...TRILHA_JORNADA, programa_modo: 'regular_duo' }] }),
      't1',
      gerar,
    );
    expect(r).toEqual({ encadeou: false, motivo: 'modo-nao-encadeia' });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('cargo sem próxima competência: encerra sem erro', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(
      sbFake({ id: 'c1', cargo: 'Coordenador' }),
      tdbFake({ trilhas: [TRILHA_JORNADA], cargos_empresa: { competencias_foco: ['Liderança'] } }),
      't1',
      gerar,
    );
    expect(r.motivo).toBe('sem-proxima-competencia');
    expect(gerar).not.toHaveBeenCalled();
  });

  it('geração falhou: reporta, mas não lança — o fechamento não se desfaz', async () => {
    const gerar = vi.fn(async () => ({ error: 'IA fora do ar' }));
    const r = await encadearProximaJornada(
      sbFake({ id: 'c1', cargo: 'Coordenador' }),
      tdbFake({
        trilhas: [TRILHA_JORNADA],
        cargos_empresa: { competencias_foco: ['Liderança', 'Relacionamento com Clientes'] },
      }),
      't1',
      gerar,
    );
    expect(r.encadeou).toBe(false);
    expect(r.motivo).toBe('falhou');
    expect(r.competencia).toBe('Relacionamento com Clientes');
  });
});

/**
 * Personalizado com 2 competências (03/10/2026): o MESMO encadeamento, mas a
 * próxima competência é a 2ª da sequência gravada no snapshot da 1ª trilha
 * (decidida e validada na geração), e as regras da 2ª são as do snapshot, não
 * as da tela no dia. Terminada a 2ª, o programa acaba.
 */
describe('encadeamento do Personalizado', () => {
  const snapshot = (posicao: number, competencias = ['Liderança', 'Comunicação']) => ({
    modo: 'regular', semanas: 5, semanasMissao: [], semanasAvaliacao: [5], semanasCheckpoint: [],
    semanaCenarioB: 5, semanaAcumulada: 4, slotsConteudo: [1, 2, 3, 4], blocosCobertos: {}, complexidadeMap: {},
    nivelMetaAlvo: 3, numCompetencias: 1, conteudosPorSemana: 2, desafioUnicoPorCompetencia: true,
    arguicao: { ativa: true, maxTurnos: 6 },
    sequenciaPersonalizado: { competencias, posicao },
  });
  const trilhaCustom = (programa_config: any) => ({
    ...TRILHA_JORNADA, programa_modo: 'custom', competencia_foco: 'Liderança', programa_config,
  });

  it('1ª de 2 concluída: gera a 2ª com novaJornada e as regras congeladas (posição 2)', async () => {
    const gerar = vi.fn(async () => ({ ok: true, trilhaId: 't2' }));
    const r = await encadearProximaJornada(sbFake({ id: 'c1' }), tdbFake({ trilhas: [trilhaCustom(snapshot(1))] }), 't1', gerar);
    expect(r).toMatchObject({ encadeou: true, competencia: 'Comunicação', numeroTemporada: 2 });
    expect(gerar).toHaveBeenCalledTimes(1);
    const args = (gerar.mock.calls[0] as any[])[0];
    expect(args).toMatchObject({ colaboradorId: 'c1', competencia: 'Comunicação', novaJornada: true, empresaIdEsperado: 'e1' });
    expect(args.configPersonalizado.sequenciaPersonalizado).toEqual({ competencias: ['Liderança', 'Comunicação'], posicao: 2 });
    expect(args.configPersonalizado.semanas).toBe(5);
  });

  it('2ª de 2 concluída: o programa acabou, nada é gerado', async () => {
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbFake({ id: 'c1' }), tdbFake({ trilhas: [trilhaCustom(snapshot(2))] }), 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'sem-proxima-competencia' });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('Personalizado de 1 competência (snapshot sem sequência) não encadeia', async () => {
    const { sequenciaPersonalizado: _fora, ...semSequencia } = snapshot(1);
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbFake({ id: 'c1' }), tdbFake({ trilhas: [trilhaCustom(semSequencia)] }), 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'modo-nao-encadeia' });
    expect(gerar).not.toHaveBeenCalled();
  });

  it('falha ao ler o snapshot: não encadeia e reporta "falhou" (não vira "programa de 1 competência")', async () => {
    let chamadas = 0;
    const tdb = {
      from() {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => {
            chamadas++;
            return chamadas === 1
              ? { data: trilhaCustom(snapshot(1)), error: null }
              : { data: null, error: { message: 'timeout no pool' } };
          },
        };
        return chain;
      },
    };
    const gerar = vi.fn();
    const r = await encadearProximaJornada(sbFake({ id: 'c1' }), tdb, 't1', gerar);
    expect(r).toEqual({ encadeou: false, motivo: 'falhou' });
    expect(gerar).not.toHaveBeenCalled();
  });
});
