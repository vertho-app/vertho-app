/**
 * O PDF executivo de evolução afirma coisas: o veredito de cada pessoa, os
 * cortes da régua e a PRECISÃO do instrumento. Papel circula na organização do
 * cliente e não tem como ser corrigido depois — então as afirmações dele têm que
 * vir das fontes vivas, não de texto digitado ao lado.
 *
 * Este arquivo cobre as duas maneiras de isso quebrar em silêncio:
 *   1. a barra sair fora da escala da régua (nenhum typecheck vê);
 *   2. alguém escrever o número ou o rótulo à mão, e o papel passar a discordar
 *      da régua no dia em que ela for recalibrada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pct, comSinal, paginarPessoas, selecionarMultiplicadores } from '@/components/pdf/RelatorioEvolucao';

const FONTE = readFileSync(join(__dirname, '..', '..', 'components', 'pdf', 'RelatorioEvolucao.tsx'), 'utf8');

describe('escala da barra', () => {
  it('mapeia a régua de 1 a 4 no trilho inteiro', () => {
    // 1,00 é o piso da régua (barra vazia), 4,00 o teto (barra cheia). Barra
    // normalizada pelo próprio valor faria um avanço de 0,1 parecer enorme.
    expect(pct(1)).toBe('0%');
    expect(pct(4)).toBe('100%');
    expect(pct(2.5)).toBe('50%');
    expect(pct(2)).toBe('33%');
    expect(pct(3)).toBe('67%');
  });

  it('grampeia nota fora da régua em vez de estourar o trilho', () => {
    // Relatório legado pode trazer 0 ou 5; barra de 167% vaza a página.
    expect(pct(0)).toBe('0%');
    expect(pct(9)).toBe('100%');
    expect(pct(undefined as any)).toBe('0%');
  });
});

describe('sinal do avanço', () => {
  it('marca o positivo e aplica piso zero à variação negativa', () => {
    expect(comSinal(0.85)).toBe('+0,85');
    expect(comSinal(0)).toBe('0,00');
    expect(comSinal(-0.3)).toBe('0,00');
  });

  it('usa vírgula decimal — o documento é em português', () => {
    expect(comSinal(1.5)).not.toContain('.');
  });
});

describe('paginação da tabela nominal', () => {
  it('equilibra as linhas em vez de deixar uma órfã na página seguinte', () => {
    const pessoas = Array.from({ length: 22 }, (_, i) => ({ colaboradorId: String(i) })) as any;
    expect(paginarPessoas(pessoas).map((pagina) => pagina.length)).toEqual([11, 11]);
  });

  it('mantém uma turma de 11 pessoas em uma página', () => {
    const pessoas = Array.from({ length: 11 }, (_, i) => ({ colaboradorId: String(i) })) as any;
    expect(paginarPessoas(pessoas)).toHaveLength(1);
  });
});

describe('multiplicadores', () => {
  it('inclui somente competências encerradas no N4', () => {
    const pessoas = [
      { nome: 'N3', mediaPos: 3.5 },
      { nome: 'N4', mediaPos: 3.51 },
      { nome: 'N4 alto', mediaPos: 4 },
    ] as any;
    expect(selecionarMultiplicadores(pessoas).map((p) => p.nome)).toEqual(['N4', 'N4 alto']);
  });
});

describe('as afirmações do papel vêm das fontes vivas', () => {
  it('lê a régua de convergência, a de nível e o ruído medido por IMPORT', () => {
    // Se um destes sair do import, o número continua no papel depois de deixar
    // de ser verdade — e nada na tela acusa.
    for (const simbolo of ['CORTE_CONFIRMADA', 'CORTE_PARCIAL', 'TETO_N3', 'RUIDO_MEDIDO', 'rotuloConvergencia']) {
      expect(FONTE).toContain(simbolo);
    }
    expect(FONTE).toMatch(/import \{[\s\S]*?rotuloConvergencia[\s\S]*?\} from '@\/lib\/season-engine\/convergencia'/);
    expect(FONTE).toMatch(/import \{ RUIDO_MEDIDO \} from '@\/lib\/season-engine\/prompts\/extrator-conversa'/);
  });

  it('não escreve o rótulo do veredito à mão', () => {
    // "Estável" e "Evolução confirmada" saem de `rotuloConvergencia`; digitá-los
    // aqui recria a divergência que a régua única existe para impedir.
    const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const rotulo of ['Evolução confirmada', 'Evolução parcial', 'Estagnação']) {
      expect(semComentarios).not.toContain(`'${rotulo}'`);
      expect(semComentarios).not.toContain(`"${rotulo}"`);
    }
  });

  it('não repete os cortes como número literal no texto do documento', () => {
    const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // O texto da página de método é interpolado com `num(CORTE_*)`; um "0,50"
    // digitado sobreviveria a uma recalibragem da régua.
    expect(semComentarios).not.toMatch(/'[^']*0,50 ponto/);
    expect(semComentarios).not.toMatch(/'[^']*0,20 ponto/);
  });

  it('não renderiza o cartão de sem medição no fechamento', () => {
    expect(FONTE).not.toContain('n={resumo.semVeredito}');
  });
});
