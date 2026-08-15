import { describe, it, expect } from 'vitest';
import { blueprintToTrilhaInputs } from '@/lib/blueprint/to-descriptors';
import { PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';

/**
 * O nome da competência vem de DUAS fontes que não combinam: o assessment
 * guarda o que está em `competencias.nome` (em Macaé, "GERENCIAMENTO DE
 * CONFLITOS", caixa alta) e a IA do blueprint reescreve em caixa mista
 * ("Gerenciamento de Conflitos"). O adapter normalizava os DESCRITORES e usava
 * o nome da competência cru como chave — então nada casava, ele devolvia
 * "semana 1 sem nenhum descritor resolvível", e o caller caía no fallback.
 *
 * O sintoma não era erro: era a trilha sair com 4 descritores e 1 pílula por
 * semana em vez de 2, com o blueprint inteiro descartado em silêncio. Medido
 * 14/08 na primeira trilha de Macaé.
 */
const COMP_ASSESSMENT = 'GERENCIAMENTO DE CONFLITOS';
const COMP_BLUEPRINT = 'Gerenciamento de Conflitos';

const DESCRITORES = [
  'Postura diante do conflito', 'Neutralidade', 'Escuta das partes',
  'Identificação de causas', 'Uso de CNV/mediação', 'Construção de soluções',
];

const assessment = DESCRITORES.map((d, i) => ({ descritor: d, nota: 1.3 + i * 0.15 }));

/** 6 semanas de conteúdo com 2 descritores distintos cada + avaliação na 7. */
function blueprintFake(nomeComp: string) {
  const pares = [[0, 1], [2, 3], [4, 5], [0, 1], [2, 3], [4, 5]];
  return {
    competencias: [{ nome: nomeComp, objetivos_30_dias: [{ id: 'obj-1', objetivo: 'x', acao_principal: 'y' }] }],
    trilha: {
      semanas: [
        ...pares.map((p, i) => ({
          semana: i + 1, tipo: 'conteudo',
          competencia_foco: [nomeComp],
          descritores_foco: [DESCRITORES[p[0]], DESCRITORES[p[1]]],
          objetivo_da_semana: 'o', conexao_com_pdi: ['obj-1'],
        })),
        { semana: 7, tipo: 'avaliacao', competencia_foco: [nomeComp], descritores_foco: [DESCRITORES[0]], conexao_com_pdi: ['obj-1'] },
      ],
    },
  };
}

describe('blueprintToTrilhaInputs — competência com grafia diferente', () => {
  it('casa o blueprint mesmo quando a caixa do nome da competência difere', () => {
    const r: any = blueprintToTrilhaInputs(
      blueprintFake(COMP_BLUEPRINT) as any,
      { [COMP_ASSESSMENT]: assessment },
      PROGRAMA_JORNADA,
    );
    expect(r.error).toBeUndefined();
    expect(r.descritoresSelecionados.length).toBeGreaterThanOrEqual(6);

    // Cada semana de conteúdo recebe 2 descritores DISTINTOS — é isso que
    // sustenta `conteudosPorSemana: 2` da jornada.
    for (const semana of PROGRAMA_JORNADA.slotsConteudo) {
      const naSemana = r.descritoresSelecionados.filter((d: any) => d.semanas_ids.includes(semana));
      expect(naSemana.length, `semana ${semana}`).toBe(2);
      expect(new Set(naSemana.map((d: any) => d.descritor)).size).toBe(2);
    }
  });

  it('devolve a competência com o nome do ASSESSMENT, não o do blueprint', () => {
    const r: any = blueprintToTrilhaInputs(
      blueprintFake(COMP_BLUEPRINT) as any,
      { [COMP_ASSESSMENT]: assessment },
      PROGRAMA_JORNADA,
    );
    // É esse nome que a trilha grava e por onde o resolver casa `micro_conteudos`;
    // devolver a grafia do blueprint moveria o problema para a seleção de conteúdo.
    for (const d of r.descritoresSelecionados) expect(d.competencia).toBe(COMP_ASSESSMENT);
  });

  it('continua funcionando quando as grafias coincidem', () => {
    const r: any = blueprintToTrilhaInputs(
      blueprintFake(COMP_ASSESSMENT) as any,
      { [COMP_ASSESSMENT]: assessment },
      PROGRAMA_JORNADA,
    );
    expect(r.error).toBeUndefined();
    expect(r.descritoresSelecionados.length).toBeGreaterThanOrEqual(6);
  });
});
