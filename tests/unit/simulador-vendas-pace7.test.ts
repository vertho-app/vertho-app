import { describe, expect, it } from 'vitest';
import {
  consolidarMatriz,
  REGRA_COBERTURA_VENDAS,
  validarMatriz,
} from '@/lib/simulador-vendas/matriz-avaliacao';
import { competenciasDaMatriz } from '@/components/simulador-vendas/relatorio-matriz';
import { pontuacaoMatriz, notaPacePublica } from '@/lib/simulador-vendas/escala';
import { pontuarRelatorio } from '@/lib/simulador-vendas/avaliacao';
import { podeEncerrar, periodoVigente, TOLERANCIA_ENCERRAR_MS } from '@/lib/simulador-vendas/prazo';
import { REGUA_VERSION } from '@/lib/simulador-vendas/schema';
import { REGRA_COBERTURA } from '@/lib/simuladores/cobertura';
import { avaliacaoMatriz, estadoMatriz, FALA, PLANO } from '../fixtures/simulador-vendas-matriz';
import { relatorio } from '../fixtures/simulador-vendas';

/**
 * pace-7 (18/09/2026): regra de cobertura comum aos três simuladores, E5/E6 fora
 * da reunião inicial, citação tolerante e 24 h para pedir a devolutiva depois do
 * prazo. As versões anteriores seguem lidas como foram geradas.
 */
const semNivel = (m: ReturnType<typeof avaliacaoMatriz>, codigos: string[]) => {
  for (const d of m.descritores)
    if (codigos.includes(d.codigo)) {
      d.nivel = null;
      d.evidencias = [];
    }
  return m;
};

describe('pace-7: régua de cobertura no vendas', () => {
  it('é a régua dos treinos novos', () => {
    expect(REGUA_VERSION).toBe('pace-7');
  });

  it('E5 e E6 saem do total de Engajar; com 4 observados a competência tem nível', () => {
    const e = consolidarMatriz(avaliacaoMatriz(3), 'pace-7').find((c) => c.codigo === 'E')!;
    expect(e).toMatchObject({ observados: 4, total: 4, nota: 3, nivel: 3, suficiente: true });
    // Na pace-6 o total era 6 e não havia mínimo.
    expect(consolidarMatriz(avaliacaoMatriz(3), 'pace-6').find((c) => c.codigo === 'E')).toMatchObject({ total: 6, nota: 3 });
  });

  it('competência com 3 observados fica sem nível; a média exige 3 competências com nível', () => {
    const m = semNivel(avaliacaoMatriz(3), ['P4', 'P5', 'P6', 'A4', 'A5', 'A6', 'C4', 'C5', 'C6']);
    const r = pontuacaoMatriz(m, 'pace-7');
    expect(r).toMatchObject({ P: null, A: null, C: null, PL: 3, E: 3 });
    expect(r.Media).toBeNull();
    expect(r.regraCobertura).toBe(REGRA_COBERTURA_VENDAS.versao);
    // A mesma matriz na pace-6 média os observados, sem mínimo.
    expect(pontuacaoMatriz(m, 'pace-6').Media).toBe(3);
  });

  it('conversa curta (plano, abertura e uma pergunta) deixa de fechar na meta', () => {
    const todos = avaliacaoMatriz(3).descritores.map((d) => d.codigo);
    const observados = ['PL1', 'PL2', 'P1', 'A1'];
    const m = semNivel(avaliacaoMatriz(3), todos.filter((c) => !observados.includes(c)));
    expect(pontuacaoMatriz(m, 'pace-6').Media).toBe(3);
    expect(pontuacaoMatriz(m, 'pace-7').Media).toBeNull();
  });

  it('o relatório grava a matriz validada, com o descritor descartado e as notas sem ele', () => {
    const s = { ...estadoMatriz(), versaoRegua: 'pace-7' };
    const m = avaliacaoMatriz(3);
    m.descritores.find((d) => d.codigo === 'A1')!.evidencias[0].citacao = 'Frase que o vendedor nunca disse.';
    const r = pontuarRelatorio({ ...structuredClone(relatorio), Matriz: m } as any, s as any);
    expect(r.Matriz?.descartados).toEqual(['A1']);
    expect(r.Matriz?.descritores.find((d) => d.codigo === 'A1')?.nivel).toBeNull();
    expect(r.A).toBe(3); // 5 de 6 observados: continua com nível
    expect(r.regraCobertura).toBe(REGRA_COBERTURA_VENDAS.versao);
  });

  it('nível em E5/E6 é zerado numa lista própria, não aproveitado nem tratado como citação errada', () => {
    const m = avaliacaoMatriz(3);
    const e5 = m.descritores.find((d) => d.codigo === 'E5')!;
    e5.nivel = 4;
    e5.evidencias = [{ origem: 'conversa', turno: 1, citacao: 'Como vocês administram o estoque hoje?' }];
    const gravada = validarMatriz(m, estadoMatriz());
    expect(gravada.foraDaReuniao).toEqual(['E5']);
    expect(gravada.descartados).toBeUndefined();
    expect(gravada.descritores.find((d) => d.codigo === 'E5')).toMatchObject({ nivel: null, evidencias: [] });
  });
});

