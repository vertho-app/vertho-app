import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Coletor e agenda dos roteiros em lote (`lib/video/roteiro-lote.ts`, 30/09/2026).
 *
 * O coletor tem que etiquetar o custo como `conteudo_video` (o coletor do Kit é
 * `kit_semanal`; misturar os dois apaga o custo do vídeo no ledger) e esperar o
 * bastante para os roteiros de um lote chegarem juntos. A agenda espaça os
 * disparos a partir do INSTANTE de cada um, não do índice: um roteiro que cai no
 * síncrono e chega atrasado sai na hora.
 */

const RUN = vi.fn();
const createAIBatchCollector = vi.fn((..._a: any[]) => ({ run: RUN }));
vi.mock('@/lib/ai-batch', () => ({ createAIBatchCollector: (...a: any[]) => (createAIBatchCollector as any)(...a) }));
const getModelForTask = vi.fn(async (..._a: any[]) => 'claude-opus-5');
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: (...a: any[]) => (getModelForTask as any)(...a) }));

import {
  coletorDeRoteiros, criarAgendaDeDisparo,
  ORCAMENTO_LOTE_ROTEIRO_MS, INTERVALO_DISPARO_PADRAO_S, TETO_ATRASO_DISPARO_S,
} from '@/lib/video/roteiro-lote';

beforeEach(() => {
  createAIBatchCollector.mockClear();
  getModelForTask.mockClear();
});

describe('coletorDeRoteiros', () => {
  it('etiqueta o lote como conteudo_video, com a empresa, e espera os roteiros chegarem juntos', async () => {
    const run = await coletorDeRoteiros('emp-1');
    expect(run).toBe(RUN);
    expect(getModelForTask.mock.calls[0][1]).toBe('conteudo_video');
    const [modelo, opts] = createAIBatchCollector.mock.calls[0] as any[];
    expect(modelo).toBe('claude-opus-5');
    expect(opts.ledger).toEqual({ feature: 'conteudo_video', empresaId: 'emp-1' });
    expect(opts.windowMs).toBeGreaterThanOrEqual(2000);
    expect(opts.budgetMs).toBe(ORCAMENTO_LOTE_ROTEIRO_MS);
  });

  it('aceita outro orçamento (o script espera mais que o Kit, que roda com teto de 1 h)', async () => {
    await coletorDeRoteiros('emp-1', { budgetMs: 30 * 60_000 });
    expect((createAIBatchCollector.mock.calls[0] as any[])[1].budgetMs).toBe(30 * 60_000);
  });

  it('leitura falha da config de modelo não derruba o lote', async () => {
    getModelForTask.mockRejectedValueOnce(new Error('config indisponível'));
    await expect(coletorDeRoteiros(null)).resolves.toBe(RUN);
  });
});

describe('criarAgendaDeDisparo', () => {
  it('espaça pelo intervalo a partir do último disparo: 0, +210, +420 s', () => {
    let t = 0;
    const agenda = criarAgendaDeDisparo(210, () => t);
    expect([agenda.proximoAtrasoS(), agenda.proximoAtrasoS(), agenda.proximoAtrasoS()]).toEqual([0, 210, 420]);
    expect(INTERVALO_DISPARO_PADRAO_S).toBe(210);
  });

  it('quem chega depois da vaga sai na hora (não é índice × intervalo)', () => {
    let t = 0;
    const agenda = criarAgendaDeDisparo(210, () => t);
    expect(agenda.proximoAtrasoS()).toBe(0);
    expect(agenda.proximoAtrasoS()).toBe(210);
    // O 3º roteiro caiu no síncrono e chegou 1.000 s depois: a vaga dele (420 s) já passou.
    t = 1_000_000;
    expect(agenda.proximoAtrasoS()).toBe(0);
    // E o próximo conta a partir DELE.
    expect(agenda.proximoAtrasoS()).toBe(210);
  });

  it('acima do teto (alarme video-stale em 2 h), recusa em vez de agendar calado', () => {
    const agenda = criarAgendaDeDisparo(TETO_ATRASO_DISPARO_S * 0.6, () => 0);
    expect(agenda.proximoAtrasoS()).toBe(0);
    expect(agenda.proximoAtrasoS()).toBeLessThanOrEqual(TETO_ATRASO_DISPARO_S);
    expect(() => agenda.proximoAtrasoS()).toThrow(/teto/);
    expect(TETO_ATRASO_DISPARO_S).toBeLessThan(2 * 3600);
  });

  it('intervalo inválido é recusado na criação', () => {
    expect(() => criarAgendaDeDisparo(-1)).toThrow(/inválido/);
    expect(() => criarAgendaDeDisparo(Number.NaN)).toThrow(/inválido/);
  });
});
