import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ readLimiter: { check: async () => null } }));
vi.mock('@/lib/copiloto/auth', () => ({
  requireRepresentativeOrAdminRequest: async () => ({ kind: 'representative', email: 'rep@vertho.ai', rep: { id: 'rep-1' } }),
}));
vi.mock('@/lib/copiloto/accounts', () => ({
  findCopilotAccount: vi.fn(async () => ({ id: CONTA, representante_id: 'rep-1' })),
}));

const CONTA = '11111111-1111-4111-8111-111111111111';
const OPORTUNIDADE = '22222222-2222-4222-8222-222222222222';
const DE_OUTRA_CONTA = '33333333-3333-4333-8333-333333333333';

const escritas: any[] = [];
let oportunidadeExiste = true;

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from(tabela: string) {
      if (tabela === 'sales_activity_notes') {
        return { insert: async (linha: any) => { escritas.push({ tabela, linha }); return { error: null }; } };
      }
      const cadeia: any = {
        _patch: null as any,
        select() { return cadeia; },
        update(patch: any) { cadeia._patch = patch; return cadeia; },
        eq() { return cadeia; },
        async maybeSingle() {
          return oportunidadeExiste
            ? { data: { id: OPORTUNIDADE, stage: 'proposta_enviada', next_action: null, next_action_date: null }, error: null }
            : { data: null, error: null };
        },
        async single() {
          escritas.push({ tabela, patch: cadeia._patch });
          return { data: { id: OPORTUNIDADE, ...cadeia._patch }, error: null };
        },
      };
      return cadeia;
    },
  }),
}));

import { POST } from '@/app/api/copiloto/clientes/[accountId]/crm/route';

function pedido(body: unknown) {
  return new Request('https://app.vertho.ai/api/copiloto/clientes/x/crm', {
    method: 'POST', body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ accountId: CONTA }) };

describe('rota que aplica o fechamento no CRM', () => {
  beforeEach(() => {
    escritas.length = 0;
    oportunidadeExiste = true;
  });

  it('aplica estágio, ação e prazo na oportunidade', async () => {
    const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const res = await POST(pedido({
      opportunityId: OPORTUNIDADE, stage: 'negociacao',
      nextAction: 'Enviar recorte do piloto', nextActionDate: amanha,
    }), params);

    expect(res.status).toBe(200);
    const update = escritas.find((e) => e.patch);
    expect(update.patch).toMatchObject({
      stage: 'negociacao', next_action: 'Enviar recorte do piloto', next_action_date: amanha,
    });
  });

  it('registra no histórico da conta o que mudou', async () => {
    await POST(pedido({ opportunityId: OPORTUNIDADE, stage: 'negociacao' }), params);
    const nota = escritas.find((e) => e.tabela === 'sales_activity_notes');
    expect(nota.linha.note).toContain('proposta_enviada → negociacao');
    expect(nota.linha.created_by_email).toBe('rep@vertho.ai');
  });

  it('estágio inventado não chega ao banco', async () => {
    const res = await POST(pedido({ opportunityId: OPORTUNIDADE, stage: 'quase_fechando' }), params);
    expect(res.status).toBe(400);
    expect(escritas.filter((e) => e.patch)).toHaveLength(0);
  });

  it('data passada é descartada, não aplicada', async () => {
    const res = await POST(pedido({
      opportunityId: OPORTUNIDADE, nextAction: 'Cobrar retorno', nextActionDate: '2020-01-01',
    }), params);
    expect(res.status).toBe(200);
    const update = escritas.find((e) => e.patch);
    expect(update.patch.next_action_date).toBeUndefined();
    expect(update.patch.next_action).toBe('Cobrar retorno');
  });

  it('oportunidade de outra conta é recusada mesmo com a conta certa no caminho', async () => {
    oportunidadeExiste = false;
    const res = await POST(pedido({ opportunityId: DE_OUTRA_CONTA, stage: 'negociacao' }), params);
    expect(res.status).toBe(400);
    expect(escritas.filter((e) => e.patch)).toHaveLength(0);
  });

  it('pedido sem nada para aplicar não toca no CRM', async () => {
    const res = await POST(pedido({ opportunityId: OPORTUNIDADE }), params);
    expect(res.status).toBe(400);
    expect(escritas).toHaveLength(0);
  });

  it('corpo inválido responde 400, não 502', async () => {
    const res = await POST(
      new Request('https://app.vertho.ai/x', { method: 'POST', body: 'não é json' }),
      params,
    );
    expect(res.status).toBe(400);
  });
});