/**
 * V-4 da revisão de 27/09/2026 (sonda E5/E6 invertida). Nível em E5/E6 entrava
 * em `invalidos` e em `avaliados`: numa conversa curta (6 avaliados, cota de
 * citação inválida = 1), E5 + E6 = 2 recusavam a avaliação inteira com a
 * mensagem falsa "citação que não confere", o gerente era pago de novo e, na
 * segunda recusa, a pessoa recebia 502.
 */
describe('V-4: E5/E6 fora da cota de citação inválida', () => {
  function matrizCurta(comE5E6: boolean) {
    const m = avaliacaoMatriz(3);
    const observados = new Set(['PL1', 'PL2', 'PL3', 'PL4', 'P1', 'A1', ...(comE5E6 ? ['E5', 'E6'] : [])]);
    for (const d of m.descritores) {
      if (!observados.has(d.codigo)) {
        d.nivel = null;
        d.evidencias = [];
        continue;
      }
      d.nivel = 2;
      d.evidencias = [
        d.codigo.startsWith('PL')
          ? { origem: 'planejamento' as const, turno: null, citacao: PLANO }
          : { origem: 'conversa' as const, turno: 1, citacao: FALA },
      ];
    }
    return m;
  }
  const s = { ...estadoMatriz(), versaoRegua: 'pace-7' };

  it('conversa curta com nível em E5/E6 e citações corretas é aceita, com E5/E6 nulos', () => {
    const r = validarMatriz(matrizCurta(true), s);
    expect(r.descartados).toBeUndefined();
    expect(r.foraDaReuniao).toEqual(['E5', 'E6']);
    for (const codigo of ['E5', 'E6'])
      expect(r.descritores.find((d) => d.codigo === codigo)).toMatchObject({ nivel: null, evidencias: [] });
    expect(r.descritores.filter((d) => d.nivel !== null)).toHaveLength(6);
  });

  it('a cota continua valendo para as citações dos avaliáveis', () => {
    const m = matrizCurta(true);
    // Duas citações erradas entre 6 avaliáveis passam da cota (1): recusa, como antes.
    for (const codigo of ['P1', 'A1'])
      m.descritores.find((d) => d.codigo === codigo)!.evidencias[0].citacao = 'Frase que o vendedor nunca disse.';
    expect(() => validarMatriz(m, s)).toThrow(/Evidência inválida/);
  });

  it('o relatório gravado sai com as notas sem E5/E6', () => {
    const r = pontuarRelatorio({ ...structuredClone(relatorio), Matriz: matrizCurta(true) } as any, s as any);
    expect(r.Matriz?.foraDaReuniao).toEqual(['E5', 'E6']);
    expect(r.E).toBeNull();
  });

  it('nota pública da pace-7 já é 1 a 4 (sem conversão)', () => {
    expect(notaPacePublica(3.25, 'pace-7')).toBe(3.25);
    expect(notaPacePublica(7.5, 'pace-5')).toBe(3.25);
  });
});

/**
 * V-12 da revisão de 27/09/2026 (decisão D5 do dono). Com E5/E6 fora da reunião
 * inicial, Engajar exigia 4 de 4 comportamentos (100%) e as outras 4 de 6, sob
 * uma regra chamada `cobertura-4de6-3comp`. Agora é proporcional (dois terços
 * dos avaliáveis) e a regra tem outro nome; relatório gravado com a regra
 * anterior continua lido com ela.
 */
