import { describe, expect, it } from 'vitest';
import { duracaoDaTrilha, ehUltimaSemanaDaTrilha, semanasDeDesenvolvimentoDoPlano } from '@/lib/season-engine/duracao-trilha';
import {
  getProgramaConfigDaGeracao,
  getProgramaConfigDaTrilha,
  PROGRAMA_JORNADA,
  PROGRAMA_REGULAR_DUO,
} from '@/lib/season-engine/programa-config';
import { derivarConfigCustom } from '@/lib/season-engine/programa-custom';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';

/**
 * R-29 e R-101 (revisão de 02/10/2026): a duração de uma trilha tem UMA fonte.
 *
 * Cada peça contava de um jeito (certificado pela config, WhatsApp pelo tamanho
 * do plano, conclusão com `|| 14`, conversa qualitativa com "12" escrito à mão),
 * e a função síncrona de config só lia o snapshot do Personalizado. Medido em
 * 03/10/2026: as 37 trilhas da Ibipeba são `regular_duo` com snapshot de 9
 * semanas. Lendo só o rótulo, o painel do gestor dizia 14 e acusava de atraso
 * quem já tinha concluído tudo.
 *
 * Validado por mutação (ver o relatório): fazer `duracaoDaTrilha` ignorar o
 * snapshot, ou devolver o tamanho do plano, derruba os casos "Ibipeba" e
 * "regular_duo sem snapshot".
 */

const plano = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1 }));
/** O snapshot que a Ibipeba carrega no banco (medido 03/10/2026, 37 trilhas). */
const SNAPSHOT_IBIPEBA = {
  modo: 'regular', semanas: 9, arguicao: { ativa: true, maxTurnos: 8 }, nivelMetaAlvo: 3,
  semanasMissao: [4], slotsConteudo: [1, 2, 3, 5, 6, 7], blocosCobertos: { 4: 3 }, semanaCenarioB: 9,
  complexidadeMap: { 4: 'simples' }, numCompetencias: 2, semanaAcumulada: 8, semanasAvaliacao: [8, 9],
  conteudosPorSemana: 2, desafioUnicoPorCompetencia: true,
};

describe('duracaoDaTrilha: a config do snapshot ou do carimbo', () => {
  it('Jornada: 7', () => {
    expect(duracaoDaTrilha({ programa_modo: 'jornada', programa_config: null, temporada_plano: plano(7) })).toBe(7);
  });

  it('Onboarding: 9 (começa no fundamento desde 04/10/2026, R-20)', () => {
    expect(duracaoDaTrilha({ programa_modo: 'onboarding' })).toBe(9);
  });

  it('🔴 a Ibipeba (regular_duo com snapshot de 9) é 9, e não os 14 do rótulo', () => {
    const trilha = { programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA, temporada_plano: plano(9) };
    expect(duracaoDaTrilha(trilha)).toBe(9);
    // E é o que a função SÍNCRONA de config também diz: era ela que lia 14.
    expect(getProgramaConfigDaTrilha(trilha).semanas).toBe(9);
  });

  it('o snapshot vence o rótulo mesmo sem o plano no select (o painel do gestor não puxa o plano)', () => {
    expect(duracaoDaTrilha({ programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA })).toBe(9);
  });

  it('regular_duo SEM snapshot é 14, e o tamanho do plano não decide (a regra do certificado, 23/09)', () => {
    expect(duracaoDaTrilha({ programa_modo: 'regular_duo', programa_config: null, temporada_plano: plano(9) })).toBe(14);
  });

  it('trilha legada sem carimbo (null) é o DUO de 14, como o plano dela', () => {
    expect(duracaoDaTrilha({ programa_modo: null, programa_config: null, temporada_plano: plano(14) })).toBe(14);
  });

  it('Personalizado com snapshot: as semanas do snapshot (com fechamento, uma a mais)', () => {
    const cfg = JSON.parse(JSON.stringify(derivarConfigCustom({ semanas: 4, numCompetencias: 2, fechamento: true })));
    expect(duracaoDaTrilha({ programa_modo: 'custom', programa_config: cfg, temporada_plano: plano(5) })).toBe(5);
    const sem = JSON.parse(JSON.stringify(derivarConfigCustom({ semanas: 3, numCompetencias: 1, fechamento: false })));
    expect(duracaoDaTrilha({ programa_modo: 'custom', programa_config: sem })).toBe(3);
  });

  it('Personalizado SEM snapshot: o plano responde (o rótulo sozinho não tem a duração)', () => {
    expect(duracaoDaTrilha({ programa_modo: 'custom', programa_config: null, temporada_plano: plano(4) })).toBe(4);
  });

  it('Personalizado sem snapshot e sem plano: o `programa_custom` da empresa, se veio', () => {
    expect(duracaoDaTrilha(
      { programa_modo: 'custom', programa_config: null },
      { programa_custom: { semanas: 2, numCompetencias: 1, fechamento: true } },
    )).toBe(3);
  });

  it('o chamador que NÃO trouxe o carimbo (undefined) é lido pelo plano, não pelo programa legado', () => {
    // Era assim que o WhatsApp contava (`temporada_plano.length`): o select dele
    // não pedia o carimbo. `undefined` é "não selecionei", e `null` é "trilha legada".
    expect(duracaoDaTrilha({ temporada_plano: plano(9) })).toBe(9);
    expect(duracaoDaTrilha({ temporada_plano: plano(7) })).toBe(7);
  });

  it('sem nenhuma fonte, cai no programa legado (nunca 0, nunca NaN)', () => {
    expect(duracaoDaTrilha(null)).toBe(PROGRAMA_REGULAR_DUO.semanas);
    expect(duracaoDaTrilha({})).toBe(PROGRAMA_REGULAR_DUO.semanas);
  });
});

