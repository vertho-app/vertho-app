import { describe, it, expect } from 'vitest';
import {
  semanasAvaliacaoDoPlano,
  semanaCenarioBDoPlano,
  ehSemanaQualitativa,
} from '@/lib/season-engine/trilha-runtime';

/**
 * ONDE ESTÃO AS SEMANAS DE AVALIAÇÃO — a régua que a tela da semana usa para
 * escolher o endpoint, o slot do transcript, o redirecionamento para o wizard e
 * os rótulos dos botões.
 *
 * 🔴 O QUE ELA PROTEGE (medido 01/09/2026). A tela decidia isso por número
 * literal em OITO lugares (`semanaNum === 13` / `=== 14`), e o formato de 14
 * semanas deixou de ser o único: `PROGRAMA_JORNADA` põe o fechamento na semana
 * **7** (38 trilhas de Macaé, início 17/08, fechamento por volta de 28/09) e o
 * encerramento de Ibipeba o põe na **9**, com a conversa qualitativa na **8**.
 *
 * O mais caro dos oito era o endpoint: `isEvalSemana = semanaNum === 13 || === 14`
 * mandava qualquer conversa de avaliação fora dessas duas para `/reflection` em
 * vez de `/evaluation` — a rota de conteúdo, que grava no slot errado e nunca
 * conclui a semana. Nenhum teste pegava, porque nenhuma trilha de outro formato
 * tinha chegado ao fechamento ainda (0 evolution_report fora do piloto).
 *
 * Por isso os casos abaixo cobrem os TRÊS formatos que existem em produção, e
 * não só o de 14 semanas.
 */

/** Regular / DUO: qualitativa na 13, cenário B na 14. */
const PLANO_REGULAR = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 4, tipo: 'aplicacao' },
  { semana: 12, tipo: 'aplicacao' },
  { semana: 13, tipo: 'avaliacao' },
  { semana: 14, tipo: 'avaliacao' },
];

/** Jornada (Macaé): 6 de conteúdo + fechamento na 7, sem qualitativa separada. */
const PLANO_JORNADA = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 6, tipo: 'conteudo' },
  { semana: 7, tipo: 'avaliacao' },
];

/** Encerramento de Ibipeba: 7 de conteúdo, qualitativa na 8, cenário B na 9. */
const PLANO_IBIPEBA = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 4, tipo: 'aplicacao' },
  { semana: 7, tipo: 'conteudo' },
  { semana: 8, tipo: 'avaliacao' },
  { semana: 9, tipo: 'avaliacao' },
];

describe('semanasAvaliacaoDoPlano', () => {
  it('lista as avaliações em ordem crescente', () => {
    expect(semanasAvaliacaoDoPlano(PLANO_REGULAR)).toEqual([13, 14]);
    expect(semanasAvaliacaoDoPlano(PLANO_IBIPEBA)).toEqual([8, 9]);
    expect(semanasAvaliacaoDoPlano(PLANO_JORNADA)).toEqual([7]);
  });

  it('ordena mesmo com o plano fora de ordem', () => {
    const embaralhado = [
      { semana: 9, tipo: 'avaliacao' },
      { semana: 1, tipo: 'conteudo' },
      { semana: 8, tipo: 'avaliacao' },
    ];
    expect(semanasAvaliacaoDoPlano(embaralhado)).toEqual([8, 9]);
  });

  it('devolve lista vazia sem plano, para o caller cair no fallback', () => {
    expect(semanasAvaliacaoDoPlano(null)).toEqual([]);
    expect(semanasAvaliacaoDoPlano([])).toEqual([]);
    expect(semanasAvaliacaoDoPlano('nao é array' as any)).toEqual([]);
  });

  it('ignora slot de avaliação sem número de semana utilizável', () => {
    const sujo = [
      { semana: 8, tipo: 'avaliacao' },
      { semana: null, tipo: 'avaliacao' },
      { tipo: 'avaliacao' },
    ];
    expect(semanasAvaliacaoDoPlano(sujo)).toEqual([8]);
  });
});

describe('semanaCenarioBDoPlano', () => {
  it('é a ÚLTIMA avaliação do plano, nos três formatos em produção', () => {
    expect(semanaCenarioBDoPlano(PLANO_REGULAR)).toBe(14);
    expect(semanaCenarioBDoPlano(PLANO_JORNADA)).toBe(7);
    expect(semanaCenarioBDoPlano(PLANO_IBIPEBA)).toBe(9);
  });

  it('NÃO devolve a qualitativa quando há duas avaliações', () => {
    // A regressão que este arquivo existe para impedir: pegar a primeira
    // avaliação mandaria a conversa qualitativa para o wizard do cenário B.
    expect(semanaCenarioBDoPlano(PLANO_IBIPEBA)).not.toBe(8);
    expect(semanaCenarioBDoPlano(PLANO_REGULAR)).not.toBe(13);
  });

  it('cai no fallback só quando o plano não tem avaliação nenhuma', () => {
    expect(semanaCenarioBDoPlano([{ semana: 1, tipo: 'conteudo' }])).toBe(14);
    expect(semanaCenarioBDoPlano(null)).toBe(14);
    expect(semanaCenarioBDoPlano(null, 7)).toBe(7);
  });
});

