import { describe, expect, it } from 'vitest';
import { consolidarMatriz, validarMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';
import { pontuacaoMatriz, notaPacePublica } from '@/lib/simulador-vendas/escala';
import { pontuarRelatorio } from '@/lib/simulador-vendas/avaliacao';
import { podeEncerrar, periodoVigente, TOLERANCIA_ENCERRAR_MS } from '@/lib/simulador-vendas/prazo';
import { REGUA_VERSION } from '@/lib/simulador-vendas/schema';
import { REGRA_COBERTURA } from '@/lib/simuladores/cobertura';
import { avaliacaoMatriz, estadoMatriz } from '../fixtures/simulador-vendas-matriz';
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
    expect(r.regraCobertura).toBe(REGRA_COBERTURA.versao);
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
    expect(r.regraCobertura).toBe(REGRA_COBERTURA.versao);
  });

  it('nível em E5/E6 é descartado, não aproveitado', () => {
    const m = avaliacaoMatriz(3);
    const e5 = m.descritores.find((d) => d.codigo === 'E5')!;
    e5.nivel = 4;
    e5.evidencias = [{ origem: 'conversa', turno: 1, citacao: 'Como vocês administram o estoque hoje?' }];
    expect(validarMatriz(m, estadoMatriz()).descartados).toEqual(['E5']);
  });

  it('nota pública da pace-7 já é 1 a 4 (sem conversão)', () => {
    expect(notaPacePublica(3.25, 'pace-7')).toBe(3.25);
    expect(notaPacePublica(7.5, 'pace-5')).toBe(3.25);
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