describe('V-12 (D5): Engajar exige 3 de 4, proporcional aos 4 de 6', () => {
  const semP5P6E4 = () => semNivel(avaliacaoMatriz(3), ['P5', 'P6', 'E4']);

  it('treino novo: 4 de 6 dá nível em Preparar e 3 de 4 dá nível em Engajar', () => {
    const comp = consolidarMatriz(semP5P6E4(), 'pace-7');
    expect(comp.find((c) => c.codigo === 'P')).toMatchObject({ observados: 4, total: 6, nivel: 3 });
    expect(comp.find((c) => c.codigo === 'E')).toMatchObject({ observados: 3, total: 4, nivel: 3, suficiente: true });
    // Abaixo de dois terços continua sem nível: 3 de 6 e 2 de 4.
    const pouco = consolidarMatriz(semNivel(avaliacaoMatriz(3), ['P4', 'P5', 'P6', 'E3', 'E4']), 'pace-7');
    expect(pouco.find((c) => c.codigo === 'P')).toMatchObject({ observados: 3, nivel: null });
    expect(pouco.find((c) => c.codigo === 'E')).toMatchObject({ observados: 2, nivel: null });
  });

  it('a regra nova tem nome que descreve a verdade e é a gravada nos relatórios novos', () => {
    expect(REGRA_COBERTURA_VENDAS.versao).toBe('cobertura-2tercos-3comp');
    expect(REGRA_COBERTURA_VENDAS.versao).not.toBe(REGRA_COBERTURA.versao);
    const r = pontuacaoMatriz(semP5P6E4(), 'pace-7');
    expect(r.regraCobertura).toBe('cobertura-2tercos-3comp');
    expect(r.E).toBe(3);
    // Atendimento e liderança seguem a regra comum.
    expect(REGRA_COBERTURA.versao).toBe('cobertura-4de6-3comp');
  });

  it('relatório gravado com a regra anterior é lido como foi gerado (Engajar 4 de 4)', () => {
    const m = semP5P6E4();
    const antigo = consolidarMatriz(m, 'pace-7', 'cobertura-4de6-3comp');
    expect(antigo.find((c) => c.codigo === 'E')).toMatchObject({ observados: 3, nivel: null });
    expect(pontuacaoMatriz(m, 'pace-7', 'cobertura-4de6-3comp')).toMatchObject({
      E: null,
      regraCobertura: 'cobertura-4de6-3comp',
    });
    // A devolutiva usa a regra gravada no relatório.
    const rotulos = { nome: (c: string) => c, origem: () => '' };
    const tela = (regra?: string) =>
      competenciasDaMatriz(m, 'pace-7', rotulos, {}, regra).competencias.find((c) => c.codigo === 'E')!;
    expect(tela('cobertura-4de6-3comp').nivel).toBeNull();
    expect(tela('cobertura-2tercos-3comp').nivel).toBe(3);
  });

  it('pace-6 e anteriores seguem sem mínimo', () => {
    expect(consolidarMatriz(semP5P6E4(), 'pace-6').find((c) => c.codigo === 'E')).toMatchObject({ total: 6, nivel: 3 });
  });
});

describe('prazo: 24 h para pedir a devolutiva depois do fim', () => {
  const inicio = '2026-09-01T00:00:00.000Z';
  const fim = '2026-09-18T21:00:00.000Z';
  const c = { periodo_inicio: inicio, periodo_fim: fim };
  const t = (iso: string) => Date.parse(iso);
  it('dentro do prazo, tudo vale', () => {
    expect(periodoVigente(c, t('2026-09-10T12:00:00.000Z'))).toBe(true);
    expect(podeEncerrar(c, t('2026-09-10T12:00:00.000Z'))).toBe(true);
  });
  it('depois do fim, só o encerramento, e só por 24 h', () => {
    const umaHoraDepois = t(fim) + 60 * 60 * 1000;
    expect(periodoVigente(c, umaHoraDepois)).toBe(false);
    expect(podeEncerrar(c, umaHoraDepois)).toBe(true);
    expect(podeEncerrar(c, t(fim) + TOLERANCIA_ENCERRAR_MS)).toBe(false);
  });
  it('antes do início e sem período, nada', () => {
    expect(podeEncerrar(c, t('2026-08-31T12:00:00.000Z'))).toBe(false);
    expect(podeEncerrar({ periodo_inicio: null, periodo_fim: null })).toBe(false);
  });
});
