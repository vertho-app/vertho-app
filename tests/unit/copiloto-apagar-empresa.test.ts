import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Apagar empresa na lista do Copiloto (deleteSalesAccount).
 *
 * Por decisão do dono (31/08), histórico comercial NÃO recusa a exclusão: a
 * tela pergunta uma vez, com o inventário do que sai junto (lido por
 * `getSalesAccountVinculos`), e apaga. A action sozinha continua exigindo
 * `forcar` — ela é um endpoint HTTP, e quem chama sem ter perguntado recebe o
 * inventário em vez de uma conta apagada.
 *
 * O que estes testes protegem, em ordem de dano:
 *  1. sem `forcar`, conta com oportunidade/proposta/comissão não sai — devolve
 *     `precisaConfirmar` com o inventário e não escreve nada; a comissão é
 *     calculada em cima desse histórico, então quem confirma tem que ver o que
 *     está perdendo;
 *  2. conta de OUTRO representante não sai (anti-IDOR) — a lista do admin
 *     mostra a carteira inteira, então o gate é por linha, não por tela;
 *  3. falha de LEITURA da contagem não pode virar "sem vínculos" (E11): se o
 *     count morre e o código lê 0, a empresa com funil seria apagada sem nem a
 *     segunda pergunta;
 *  4. a ORDEM do delete é ditada pelas FKs (comissão → proposta → nota →
 *     oportunidade → conta); errar a ordem é violação de chave em produção;
 *  5. exclusão forçada é auditada — o registro de quem apagou o quê tem que
 *     sobreviver à conta.
 */

const CONTA = '11111111-1111-4111-8111-111111111111';

const estado: { conta: any; contagens: Record<string, number> } = { conta: null, contagens: {} };
const contexto: { valor: any } = { valor: null };
const adminChecado = { vezes: 0 };
const auditoria: any[] = [];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'sales_accounts' ? estado.conta : null),
  contagem: (tabela) => estado.contagens[tabela] ?? 0,
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/audit', () => ({ logAdminAction: async (entry: any) => { auditoria.push(entry); } }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeAction: async () => contexto.valor,
  requireRepresentativeOrAdminAction: async () => contexto.valor,
  requireCommercialAdminAction: async () => { adminChecado.vezes += 1; return { email: 'admin@vertho.ai' }; },
  assertRepresentativeOwnership: () => {},
}));

const { deleteSalesAccount, getSalesAccountVinculos } = await import('@/actions/sales/accounts');

/** Só as escritas de exclusão, na ordem — é a ordem que a FK das notas exige. */
const tabelasApagadas = () => sb.escritas.filter((e) => e.op === 'delete').map((e) => e.tabela);

beforeEach(() => {
  sb.reset();
  estado.conta = { id: CONTA, representante_id: 'rep-1', legal_name: 'Escola Criativa', trade_name: 'Escola Criativa', status: 'prospect' };
  estado.contagens = {};
  auditoria.length = 0;
  adminChecado.vezes = 0;
  contexto.valor = { kind: 'representative', rep: { id: 'rep-1' }, email: 'rc@vertho.ai' };
});

describe('getSalesAccountVinculos: o que a confirmação mostra antes de apagar', () => {
  it('lista o que sai junto, do mais caro ao mais barato', async () => {
    estado.contagens.sales_commission_events = 2;
    estado.contagens.sales_proposals = 1;
    estado.contagens.copilot_conversations = 3;

    const r = await getSalesAccountVinculos(CONTA);

    expect(r.success).toBe(true);
    expect(r.success === true && r.temHistorico).toBe(true);
    expect(r.success === true && r.resumo).toBe('Vai junto: 2 eventos de comissão, 1 proposta, 3 resultados. Não dá para desfazer.');
  });

  it('empresa sem nada ligado diz isso, em vez de uma lista vazia', async () => {
    const r = await getSalesAccountVinculos(CONTA);

    expect(r.success === true && r.temHistorico).toBe(false);
    expect(r.success === true && r.resumo).toContain('não tem nenhum registro ligado');
  });

  it('falha de leitura NÃO vira "não tem nada ligado"', async () => {
    sb.falharEm({ tabela: 'copilot_plans', op: 'select', mensagem: 'connection reset' });

    const r = await getSalesAccountVinculos(CONTA);

    // A tela desabilita o Apagar neste caso: decidir às cegas achando que está
    // informado é pior do que não conseguir apagar agora.
    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('copilot_plans');
  });

  it('não conta os vínculos de conta de outro representante', async () => {
    estado.conta.representante_id = 'rep-2';

    const r = await getSalesAccountVinculos(CONTA);

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('outro representante');
  });
});

