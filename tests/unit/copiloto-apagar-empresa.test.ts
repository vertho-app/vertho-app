import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Apagar empresa na lista do Copiloto (deleteSalesAccount).
 *
 * O que estes testes protegem, em ordem de dano:
 *  1. conta com oportunidade/proposta/comissão NÃO pode sair — o cascade do
 *     banco leva planejamentos e conversas junto, e a comissão é calculada em
 *     cima desse histórico; um clique na lista não pode apagar a base do
 *     pagamento;
 *  2. conta de OUTRO representante não sai (anti-IDOR) — a lista do admin
 *     mostra a carteira inteira, então o gate é por linha, não por tela;
 *  3. falha de LEITURA da contagem não pode virar "sem vínculos" (E11): se o
 *     count morre e o código lê 0, a conta com funil é apagada em silêncio;
 *  4. as notas de acompanhamento precisam sair ANTES — a FK delas não é
 *     cascade, e sem isso o DELETE bate em violação de chave.
 */

const CONTA = '11111111-1111-4111-8111-111111111111';

const estado: { conta: any; contagens: Record<string, number> } = { conta: null, contagens: {} };
const contexto: { valor: any } = { valor: null };
const adminChecado = { vezes: 0 };

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'sales_accounts' ? estado.conta : null),
  contagem: (tabela) => estado.contagens[tabela] ?? 0,
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeAction: async () => contexto.valor,
  requireRepresentativeOrAdminAction: async () => contexto.valor,
  requireCommercialAdminAction: async () => { adminChecado.vezes += 1; return { email: 'admin@vertho.ai' }; },
  assertRepresentativeOwnership: () => {},
}));

const { deleteSalesAccount } = await import('@/actions/sales/accounts');

/** Só as escritas de exclusão, na ordem — é a ordem que a FK das notas exige. */
const tabelasApagadas = () => sb.escritas.filter((e) => e.op === 'delete').map((e) => e.tabela);

beforeEach(() => {
  sb.reset();
  estado.conta = { id: CONTA, representante_id: 'rep-1', legal_name: 'Escola Criativa', trade_name: 'Escola Criativa', status: 'prospect' };
  estado.contagens = {};
  adminChecado.vezes = 0;
  contexto.valor = { kind: 'representative', rep: { id: 'rep-1' }, email: 'rc@vertho.ai' };
});

describe('deleteSalesAccount: fail-closed no histórico comercial', () => {
  it('não apaga conta com oportunidade aberta e diz o que está segurando', async () => {
    estado.contagens.sales_opportunities = 2;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('2 oportunidade(s)');
    expect(tabelasApagadas()).toEqual([]);
  });

  it('lista proposta e comissão juntas quando as duas seguram a conta', async () => {
    estado.contagens.sales_proposals = 1;
    estado.contagens.sales_commission_events = 3;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('1 proposta(s)');
    expect(r.success === false && r.error).toContain('3 evento(s) de comissão');
    expect(tabelasApagadas()).toEqual([]);
  });

  it('não apaga cliente ativo mesmo sem funil registrado', async () => {
    estado.conta.status = 'active_client';

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('cliente ativo');
    expect(tabelasApagadas()).toEqual([]);
  });

  it('falha de leitura na contagem não vira "sem vínculos" (E11)', async () => {
    sb.falharEm({ tabela: 'sales_proposals', op: 'select', mensagem: 'connection reset' });

    await expect(deleteSalesAccount(CONTA)).rejects.toThrow(/falha ao verificar sales_proposals/);
    expect(tabelasApagadas()).toEqual([]);
  });

  it('conta inexistente não vira exclusão', async () => {
    estado.conta = null;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(false);
    expect(tabelasApagadas()).toEqual([]);
  });
});

describe('deleteSalesAccount: isolamento por representante', () => {
  it('RC não apaga conta de outro representante (mesmo sem nada segurando)', async () => {
    estado.conta.representante_id = 'rep-2';

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('outro representante');
    expect(tabelasApagadas()).toEqual([]);
  });

  it('admin do canal apaga qualquer conta, mas passa pela chave de escrita', async () => {
    contexto.valor = { kind: 'admin', email: 'admin@vertho.ai' };
    estado.conta.representante_id = 'rep-2';

    const r = await deleteSalesAccount(CONTA);

    expect(adminChecado.vezes).toBe(1);
    expect(r.success).toBe(true);
    expect(tabelasApagadas()).toContain('sales_accounts');
  });

  it('id fora do formato UUID nem chega ao banco', async () => {
    const r = await deleteSalesAccount('escola-criativa');

    expect(r.success).toBe(false);
    expect(sb.chamadas).toEqual([]);
  });
});

describe('deleteSalesAccount: caminho feliz', () => {
  it('apaga as notas antes da conta e devolve o que saiu junto', async () => {
    estado.contagens.sales_contacts = 2;
    estado.contagens.copilot_plans = 1;
    estado.contagens.copilot_conversations = 4;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(true);
    expect(r.success === true && r.removed).toEqual({ contacts: 2, plans: 1, conversations: 4 });
    // ordem importa: a FK das notas não é cascade, elas têm que sair primeiro.
    expect(tabelasApagadas()).toEqual(['sales_activity_notes', 'sales_accounts']);
    expect(sb.usou('sales_activity_notes', 'eq', 'account_id')).toBe(true);
    expect(sb.usou('sales_accounts', 'eq', 'id')).toBe(true);
  });
});
