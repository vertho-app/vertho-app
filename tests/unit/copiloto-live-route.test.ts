import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ check: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/lib/copiloto/auth', () => ({
  requireRepresentativeOrAdminRequest: vi.fn().mockResolvedValue({ kind: 'admin', email: 'admin@vertho.ai' }),
}));

import { callAI } from '@/actions/ai-client';
import { POST } from '@/app/api/copiloto/live/route';

function request(extra: Record<string, unknown> = {}) {
  return new Request('https://app.vertho.ai/api/copiloto/live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterances: [{ channel: 'vendedor', text: 'Quero entender como vocês trabalham hoje.' }],
      phase: 'preparar',
      covered: [],
      plan: { questions: [] },
      ...extra,
    }),
  });
}

describe('rota de apoio ao vivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COPILOTO_LIVE_MODEL;
  });

  it('usa o modelo rápido e aceita fala classificada como vendedor', async () => {
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      fase: 'analisar',
      sinal: 'abertura',
      objecao: null,
      descobertas_cobertas: [],
      alerta: null,
      foco: 'Entenda o processo atual.',
      perguntas: [{ texto: 'Como isso funciona hoje?', porque: 'Mapear situação' }],
    }));

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta.mode).toBe('ai');
    expect(data.reading.questions[0].text).toBe('Como isso funciona hoje?');
    expect(callAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('[vendedor]'),
      { model: 'gpt-5.6-luna' },
      1800,
      expect.objectContaining({ timeoutMs: 12000, reasoningEffort: 'low' }),
    );
  });

  it('devolve o banco PACE local quando todos os provedores falham', async () => {
    vi.mocked(callAI).mockRejectedValue(new Error('timeout'));

    const response = await POST(request({
      plan: {
        questions: [{
          phase: 'preparar', discovery: 'situacao_atual',
          text: 'Como o processo funciona hoje?', why: 'Abrir diagnóstico',
        }],
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta.mode).toBe('local_fallback');
    expect(data.reading.questions[0].text).toBe('Como o processo funciona hoje?');
    expect(data.reading.alert).toContain('banco PACE local');
  });
});