describe('uma fonte: a função síncrona e a assíncrona de config dizem a mesma duração', () => {
  const sbSemBanco: any = { from: () => { throw new Error('não deveria ir ao banco'); } };
  const matriz: Array<[string, any]> = [
    ['jornada', { programa_modo: 'jornada', programa_config: null, empresa_id: 'e' }],
    ['onboarding', { programa_modo: 'onboarding', programa_config: null, empresa_id: 'e' }],
    ['regular_single', { programa_modo: 'regular_single', programa_config: null, empresa_id: 'e' }],
    ['regular_duo sem snapshot', { programa_modo: 'regular_duo', programa_config: null, empresa_id: 'e' }],
    ['regular_duo com snapshot (Ibipeba)', { programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA, empresa_id: 'e' }],
    ['custom com snapshot', {
      programa_modo: 'custom', empresa_id: 'e',
      programa_config: JSON.parse(JSON.stringify(derivarConfigCustom({ semanas: 5, numCompetencias: 1, fechamento: true }))),
    }],
  ];

  it.each(matriz)('%s', async (_nome, trilha) => {
    const assincrona = await resolverConfigDaTrilha(sbSemBanco, trilha);
    expect(duracaoDaTrilha(trilha)).toBe(assincrona.semanas);
    expect(getProgramaConfigDaTrilha(trilha).semanas).toBe(assincrona.semanas);
  });
});

describe('getProgramaConfigDaTrilha: o snapshot que antecede um campo', () => {
  it('completa os checkpoints que o snapshot da Ibipeba não grava, sem passar do fim do plano', () => {
    // O DUO tem checkpoints [5, 10]; num programa de 9 semanas a 10 nunca chega.
    const cfg = getProgramaConfigDaTrilha({ programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA });
    expect(cfg.semanasCheckpoint).toEqual([5]);
    expect(cfg.semanas).toBe(9);
    expect(cfg.desafioUnicoPorCompetencia).toBe(true);
  });

  it('sem snapshot devolve a MESMA constante do carimbo (nada em andamento muda)', () => {
    expect(getProgramaConfigDaTrilha({ programa_modo: 'jornada' })).toBe(PROGRAMA_JORNADA);
    expect(getProgramaConfigDaTrilha({ programa_modo: 'regular_duo', programa_config: null })).toBe(PROGRAMA_REGULAR_DUO);
  });

  it('snapshot inválido é ignorado: o carimbo manda', () => {
    expect(getProgramaConfigDaTrilha({ programa_modo: 'jornada', programa_config: { semanas: 'nove' } })).toBe(PROGRAMA_JORNADA);
  });
});

