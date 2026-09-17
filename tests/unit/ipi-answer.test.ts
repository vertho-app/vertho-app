import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerIpi } from '@/lib/ipi/answer';

const mocks = vi.hoisted(() => ({ ai: vi.fn(), knowledge: vi.fn(), data: vi.fn() }));
vi.mock('@/actions/ai-client', () => ({ callAIChat: mocks.ai }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'test-model' }));
vi.mock('@/lib/ipi/knowledge', () => ({ retrieveIpiKnowledge: mocks.knowledge }));
vi.mock('@/lib/ipi/data', () => ({ readIpiData: mocks.data }));
describe('Ipi — orquestração de evidências', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.knowledge.mockResolvedValue([{ id: 'F1', kind: 'manual', title: 'Relatórios', reference: 'Manual', text: 'Use o filtro da empresa.' }]);
    mocks.data.mockResolvedValue([]);
    mocks.ai.mockResolvedValueOnce('{"searches":["relatórios"],"data":[],"person":""}').mockResolvedValueOnce('Selecione a empresa. [F1]');
  });
  const input = { message: 'Onde encontro os relatórios?', history: [], pathname: '/admin', empresaId: null };
  const auth = { email: 'teste@vertho.ai', isPlatformAdmin: true } as any;
  it('envia as fontes para a IA e devolve referências sem conteúdo interno', async () => {
    const result = await answerIpi(auth, new Set(['admin.access']), input);
    expect(result.answer).toContain('[F1]');
    expect(mocks.ai.mock.calls[1][1][0].content).toContain('Use o filtro da empresa');
    expect(mocks.ai.mock.calls[1][1][0].content).toContain('blocosOffline');
    expect(result.sources[0]).not.toHaveProperty('text');
    expect(mocks.ai.mock.calls[1][4].taskKey).toBe('ipi');
  });
  it('não executa plano de ferramentas fora do contrato', async () => {
    mocks.ai.mockReset().mockResolvedValue('{"searches":[],"data":["delete"],"person":""}');
    await expect(answerIpi(auth, new Set(['admin.access']), input)).rejects.toThrow();
    expect(mocks.data).not.toHaveBeenCalled();
    expect(mocks.ai).toHaveBeenCalledTimes(1);
  });
});
