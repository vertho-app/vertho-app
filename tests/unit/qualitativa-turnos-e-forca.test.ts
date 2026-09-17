import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { turnosIaNecessarios, TURNOS_IA_AVALIACAO_QUALITATIVA } from '@/lib/season-engine/week-gating';
import { qualitativaDoPlano } from '@/lib/season-engine/trilha-runtime';
import { qualitativaSustenta } from '@/lib/season-engine/convergencia';

/**
 * A CONVERSA QUALITATIVA: onde ela fica, quanto custa, e quando a leitura dela
 * pode votar na convergência.
 *
 * Dois defeitos desta família, os dois medidos em 03/09/2026 (Ibipeba):
 *
 * 1. **O tamanho vivia num `semana === 13` literal.** Com a qualitativa movida
 *    para a semana 8, a régua deixou de casar: a tela prometia 6 turnos (o
 *    default de conteúdo) onde a rota exigia 12. Régua duplicada não diverge um
 *    dia — nasce divergente.
 *
 * 2. **Leitura FRACA votava na convergência.** O extrator é honesto quando a
 *    conversa não sustenta um descritor (`forca_evidencia: 'fraca'`), mas o
 *    validador dá `nivel_percebido` **default 2.0**, e o report usava esse
 *    número sem olhar a força. Com `nota_pre` em 1,5 — a média real do tenant —,
 *    `2.0 > 1.5` classificava como **evolução parcial** um descritor que a
 *    conversa nunca tocou.
 */

const PLANO_REGULAR = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 13, tipo: 'avaliacao' },
  { semana: 14, tipo: 'avaliacao' },
];

/** Encerramento de Ibipeba: qualitativa na 8, com o custo carimbado no slot. */
const PLANO_CURTO = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 7, tipo: 'conteudo' },
  { semana: 8, tipo: 'avaliacao', turnos_ia: 8 },
  { semana: 9, tipo: 'avaliacao' },
];

const PLANO_JORNADA = [
  { semana: 1, tipo: 'conteudo' },
  { semana: 7, tipo: 'avaliacao' },
];

describe('qualitativaDoPlano', () => {
  it('acha a semana e o custo carimbados no slot', () => {
    expect(qualitativaDoPlano(PLANO_CURTO)).toEqual({ semana: 8, turnos: 8 });
  });

  it('sem `turnos_ia` no slot, devolve a semana e deixa o custo em aberto', () => {
    expect(qualitativaDoPlano(PLANO_REGULAR)).toEqual({ semana: 13, turnos: undefined });
  });

  it('formato de UM slot de avaliação não tem qualitativa separada', () => {
    expect(qualitativaDoPlano(PLANO_JORNADA)).toBeNull();
    expect(qualitativaDoPlano(null)).toBeNull();
  });

  it('ignora `turnos_ia` inválido em vez de propagar lixo', () => {
    const sujo = [
      { semana: 8, tipo: 'avaliacao', turnos_ia: 0 },
      { semana: 9, tipo: 'avaliacao' },
    ];
    expect(qualitativaDoPlano(sujo)?.turnos).toBeUndefined();
  });
});

describe('turnosIaNecessarios', () => {
  it('a qualitativa na 8 custa o que o plano diz, não o default', () => {
    // 8 de propósito: não coincide com NENHUM default (6 conteúdo, 10
    // aplicação, 12 qualitativa). Com 6 — o número que Ibipeba vai usar — este
    // teste passaria mesmo se a régua ignorasse o plano e caísse no default de
    // conteúdo. Foi o que a 1ª prova de mutação revelou: verde por coincidência.
    expect(turnosIaNecessarios(8, 'avaliacao', null, qualitativaDoPlano(PLANO_CURTO))).toBe(8);
  });

  it('🔴 sem a régua do plano, a semana 8 cairia em 6 por ser "não-13" — o bug', () => {
    // Este é o caso que quebrava: a chamada antiga (sem o 4º argumento) não
    // sabe que a 8 é a qualitativa e devolve o default de conteúdo.
    expect(turnosIaNecessarios(8, 'avaliacao', null)).toBe(MAX_CONTEUDO);
    // Com a régua, a mesma semana passa a valer o que o plano diz.
    expect(turnosIaNecessarios(8, 'avaliacao', null, qualitativaDoPlano(PLANO_CURTO))).toBe(8);
  });

  it('o formato de 14 semanas segue byte-igual', () => {
    expect(turnosIaNecessarios(13, 'avaliacao', null, qualitativaDoPlano(PLANO_REGULAR)))
      .toBe(TURNOS_IA_AVALIACAO_QUALITATIVA);
    expect(turnosIaNecessarios(13, 'avaliacao', null)).toBe(TURNOS_IA_AVALIACAO_QUALITATIVA);
  });

  it('semana de conteúdo e de aplicação não mudam', () => {
    expect(turnosIaNecessarios(3, 'conteudo', null, qualitativaDoPlano(PLANO_CURTO))).toBe(6);
    expect(turnosIaNecessarios(4, 'aplicacao', 'pratica', qualitativaDoPlano(PLANO_CURTO))).toBe(10);
  });
});

const MAX_CONTEUDO = 6;

describe('força da evidência da conversa (informação, não veredito)', () => {
  // ⚠️ Até 17/09/2026 esta força decidia se a leitura qualitativa VOTAVA no
  // veredito. Desde então o veredito é só pelo avanço, e `qualitativaSustenta`
  // alimenta o aviso da tela de admin ("sem evidência na conversa sobre este
  // descritor"). O que continua valendo é a leitura conservadora da força.
  it('fraca não sustenta; moderada e forte sustentam', () => {
    expect(qualitativaSustenta({ forca_evidencia: 'fraca' })).toBe(false);
    expect(qualitativaSustenta({ forca_evidencia: 'moderada' })).toBe(true);
    expect(qualitativaSustenta({ forca_evidencia: 'forte' })).toBe(true);
  });

  it('força ausente é tratada como fraca: o report não inventa confiança', () => {
    expect(qualitativaSustenta({ forca_evidencia: null })).toBe(false);
    expect(qualitativaSustenta(undefined)).toBe(false);
  });

  it('o report classifica sem passar a leitura qualitativa para a régua', () => {
    const core = readFileSync('lib/season-engine/evolution-report-core.ts', 'utf8');
    expect(core).toContain('classificarConvergencia({ nota_pre, nota_pos })');
  });
});