describe('deleteSalesAccount: sem `forcar`, histórico comercial devolve o inventário', () => {
  it('conta com oportunidade não sai no primeiro clique — devolve o inventário', async () => {
    estado.contagens.sales_opportunities = 2;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(false);
    expect(r.success === false && r.precisaConfirmar).toBe(true);
    expect(r.success === false && r.precisaConfirmar && r.vinculos.opportunities).toBe(2);
    expect(r.success === false && r.error).toContain('2 oportunidades');
    expect(tabelasApagadas()).toEqual([]);
  });

  it('lista proposta e comissão juntas na frase da confirmação', async () => {
    estado.contagens.sales_proposals = 1;
    estado.contagens.sales_commission_events = 3;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success === false && r.error).toContain('1 proposta');
    expect(r.success === false && r.error).toContain('3 eventos de comissão');
    expect(tabelasApagadas()).toEqual([]);
  });

  it('cliente ativo também pede confirmação, mesmo sem funil', async () => {
    estado.conta.status = 'active_client';

    const r = await deleteSalesAccount(CONTA);

    expect(r.success === false && r.precisaConfirmar).toBe(true);
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

describe('deleteSalesAccount: exclusão forçada', () => {
  it('com forcar, apaga o funil inteiro na ordem que as FKs exigem', async () => {
    estado.contagens.sales_opportunities = 1;
    estado.contagens.sales_proposals = 1;
    estado.contagens.sales_commission_events = 2;

    const r = await deleteSalesAccount(CONTA, { forcar: true });

    expect(r.success).toBe(true);
    // comissão aponta para proposta, proposta aponta para oportunidade.
    expect(tabelasApagadas()).toEqual([
      'sales_commission_events',
      'sales_proposals',
      'sales_activity_notes',
      'sales_opportunities',
      'sales_accounts',
    ]);
    expect(r.success === true && r.removed.commissions).toBe(2);
  });

  it('registra a exclusão forçada na auditoria, com o inventário do que saiu', async () => {
    estado.contagens.sales_proposals = 1;

    await deleteSalesAccount(CONTA, { forcar: true });

    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].acao).toBe('sales_account.excluir');
    expect(auditoria[0].alvo).toContain('Escola Criativa');
    expect(auditoria[0].detalhes.proposals).toBe(1);
    expect(auditoria[0].detalhes.forcado).toBe(true);
  });

  it('conta limpa não gera linha de auditoria (nada de histórico se perdeu)', async () => {
    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(true);
    expect(auditoria).toEqual([]);
  });

  it('forcar NÃO fura o gate de outro representante', async () => {
    estado.conta.representante_id = 'rep-2';
    estado.contagens.sales_proposals = 1;

    const r = await deleteSalesAccount(CONTA, { forcar: true });

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('outro representante');
    expect(tabelasApagadas()).toEqual([]);
    expect(auditoria).toEqual([]);
  });

  it('falha no meio da cadeia para e diz onde parou', async () => {
    estado.contagens.sales_proposals = 1;
    sb.falharEm({ tabela: 'sales_proposals', op: 'delete', mensagem: 'violates foreign key' });

    const r = await deleteSalesAccount(CONTA, { forcar: true });

    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('sales_proposals');
    // a conta continua de pé: não dá para ficar com metade apagada e silêncio.
    expect(tabelasApagadas()).not.toContain('sales_accounts');
    expect(auditoria).toEqual([]);
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
  it('empresa sem funil sai no primeiro clique e devolve o que saiu junto', async () => {
    estado.contagens.sales_contacts = 2;
    estado.contagens.copilot_plans = 1;
    estado.contagens.copilot_conversations = 4;

    const r = await deleteSalesAccount(CONTA);

    expect(r.success).toBe(true);
    expect(r.success === true && r.removed).toEqual({
      opportunities: 0, proposals: 0, commissions: 0,
      contacts: 2, plans: 1, conversations: 4, notes: 0, clienteAtivo: false,
    });
    // a FK das notas não é cascade: elas saem antes da conta, sempre.
    expect(tabelasApagadas()).toEqual([
      'sales_commission_events',
      'sales_proposals',
      'sales_activity_notes',
      'sales_opportunities',
      'sales_accounts',
    ]);
    expect(sb.usou('sales_activity_notes', 'eq', 'account_id')).toBe(true);
    expect(sb.usou('sales_accounts', 'eq', 'id')).toBe(true);
  });
});
