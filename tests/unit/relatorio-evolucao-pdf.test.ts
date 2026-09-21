/**
 * O PDF executivo de evolução afirma coisas: a variação de cada pessoa, os
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
import {
  pct, comSinal, formatarNumeroRelatorio, paginarPessoas, selecionarMultiplicadores,
  montarRadaresPorCompetencia, paginarRadares, pontosRadar, paginarComportamentos,
  paginarCargosNoAvanco,
} from '@/components/pdf/RelatorioEvolucao';

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
  it('marca o positivo, aplica piso zero e mostra uma casa decimal', () => {
    expect(comSinal(0.85)).toBe('+0,9');
    expect(comSinal(0)).toBe('0,0');
    expect(comSinal(-0.3)).toBe('0,0');
  });

  it('usa arredondamento convencional e vírgula decimal', () => {
    expect(formatarNumeroRelatorio(1.25)).toBe('1,3');
    expect(formatarNumeroRelatorio(1.24)).toBe('1,2');
    expect(formatarNumeroRelatorio(3.51)).toBe('3,5');
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

describe('radares de descritores por competência', () => {
  it('não mistura descritores de competências diferentes', () => {
    const competencias = [
      { chave: 'Competência A' },
      { chave: 'Competência B' },
    ] as any;
    const descritores = [
      { chave: 'Descritor A2', competencia: 'Competência A' },
      { chave: 'Descritor B1', competencia: 'Competência B' },
      { chave: 'Descritor A1', competencia: 'Competência A' },
    ] as any;

    const radares = montarRadaresPorCompetencia(competencias, descritores);
    expect(radares.map((radar) => radar.descritores.map((d) => d.chave))).toEqual([
      ['Descritor A1', 'Descritor A2'],
      ['Descritor B1'],
    ]);
  });

  it('mantém no máximo dois cartões por página', () => {
    const radares = Array.from({ length: 5 }, (_, i) => ({ competencia: { chave: String(i) }, descritores: [{}] })) as any;
    expect(paginarRadares(radares).map((pagina) => pagina.length)).toEqual([2, 2, 1]);
  });

  it('gera um vértice por descritor e grampeia valores na régua', () => {
    expect(pontosRadar([1, 2, 3, 4]).split(' ')).toHaveLength(4);
    expect(pontosRadar([9, 9, 9])).toBe(pontosRadar([4, 4, 4]));
    expect(pontosRadar([-1, -1, -1])).toBe(pontosRadar([0, 0, 0]));
  });
});

describe('separação editorial por cargo', () => {
  it('pagina comportamentos sem misturar a sequência de outro recorte', () => {
    const comportamentos = Array.from({ length: 45 }, (_, i) => ({ chave: String(i) })) as any;
    expect(paginarComportamentos(comportamentos).map((pagina) => pagina.length)).toEqual([22, 22, 1]);
  });

  it('identifica o cargo em todas as seções analíticas', () => {
    expect(FONTE).toContain('<CabecalhoCargo recorte={cargo} />');
    expect(FONTE).toContain('recortesCargo.flatMap');
    expect(FONTE).toContain('<Text style={s.cargoEyebrow}>Cargo</Text>');
    expect(FONTE).not.toContain('Recorte por cargo');
  });

  it('aproveita a mesma página para cargos pequenos sem fundir os dados', () => {
    const recortes = [2, 2, 5].map((quantidade, i) => ({
      cargo: `Cargo ${i}`,
      porCompetencia: Array.from({ length: quantidade }, () => ({})),
    })) as any;
    expect(paginarCargosNoAvanco(recortes).map((pagina) => pagina.map((cargo) => cargo.cargo))).toEqual([
      ['Cargo 0', 'Cargo 1'],
      ['Cargo 2'],
    ]);
  });
});

describe('as afirmações do papel vêm da comparação entre cenários', () => {
  it('não renderiza classificação de convergência ou sustentação', () => {
    expect(FONTE).not.toContain('rotuloConvergencia');
    expect(FONTE).not.toContain('CONVERGENCIA');
    expect(FONTE).not.toContain('vereditoRotulo');
    expect(FONTE).not.toContain('CartaoVeredito');
    expect(FONTE).not.toContain('<Pill');
  });

  it('explica que evidências não alteram a medida externa', () => {
    expect(FONTE).toContain('compara exclusivamente os resultados dos cenários inicial e final');
    expect(FONTE).toContain('não alteram notas, avanços ou níveis deste relatório');
  });

  it('remove a página de método e seus detalhes técnicos', () => {
    expect(FONTE).not.toContain('Como isto foi medido');
    expect(FONTE).not.toContain('RUIDO_MEDIDO');
    expect(FONTE).not.toContain('TETO_N3');
    expect(FONTE).not.toContain('CORTE_CONFIRMADA');
  });

  it('mostra somente o nome dos níveis na faixa da régua', () => {
    expect(FONTE).toContain("label: 'N1'");
    expect(FONTE).toContain("label: 'N4'");
    expect(FONTE).not.toContain("label: 'N1 ·");
    expect(FONTE).not.toContain("label: 'N4 ·");
  });

  it('não renderiza o cartão de sem medição no fechamento', () => {
    expect(FONTE).not.toContain('n={resumo.semVeredito}');
  });

  it('não explica oscilação de nota no texto do relatório', () => {
    expect(FONTE).not.toContain('quando a variação é negativa');
  });
});
