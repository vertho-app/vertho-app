import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn(),
  insertPlan: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ check: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/lib/copiloto/auth', () => ({
  requireRepresentativeOrAdminRequest: vi.fn().mockResolvedValue({
    kind: 'representative',
    email: 'consultor@vertho.ai',
    rep: { id: 'a33e8634-7d2c-4d7d-b8ef-ad36c30bd3c8' },
  }),
}));
vi.mock('@/lib/copiloto/accounts', () => ({
  findCopilotAccount: mocks.findAccount,
  normalizePlanRow: (row: Record<string, unknown>) => ({
    id: row.id,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    plan: row.plan,
    inputs: row.inputs,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'copilot_plans') throw new Error(`Tabela inesperada no teste: ${table}`);
      return {
        insert: (payload: Record<string, unknown>) => {
          mocks.insertPlan(payload);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: '5e296f8c-f181-43b1-84d1-67b4ca54bb1f',
                  conversation_id: null,
                  ...payload,
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  }),
}));

import { POST } from '@/app/api/copiloto/clientes/[accountId]/planejamentos/route';

const ACCOUNT_ID = '87604515-02a2-40b9-8ba4-1dc77afb07c4';

function planningRequest(body: Record<string, unknown>) {
  return new Request(`https://app.vertho.ai/api/copiloto/clientes/${ACCOUNT_ID}/planejamentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('persistência do planejamento do copiloto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAccount.mockResolvedValue({
      id: ACCOUNT_ID,
      representante_id: 'a33e8634-7d2c-4d7d-b8ef-ad36c30bd3c8',
    });
  });

  it('salva o plano e os insumos na empresa selecionada', async () => {
    const plan = {
      companyIdentified: 'Empresa Exemplo',
      companySummary: 'Contexto da empresa',
      questions: [],
    };
    const response = await POST(planningRequest({
      plan,
      inputs: {
        company: ' Empresa Exemplo ',
        site: ' https://empresa.example ',
        context: 'Resultado da conversa anterior',
        offer: 'Programa de desenvolvimento',
      },
    }), { params: Promise.resolve({ accountId: ACCOUNT_ID }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planning).toMatchObject({ accountId: ACCOUNT_ID, plan });
    expect(mocks.insertPlan).toHaveBeenCalledWith(expect.objectContaining({
      account_id: ACCOUNT_ID,
      representante_id: 'a33e8634-7d2c-4d7d-b8ef-ad36c30bd3c8',
      created_by_email: 'consultor@vertho.ai',
      inputs: expect.objectContaining({
        company: 'Empresa Exemplo',
        site: 'https://empresa.example',
        context: 'Resultado da conversa anterior',
      }),
    }));
  });

  it('recusa um objeto que não seja um planejamento PACE válido', async () => {
    const response = await POST(planningRequest({
      plan: { companyIdentified: 'Empresa sem perguntas' },
    }), { params: Promise.resolve({ accountId: ACCOUNT_ID }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Planejamento inválido' });
    expect(mocks.insertPlan).not.toHaveBeenCalled();
  });

  it('mantém no banco a ligação única entre planejamento e resultado', () => {
    const migration = readFileSync(
      join(process.cwd(), 'migrations', '235-copiloto-planejamentos.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS copilot_plans');
    expect(migration).toMatch(/conversation_id\s+uuid UNIQUE REFERENCES copilot_conversations\(id\)/);
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
  });
});
