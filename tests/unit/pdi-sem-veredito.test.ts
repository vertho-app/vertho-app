import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isValidElement } from 'react';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { nivelColor, nivelBgColor, nivelLabel, colors } from '@/components/pdf/styles';
import { semComentarios } from '../helpers/fonte';

/**
 * O PDI mostra o NÍVEL como ponto de partida, nunca como veredito (R-38, 04/10/2026).
 *
 * Antes, na tela e no PDF: a seção "Resumo de Desempenho" com "Excelente / Bom / Em
 * desenvolvimento / Atenção"; o Nível 1 recebia o selo "Atenção" e uma barra
 * vermelha; e o nível aparecia como porcentagem (Nível 3 = 75%). O PDI é o documento
 * que a PESSOA leva para casa. Decisão do dono: nível 1 a 4, sem vermelho, sem rótulo
 * avaliativo e sem "desempenho".
 */

/** O texto do PDF na ordem em que vai para o papel, lido da árvore (sem renderizar, sem rede). */
function textos(no: any, out: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return out;
  if (typeof no === 'string' || typeof no === 'number') { out.push(String(no)); return out; }
  if (Array.isArray(no)) { for (const n of no) textos(n, out); return out; }
  if (isValidElement(no)) {
    const { type, props } = no as any;
    return typeof type === 'function' ? textos(type(props), out) : textos(props?.children, out);
  }
  return out;
}

const competencia = (nome: string, nivel: number) => ({
  nome, nivel, flag: nivel <= 1, fez_bem: ['x'], melhorar: ['y'], feedback: 'f', descritores_desenvolvimento: ['d'],
});
const COMPETENCIAS = [competencia('Escuta', 1), competencia('Planejamento', 2), competencia('Delegação', 3), competencia('Visão', 4)];

const pdf = () => textos(RelatorioIndividualPDF({
  data: {
    conteudo: {
      competencias: COMPETENCIAS,
      resumo_desempenho: COMPETENCIAS.map((c) => ({ competencia: c.nome, nivel: c.nivel })),
    },
    colaborador_nome: 'Pessoa Teste',
  },
  empresaNome: 'Empresa',
} as any)).join('\n');

describe('PDF do PDI: ponto de partida por competência, em nível', () => {
  it('a seção se chama "Ponto de partida por competência", não "Resumo de Desempenho"', () => {
    const t = pdf();
    expect(t).toContain('Ponto de partida por competência');
    expect(t).not.toContain('Resumo de Desempenho');
  });

  it('cada competência mostra "Nível N" nos quatro níveis', () => {
    const t = pdf();
    for (const n of [1, 2, 3, 4]) expect(t, `Nível ${n}`).toContain(`Nível ${n}`);
  });

  it('na tabela, cada competência traz o seu "Nível N" na linha (sem o selo do bloco ao lado)', () => {
    const t = pdf();
    const tabela = t.slice(t.indexOf('Ponto de partida por competência'));
    expect(tabela.slice(0, 400)).toContain('Escuta\nNível 1\nPlanejamento\nNível 2\nDelegação\nNível 3\nVisão\nNível 4');
  });

  it('nenhum rótulo avaliativo, nenhum selo de alarme e nenhuma porcentagem de nível', () => {
    const t = pdf();
    expect(t).not.toMatch(/Excelente|Em Desenvolvimento|Atenção Prioritária|Pendente|\bBom\b/);
    expect(t).not.toMatch(/\b(?:25|50|75|100)%/);
    expect(t).not.toContain('Desempenho');
  });

  it('a competência prioritária ganha "Prioridade", não o selo vermelho', () => {
    expect(pdf()).toContain('Prioridade');
  });
});

describe('cores e rótulos do nível no PDF', () => {
  it('o N1 não é vermelho nem em texto nem em fundo', () => {
    expect(nivelColor(1)).not.toBe(colors.nivelRed);
    expect(nivelBgColor(1)).not.toBe('#FEE2E2');
    expect(nivelColor(1)).toBe(nivelColor(2));
  });

  it('o rótulo é "Nível N" para os quatro, sem palavra avaliativa', () => {
    expect([1, 2, 3, 4].map(nivelLabel)).toEqual(['Nível 1', 'Nível 2', 'Nível 3', 'Nível 4']);
    expect(nivelLabel(0)).toBe('Nível 1');
    expect(nivelLabel(9)).toBe('Nível 4');
  });
});

describe('tela do PDI', () => {
  const TELA = semComentarios(readFileSync('app/dashboard/pdi/page.tsx', 'utf8'));

  it('não tem rótulo avaliativo nem cor por nível: texto "Nível N", uma cor só', () => {
    expect(TELA).not.toMatch(/nivelLabel|nivelColor|nivelBg\b|level\.(excellent|good|developing|attention)/);
    expect(TELA).toContain("t('levelValue'");
    // uma cor só para os quatro níveis (as outras cores da tela são de outras seções)
    expect(TELA).toContain("const NIVEL_COR = '#06B6D4'");
    expect(TELA).not.toMatch(/n >= 4 \? '#|nivel >= 4 \? '#/);
  });

  it.each(['pt-BR', 'pt-PT', 'es-ES', 'en-US'])('%s: as chaves avaliativas saíram e "desempenho" não é mais o título', (loc) => {
    const pdi = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8')).Pdi;
    expect(pdi.level).toBeUndefined();
    expect(pdi.levelValue).toContain('{n}');
    expect(pdi.sections.performanceSummary).not.toMatch(/Desempenho|Desempeño|Performance/i);
  });
});
