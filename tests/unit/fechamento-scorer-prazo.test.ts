import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import {
  pontuarFechamento, timeoutDoScorer, timeoutDoCheck,
  SCORER_TIMEOUT_MAX_MS, SCORER_TIMEOUT_MIN_MS,
} from '@/lib/season-engine/fechamento-scorer';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { callAI } from '@/actions/ai-client';

/**
 * 🔴 O que isto trava (16/09/2026): o scorer do fechamento chamava `callAI` sem
 * `timeoutMs` e morria no teto de 120 s. A única execução que passou em
 * produção levou 119.748 ms. Aqui se prova que (a) o scorer ganha teto próprio,
 * (b) dentro de uma função com prazo ele recebe o que SOBRA, e (c) quando não
 * cabe, não gasta uma chamada que certamente morreria.
 */
const mockAI = vi.mocked(callAI);

const scoreOk = JSON.stringify({
  avaliacao_por_descritor: [{ descritor: 'D1', nota_pre: 2, nota_pos: 2.5, justificativa: 'j' }],
  resumo_avaliacao: { mensagem_geral: 'Alias, mensagem longa o bastante para o aviso de nome não disparar aqui.' },
});
const checkOk = JSON.stringify({ nota_auditoria: 90, status: 'aprovado', resumo_auditoria: 'ok' });

const args = {
  competencia: 'Comp',
  descritores: [{ descritor: 'D1', nota_atual: 2 }],
  cenario: '## C',
  resposta: 'r',
  nomeColab: 'Alias',
  evidenciasAcumuladas: 'e',
  acumuladoPrimaria: null,
  config: PROGRAMA_REGULAR_DUO,
};

const AGORA = Date.parse('2026-09-16T15:00:00Z');

beforeEach(() => {
  mockAI.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

describe('timeoutDoScorer / timeoutDoCheck', () => {
  it('sem prazo: scorer no teto próprio (acima dos 120 s do wrapper); check no default', () => {
    expect(timeoutDoScorer(undefined, AGORA)).toBe(SCORER_TIMEOUT_MAX_MS);
    expect(SCORER_TIMEOUT_MAX_MS).toBeGreaterThan(120_000);
    expect(timeoutDoCheck(undefined, AGORA)).toBeUndefined();
  });

  it('com prazo folgado: scorer no teto, com reserva para o que vem depois', () => {
    expect(timeoutDoScorer(AGORA + 285_000, AGORA)).toBe(SCORER_TIMEOUT_MAX_MS);
  });

  it('com prazo apertado: scorer recebe o que sobra menos a reserva', () => {
    const t = timeoutDoScorer(AGORA + 150_000, AGORA)!;
    expect(t).toBeLessThan(150_000);
    expect(t).toBeGreaterThanOrEqual(SCORER_TIMEOUT_MIN_MS);
  });

  it('sem espaço para uma tentativa: null', () => {
    expect(timeoutDoScorer(AGORA + 100_000, AGORA)).toBeNull();
    expect(timeoutDoCheck(AGORA + 15_000, AGORA)).toBeNull();
  });
});

describe('pontuarFechamento com prazo', () => {
  it('passa timeoutMs e a atribuição de ledger para o scorer e o check', async () => {
    mockAI.mockResolvedValueOnce(scoreOk).mockResolvedValueOnce(checkOk);
    const r = await pontuarFechamento({ ...args, prazoMs: AGORA + 285_000, ledger: { empresaId: 'emp', colaboradorId: 'col' } } as any);
    expect(r.ok).toBe(true);
    const optsScorer = mockAI.mock.calls[0][4] as any;
    const optsCheck = mockAI.mock.calls[1][4] as any;
    expect(optsScorer).toMatchObject({ taskKey: 'sem14_scorer', timeoutMs: SCORER_TIMEOUT_MAX_MS, empresaId: 'emp', colaboradorId: 'col' });
    expect(optsCheck.taskKey).toBe('sem14_check');
    expect(optsCheck.timeoutMs).toBeGreaterThan(0);
    expect(optsCheck.empresaId).toBe('emp');
  });

  it('sem prazo (script/admin): scorer ainda recebe o teto próprio, nunca o default de 120 s', async () => {
    mockAI.mockResolvedValueOnce(scoreOk).mockResolvedValueOnce(checkOk);
    await pontuarFechamento(args as any);
    expect((mockAI.mock.calls[0][4] as any).timeoutMs).toBe(SCORER_TIMEOUT_MAX_MS);
    expect((mockAI.mock.calls[1][4] as any).timeoutMs).toBeUndefined();
  });

  it('prazo que não comporta o scorer: nenhuma chamada, ok:false com aviso', async () => {
    const r = await pontuarFechamento({ ...args, prazoMs: AGORA + 60_000 } as any);
    expect(mockAI).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.meta.warnings.some(w => w.includes('sem tempo'))).toBe(true);
  });

  it('2ª tentativa só roda se couber: parse falhou e o relógio andou → 1 chamada só', async () => {
    mockAI.mockImplementationOnce(async () => {
      vi.setSystemTime(AGORA + 125_000); // o scorer levou o que leva em produção
      return 'não é json';
    });
    const r = await pontuarFechamento({ ...args, prazoMs: AGORA + 254_000 } as any);
    expect(mockAI).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
  });

  it('check sem espaço é pulado com aviso e NÃO derruba a nota', async () => {
    mockAI.mockImplementationOnce(async () => {
      vi.setSystemTime(AGORA + 270_000);
      return scoreOk;
    });
    const r = await pontuarFechamento({ ...args, prazoMs: AGORA + 285_000 } as any);
    expect(mockAI).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.meta.warnings.some(w => w.includes('check da 2ª IA pulado'))).toBe(true);
  });
});
