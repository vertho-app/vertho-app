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
      { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'c1', cargo: 'Coordenador', empresa_id: 'e1' } }) }) }) }) },
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
      { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'c1' } }) }) }) }) },
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
      { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'c1', cargo: 'Coordenador' } }) }) }) }) },
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
      { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'c1', cargo: 'Coordenador' } }) }) }) }) },
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
