import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Roteiro do vídeo pelo coletor de lote (`gerarRoteiroDeModulo`, `aiRunRoteiro`).
 *
 * Por que (30/09/2026): o roteiro do Kit saía síncrono a ~US$ 0,224; no lote, ~0,133.
 * Quatro garantias:
 *   1. com o coletor, a 1ª tentativa vai por ele, com a etiqueta e o teto certos, e o
 *      síncrono não é chamado;
 *   2. se o texto do lote não parsear, a 2ª tentativa é UM síncrono (`batch-sync`):
 *      repetir pelo coletor abriria outra rodada de lote EM SÉRIE;
 *   3. o `forceSync` sem coletor é síncrono por escolha, sem o rótulo `batch-sync`
 *      (que em `lib/ai-batch.ts` significa lote degradado);
 *   4. `VIDEO_ROTEIRO_MODE=sync` desliga o coletor.
 */

const callAI = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAI(...a) }));
const submitClaudeBatch = vi.fn();
vi.mock('@/lib/ai-batch', () => ({ submitClaudeBatch: (...a: any[]) => submitClaudeBatch(...a) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'claude-opus-5') }));
vi.mock('@/lib/video/roteiro-prompt', () => ({
  buildRoteiroPrompt: () => ({ system: 'SYS', user: 'USER' }),
  parseRoteiro: (raw: string) => (raw === 'ROTEIRO' ? { title: 'T', scenes: [] } : null),
  normalizarRoteiro: (r: any) => r,
}));

import { gerarRoteiroDeModulo } from '@/lib/video/gerar-roteiro';

const M = { titulo: 'M' } as any;

beforeEach(() => {
  vi.unstubAllEnvs();
  callAI.mockReset();
  submitClaudeBatch.mockReset();
});

describe('gerarRoteiroDeModulo com coletor de lote', () => {
  it('a 1ª tentativa vai pelo coletor, com taskKey, empresaId e teto de 16.000; nada síncrono', async () => {
    const coletor = vi.fn(async () => 'ROTEIRO');
    const r = await gerarRoteiroDeModulo(M, { forceSync: true, empresaId: 'emp-1', aiRunRoteiro: coletor });

    expect(r.roteiro).toEqual({ title: 'T', scenes: [] });
    expect(coletor).toHaveBeenCalledTimes(1);
    expect(coletor).toHaveBeenCalledWith('SYS', 'USER', { model: 'claude-opus-5' }, 16_000, { taskKey: 'conteudo_video', empresaId: 'emp-1' });
    expect(callAI).not.toHaveBeenCalled();
    expect(submitClaudeBatch).not.toHaveBeenCalled();
  });

  it('texto do lote não parseia: a 2ª tentativa é UM síncrono rotulado batch-sync, sem 2ª rodada no coletor', async () => {
    const coletor = vi.fn(async () => 'lixo');
    callAI.mockResolvedValue('ROTEIRO');
    const r = await gerarRoteiroDeModulo(M, { empresaId: 'emp-1', aiRunRoteiro: coletor });

    expect(r.roteiro).toBeTruthy();
    expect(coletor).toHaveBeenCalledTimes(1);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(callAI.mock.calls[0][4]).toEqual({ taskKey: 'conteudo_video', source: 'batch-sync', empresaId: 'emp-1' });
  });

  it('coletor rejeita (lote e fallback falharam): ainda tenta o síncrono antes de desistir', async () => {
    const coletor = vi.fn(async () => { throw new Error('lote caiu'); });
    callAI.mockResolvedValue('lixo');
    const r = await gerarRoteiroDeModulo(M, { empresaId: 'emp-1', aiRunRoteiro: coletor });
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(r.error).toMatch(/roteiro válido/);
  });

  it('VIDEO_ROTEIRO_MODE=sync desliga o coletor', async () => {
    vi.stubEnv('VIDEO_ROTEIRO_MODE', 'sync');
    const coletor = vi.fn(async () => 'ROTEIRO');
    callAI.mockResolvedValue('ROTEIRO');
    await gerarRoteiroDeModulo(M, { empresaId: 'emp-1', aiRunRoteiro: coletor });
    expect(coletor).not.toHaveBeenCalled();
    expect(callAI).toHaveBeenCalledTimes(1);
  });
});

describe('gerarRoteiroDeModulo sem coletor', () => {
  it('forceSync é síncrono por escolha: sem o rótulo batch-sync (o ledger grava wrapper)', async () => {
    callAI.mockResolvedValue('ROTEIRO');
    await gerarRoteiroDeModulo(M, { forceSync: true, empresaId: 'emp-1' });
    expect(submitClaudeBatch).not.toHaveBeenCalled();
    expect(callAI.mock.calls[0][4]).toEqual({ taskKey: 'conteudo_video', empresaId: 'emp-1' });
  });

  it('sem forceSync nem coletor, segue o lote avulso de sempre', async () => {
    submitClaudeBatch.mockResolvedValue(new Map([['roteiro-video', 'ROTEIRO']]));
    const r = await gerarRoteiroDeModulo(M, { empresaId: 'emp-1' });
    expect(r.roteiro).toBeTruthy();
    expect(submitClaudeBatch).toHaveBeenCalledTimes(1);
    expect(callAI).not.toHaveBeenCalled();
  });
});
