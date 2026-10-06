import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  model: vi.fn(async () => 'gpt-5.4-2026-03-05'),
  archive: vi.fn(async () => 'prompt-id'),
}));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: mocks.model }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({}) }));
vi.mock('@/lib/simulador-vendas/catalogo', () => ({
  arquivarPrompt: mocks.archive,
}));
import { snapshotPrompts } from '@/lib/simulador-vendas/ai';
import { VERTHO_TREINO_EMPRESA_ID } from '@/lib/simulador-vendas/vertho';
import { modeloPaceCompativel } from '@/lib/simulador-vendas/modelos';

describe('modelos por dificuldade no treinamento comercial', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([1, 2, 3] as const)(
    'nível %s congela modelo e esforço de cada agente',
    async (nivel) => {
      const s = await snapshotPrompts(VERTHO_TREINO_EMPRESA_ID, true, nivel);
      expect(s.criador).toMatchObject({
        modelo: 'claude-sonnet-5-5',
        esforco: 'low',
      });
      expect(s.cliente).toMatchObject({
        modelo: nivel === 1 ? 'gemini-3.8-flash' : 'claude-sonnet-5-5',
        esforco: 'low',
      });
      expect(s.gerente).toMatchObject({
        modelo: 'claude-opus-5-5',
        esforco: 'medium',
      });
      expect(s.moderador.modelo).toBe('gemini-3.8-flash');
      expect(s.intencao.modelo).toBe('gemini-3.8-flash');
      expect(mocks.model).not.toHaveBeenCalled();
      for (const agent of Object.values(s))
        expect(modeloPaceCompativel(agent.modelo)).toBe(true);
    },
  );
  it('preserva a configuração dos simuladores de outras empresas', async () => {
    const s = await snapshotPrompts('outra-empresa', false, 3);
    expect(mocks.model).toHaveBeenCalledTimes(5);
    expect(s.cliente.modelo).toBe('gpt-5.4-2026-03-05');
    expect(s.cliente).not.toHaveProperty('esforco');
  });
  it('recusa usar o perfil Vertho em outro tenant antes de arquivar', async () => {
    await expect(
      snapshotPrompts('outra-empresa', true, 2),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it('mantém compatibilidade legada e não libera Kimi para sessões de pessoas', () => {
    expect(modeloPaceCompativel('gpt-5.4-mini-2026-03-17')).toBe(true);
    expect(modeloPaceCompativel('global.moonshotai.kimi-k3')).toBe(false);
    expect(modeloPaceCompativel('claude-sonnet-4-6')).toBe(false);
  });
});