describe('ehSemanaQualitativa', () => {
  it('reconhece a avaliação que NÃO é o fechamento', () => {
    expect(ehSemanaQualitativa(PLANO_REGULAR, 13)).toBe(true);
    expect(ehSemanaQualitativa(PLANO_IBIPEBA, 8)).toBe(true);
  });

  it('o fechamento nunca é qualitativa', () => {
    expect(ehSemanaQualitativa(PLANO_REGULAR, 14)).toBe(false);
    expect(ehSemanaQualitativa(PLANO_IBIPEBA, 9)).toBe(false);
  });

  it('formato de UM slot só (jornada, piloto) não tem qualitativa', () => {
    // Lá a acumulada roda em background sobre a última semana de CONTEÚDO —
    // não existe tela de conversa qualitativa para mostrar.
    expect(ehSemanaQualitativa(PLANO_JORNADA, 7)).toBe(false);
    expect(ehSemanaQualitativa(PLANO_JORNADA, 6)).toBe(false);
  });

  it('semana de conteúdo ou de aplicação nunca é qualitativa', () => {
    expect(ehSemanaQualitativa(PLANO_IBIPEBA, 7)).toBe(false);
    expect(ehSemanaQualitativa(PLANO_IBIPEBA, 4)).toBe(false);
    expect(ehSemanaQualitativa(PLANO_REGULAR, 12)).toBe(false);
  });

  it('aceita a semana como string, que é como ela chega da rota', () => {
    expect(ehSemanaQualitativa(PLANO_IBIPEBA, '8')).toBe(true);
    expect(ehSemanaQualitativa(PLANO_IBIPEBA, '9')).toBe(false);
  });
});

describe('a régua junta responde o que a tela pergunta', () => {
  /**
   * Espelha as três decisões da tela da semana: qual endpoint chamar, qual slot
   * do JSONB ler e se redireciona para o wizard. Se uma delas voltar a decidir
   * por número literal, o caso de Ibipeba abaixo falha.
   */
  const decidir = (plano: any, semana: number, tipoSlot: string) => {
    const semCenarioB = semanaCenarioBDoPlano(plano, 14);
    const qualitativa = ehSemanaQualitativa(plano, semana);
    return {
      endpoint: qualitativa || semana === semCenarioB ? '/evaluation' : '/reflection',
      slot: tipoSlot === 'aplicacao' || semana === semCenarioB ? 'feedback' : 'reflexao',
      redirecionaParaWizard: semana === semCenarioB,
    };
  };

  it('Ibipeba: a qualitativa (8) fala com /evaluation e NÃO vai para o wizard', () => {
    expect(decidir(PLANO_IBIPEBA, 8, 'avaliacao')).toEqual({
      endpoint: '/evaluation',
      slot: 'reflexao',
      redirecionaParaWizard: false,
    });
  });

  it('Ibipeba: o fechamento (9) vai para o wizard e grava em feedback', () => {
    expect(decidir(PLANO_IBIPEBA, 9, 'avaliacao')).toEqual({
      endpoint: '/evaluation',
      slot: 'feedback',
      redirecionaParaWizard: true,
    });
  });

  it('Jornada: o fechamento (7) vai para o wizard, sem qualitativa antes', () => {
    expect(decidir(PLANO_JORNADA, 7, 'avaliacao')).toEqual({
      endpoint: '/evaluation',
      slot: 'feedback',
      redirecionaParaWizard: true,
    });
  });

  it('Regular: 13 e 14 seguem exatamente como antes desta mudança', () => {
    expect(decidir(PLANO_REGULAR, 13, 'avaliacao')).toEqual({
      endpoint: '/evaluation',
      slot: 'reflexao',
      redirecionaParaWizard: false,
    });
    expect(decidir(PLANO_REGULAR, 14, 'avaliacao')).toEqual({
      endpoint: '/evaluation',
      slot: 'feedback',
      redirecionaParaWizard: true,
    });
  });

  it('semana de conteúdo continua em /reflection nos três formatos', () => {
    expect(decidir(PLANO_IBIPEBA, 7, 'conteudo').endpoint).toBe('/reflection');
    expect(decidir(PLANO_JORNADA, 6, 'conteudo').endpoint).toBe('/reflection');
    expect(decidir(PLANO_REGULAR, 1, 'conteudo').endpoint).toBe('/reflection');
  });
});