describe('getProgramaConfigDaGeracao: o programa que uma geração nova aplicaria', () => {
  it('ausente ou desconhecido é a Jornada (padrão desde 03/10/2026)', () => {
    expect(getProgramaConfigDaGeracao({}).semanas).toBe(7);
    expect(getProgramaConfigDaGeracao(null).semanas).toBe(7);
    expect(getProgramaConfigDaGeracao({ programa_modo: 'quatorze' }).semanas).toBe(7);
  });

  it('o formato descontinuado segue lido: regular (grafia antiga) é o DUO', () => {
    expect(getProgramaConfigDaGeracao({ programa_modo: 'regular' }).semanas).toBe(14);
    expect(getProgramaConfigDaGeracao({ programa_modo: 'regular_duo' })).toBe(PROGRAMA_REGULAR_DUO);
  });

  it('Personalizado deriva de `programa_custom`', () => {
    expect(getProgramaConfigDaGeracao({
      programa_modo: 'custom', programa_custom: { semanas: 4, numCompetencias: 2, fechamento: false },
    }).semanas).toBe(4);
  });
});

describe('semanasDeDesenvolvimentoDoPlano: o "nessas N semanas" da conversa qualitativa', () => {
  const comAvaliacoes = (total: number, avaliacoes: number[]) =>
    Array.from({ length: total }, (_, i) => ({ semana: i + 1, tipo: avaliacoes.includes(i + 1) ? 'avaliacao' : 'conteudo' }));

  it('formato de 14 (qualitativa na 13): 12 semanas', () => {
    expect(semanasDeDesenvolvimentoDoPlano(comAvaliacoes(14, [13, 14]))).toBe(12);
  });

  it('🔴 encerramento da Ibipeba (qualitativa na 8): 7 semanas, e não as 12 escritas à mão', () => {
    expect(semanasDeDesenvolvimentoDoPlano(comAvaliacoes(9, [8, 9]))).toBe(7);
  });

  it('plano sem conversa qualitativa (Jornada, um slot de avaliação) não tem o número', () => {
    expect(semanasDeDesenvolvimentoDoPlano(comAvaliacoes(7, [7]))).toBeNull();
    expect(semanasDeDesenvolvimentoDoPlano([])).toBeNull();
    expect(semanasDeDesenvolvimentoDoPlano(null)).toBeNull();
  });
});

describe('ehUltimaSemanaDaTrilha: o que a tela diz ao fim da conversa da semana (R-30)', () => {
  it('Jornada de 7: a conversa da semana 6 anuncia a próxima; a da 7 fecha a temporada', () => {
    const jornada = { programa_modo: 'jornada', programa_config: null };
    expect(ehUltimaSemanaDaTrilha(jornada, 6)).toBe(false);
    expect(ehUltimaSemanaDaTrilha(jornada, 7)).toBe(true);
  });

  it('🔴 Personalizado de 3 semanas SEM fechamento: a conversa da semana 3 já é o fim (não existe a 4)', () => {
    const cfg = JSON.parse(JSON.stringify(derivarConfigCustom({ semanas: 3, numCompetencias: 1, fechamento: false })));
    const trilha = { programa_modo: 'custom', programa_config: cfg };
    expect(ehUltimaSemanaDaTrilha(trilha, 2)).toBe(false);
    expect(ehUltimaSemanaDaTrilha(trilha, 3)).toBe(true);
  });

  it('Personalizado COM fechamento: a última semana de conteúdo ainda anuncia o fechamento', () => {
    const cfg = JSON.parse(JSON.stringify(derivarConfigCustom({ semanas: 3, numCompetencias: 1, fechamento: true })));
    const trilha = { programa_modo: 'custom', programa_config: cfg };
    expect(ehUltimaSemanaDaTrilha(trilha, 3)).toBe(false);
    expect(ehUltimaSemanaDaTrilha(trilha, 4)).toBe(true);
  });

  it('formato de 14 e o encerramento da Ibipeba (9)', () => {
    expect(ehUltimaSemanaDaTrilha({ programa_modo: 'regular_duo', programa_config: null }, 13)).toBe(false);
    expect(ehUltimaSemanaDaTrilha({ programa_modo: 'regular_duo', programa_config: null }, 14)).toBe(true);
    expect(ehUltimaSemanaDaTrilha({ programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA }, 9)).toBe(true);
    expect(ehUltimaSemanaDaTrilha({ programa_modo: 'regular_duo', programa_config: SNAPSHOT_IBIPEBA }, 8)).toBe(false);
  });
});
