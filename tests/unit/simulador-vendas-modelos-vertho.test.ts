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
        modelo: 'global.moonshotai.kimi-k3',
        esforco: 'low',
      });
      expect(s.cliente).toMatchObject({
        modelo: 'global.moonshotai.kimi-k3',
        esforco: 'low',
      });
      expect(s.gerente).toMatchObject({
        modelo: 'claude-sonnet-5-5',
        esforco: 'medium',
      });
      expect(s.moderador.modelo).toBe('gemini-3.8-flash');
      expect(s.intencao.modelo).toBe('gemini-3.8-flash');
      expect(s.criador.versao).toMatch(/-comercial-3$/);
      expect(s.cliente.versao).toMatch(/-comercial-3$/);
      const textos = mocks.archive.mock.calls as unknown as Array<unknown[]>;
      const criador = textos.find((args) => args[1] === 'criador');
      const cliente = textos.find((args) => args[1] === 'cliente');
      const gerente = textos.find((args) => args[1] === 'gerente');
      expect(gerente?.[3]).toContain('Nunca devolva nivel=1 com evidencias=[]');
      if (nivel === 1) {
        expect(criador?.[3]).toContain('0 objeções profundas');
        expect(cliente?.[3]).toContain('Não exija simultaneamente');
      } else {
        expect(criador?.[3]).not.toContain('Calibração Vertho');
        expect(cliente?.[3]).not.toContain('Calibração Vertho');
      }
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
    const textos = mocks.archive.mock.calls as unknown as Array<unknown[]>;
    expect(textos.find((args) => args[1] === 'gerente')?.[3]).not.toContain(
      'Conferência final de evidências PACE',
    );
  });
  it('recusa usar o perfil Vertho em outro tenant antes de arquivar', async () => {
    await expect(
      snapshotPrompts('outra-empresa', true, 2),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it('mantém compatibilidade de snapshots legados e reconhece Kimi Bedrock validado', () => {
    expect(modeloPaceCompativel('gpt-5.4-mini-2026-03-17')).toBe(true);
    expect(modeloPaceCompativel('global.moonshotai.kimi-k3')).toBe(true);
    expect(modeloPaceCompativel('claude-sonnet-5-5')).toBe(true);
    expect(modeloPaceCompativel('kimi-k3')).toBe(false);
    expect(modeloPaceCompativel('claude-sonnet-4-6')).toBe(false);
  });
});
