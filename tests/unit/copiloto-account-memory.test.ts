import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: vi.fn() }));

import { compactCopilotPlanningMemory, formatCopilotPlanningMemory } from '@/lib/copiloto/accounts';

describe('memória compacta do planejamento', () => {
  it('une a cobertura sem perder o próximo passo da conversa mais recente', () => {
    const memory = compactCopilotPlanningMemory([
      {
        analysis: {
          paceCoverage: ['dor_principal', 'impacto'],
          memory: {
            nextStep: 'Enviar one-pager e retomar na quinta.',
            pains: ['PDI sem acompanhamento.'],
            objections: ['Já temos uma plataforma.'],
            commitments: ['Enviar one-pager.'],
          },
        },
      },
      {
        analysis: {
          paceCoverage: ['situacao_atual', 'dor_principal'],
          memory: {
            nextStep: 'Próximo passo antigo.',
            pains: ['PDI sem acompanhamento.', 'Baixa adesão dos gestores.'],
          },
        },
      },
    ]);

    expect(memory.covered).toEqual(['situacao_atual', 'dor_principal', 'impacto']);
    expect(memory.pending).toContain('decisor');
    expect(memory.nextStep).toBe('Enviar one-pager e retomar na quinta.');
    expect(memory.pains).toEqual(['PDI sem acompanhamento.', 'Baixa adesão dos gestores.']);
    expect(formatCopilotPlanningMemory(memory)).toContain('coberto: situacao_atual, dor_principal, impacto');
  });
});
