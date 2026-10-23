/**
 * Portal do RC alinhado ao contrato de representação v5 (22/10/2026), além da
 * conta da comissão (essa fica em `sales-comissao-modelos.test.ts`):
 *
 *   · 7.1, 7.2, 7.5: o registro exige CNPJ e cargo do contato, a fila da
 *     vertho.ai valida ou recusa (o aceite na hora do contrato v6 está em
 *     `sales-contrato-rc-v6.test.ts`), e a proposta só é submetida (e aprovada)
 *     com o registro validado;
 *   · 10.5 e 10.6: a aprovação grava o modelo do RC e a classificação de
 *     carteira, que vem do histórico da conta e o admin só muda com motivo;
 *   · 18.7: depois do término do contrato do RC, só gera comissão a proposta
 *     enviada antes e aceita dentro da validade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import { classificarCarteira, comissaoDevidaNoAceite } from '@/lib/sales/aceite-rc';
import { dataBRT } from '@/lib/dre/semana';

let sb: SupabaseMock = criarSupabaseMock();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeAction: vi.fn(async () => ({
    email: 'rc@teste.vertho',
    rep: { id: 'rc-1', status: 'active', compensation_model: 'sem_ajuda' },
  })),
  requireRepresentativeOrAdminAction: vi.fn(),
  requireCommercialAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })),
  assertRepresentativeOwnership: vi.fn(),
}));
vi.mock('@/lib/authz', () => ({ isPlatformAdmin: vi.fn(async () => false) }));

import { approveProposal, registrarAceitePropostaDoRC, submitProposalForApproval } from '@/actions/sales/proposals';
import { createOpportunity, recusarRegistroOportunidade, validarRegistroOportunidade } from '@/actions/sales/opportunities';

const escritasEm = (tabela: string, op: string) => sb.escritas.filter((e) => e.tabela === tabela && e.op === op);

describe('18.7: comissão depois do término do contrato do RC', () => {
  const agora = new Date('2026-10-20T12:00:00Z');
  const proposta = { created_at: '2026-09-25T00:00:00Z', approved_at: '2026-10-01T00:00:00Z', sent_to_client_at: '2026-10-05T00:00:00Z' };

  it('com o contrato em vigor (ativo ou suspenso) é sempre devida', () => {
    expect(comissaoDevidaNoAceite({ status: 'active' }, proposta, agora).devida).toBe(true);
    expect(comissaoDevidaNoAceite({ status: 'suspended' }, proposta, agora).devida).toBe(true);
  });

  it('enviada antes do término e aceita dentro da validade: devida', () => {
    expect(comissaoDevidaNoAceite({ status: 'inactive', contract_ended_at: '2026-10-10T00:00:00Z' }, proposta, agora).devida).toBe(true);
  });

  it('enviada depois do término: não é devida', () => {
    const r = comissaoDevidaNoAceite({ status: 'inactive', contract_ended_at: '2026-10-03T00:00:00Z' }, proposta, agora);
    expect(r.devida).toBe(false);
    expect(r.motivo).toMatch(/18\.7/);
  });

  it('aceita depois da validade (30 dias da aprovação): não é devida', () => {
    const r = comissaoDevidaNoAceite({ status: 'inactive', contract_ended_at: '2026-10-10T00:00:00Z' }, proposta, new Date('2026-11-05T00:00:00Z'));
    expect(r.devida).toBe(false);
  });

  it('proposta sem data de envio usa a aprovação, e RC inativo sem término registrado não lança nada', () => {
    const semEnvio = { ...proposta, sent_to_client_at: null };
    expect(comissaoDevidaNoAceite({ status: 'inactive', contract_ended_at: '2026-10-02T00:00:00Z' }, semEnvio, agora).devida).toBe(true);
    expect(comissaoDevidaNoAceite({ status: 'inactive', contract_ended_at: null }, proposta, agora).devida).toBe(false);
  });

  it('o admin registra o aceite de RC desligado sem lançar a comissão quando ela não é devida', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => {
        if (tabela === 'sales_proposals') return { id: 'p1', proposal_number: 'PROP-1', representante_id: 'rc-1', status: 'sent_to_client', opportunity_id: null, account_id: null, total_contract_value: 24000, contract_duration_months: 12, compensation_model: 'sem_ajuda', carteira: false, ...proposta, sent_to_client_at: '2026-10-25T00:00:00Z' };
        if (tabela === 'sales_representatives') return { status: 'inactive', compensation_model: 'sem_ajuda', contract_ended_at: '2026-10-10T00:00:00Z' };
        return null;
      },
      escrita: (tabela, op) => (tabela === 'sales_proposals' && op === 'update' ? [{ id: 'p1' }] : null),
    });
    const r = await registrarAceitePropostaDoRC('p1');
    expect(r.success).toBe(true);
    expect((r as { comComissao?: boolean }).comComissao).toBe(false);
    expect(escritasEm('sales_commission_events', 'insert')).toHaveLength(0);
    expect(escritasEm('sales_activity_notes', 'insert')[0]?.payload.note).toMatch(/Sem comissão/);
  });
});

describe('10.6: classificação de cliente da carteira', () => {
  it('a conta já tem proposta aceita do mesmo RC: carteira, citando a proposta', async () => {
    sb = criarSupabaseMock({ lista: (tabela) => (tabela === 'sales_proposals' ? [{ id: 'p0', proposal_number: 'PROP-2026-0007' }] : []) });
    const c = await classificarCarteira(sb.client, { representanteId: 'rc-1', accountId: 'acc-1', excluirProposalId: 'p1' });
    expect(c).toEqual({ carteira: true, motivo: expect.stringContaining('PROP-2026-0007') });
    // pergunta certa: só aceitas, do mesmo RC, da mesma conta, fora a avaliada
    expect(sb.usou('sales_proposals', 'eq', 'status')).toBe(true);
    expect(sb.usou('sales_proposals', 'eq', 'representante_id')).toBe(true);
    expect(sb.usou('sales_proposals', 'neq', 'id')).toBe(true);
  });

  it('sem proposta aceita anterior: cliente novo', async () => {
    sb = criarSupabaseMock();
    expect(await classificarCarteira(sb.client, { representanteId: 'rc-1', accountId: 'acc-1' })).toEqual({ carteira: false, motivo: null });
  });

  it('falha de leitura não vira "cliente novo" calado', async () => {
    sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'sales_proposals', op: 'select', mensagem: 'timeout' });
    await expect(classificarCarteira(sb.client, { representanteId: 'rc-1', accountId: 'acc-1' })).rejects.toThrow(/carteira/);
  });
});

describe('aprovação grava modelo e carteira (10.5 e 10.6)', () => {
  const proposta = {
    id: 'p1', representante_id: 'rc-1', account_id: 'acc-1', opportunity_id: 'opp-1', status: 'submitted_for_approval',
    monthly_value: 2000, contract_duration_months: 12, discount_requested: 0,
    customer_type: 'escola', number_of_users: 30, product_package: 'onboarding',
    payment_terms: 'Mensal', included_scope: 'Jornada', compensation_model: 'sem_ajuda', carteira: false,
  };
  const montar = (anteriores: any[], atribuicao = 'validada', modeloDoRc = 'com_ajuda') => {
    sb = criarSupabaseMock({
      resolver: (tabela) => {
        if (tabela === 'sales_proposals') return proposta;
        if (tabela === 'sales_opportunities') return { attribution_status: atribuicao };
        if (tabela === 'sales_representatives') return { compensation_model: modeloDoRc };
        return null;
      },
      lista: (tabela) => (tabela === 'sales_proposals' ? anteriores : []),
    });
  };
  const update = () => escritasEm('sales_proposals', 'update')[0]?.payload;

  it('congela o modelo do RC no dia da aprovação e a carteira calculada', async () => {
    montar([{ id: 'p0', proposal_number: 'PROP-1' }]);
    expect((await approveProposal('p1')).success).toBe(true);
    expect(update()).toMatchObject({ status: 'approved', compensation_model: 'com_ajuda', carteira: true });
    // com ajuda + carteira: 5% de 12 parcelas de 2.000
    expect(update()).toMatchObject({ estimated_acquisition_commission: 0, estimated_recurring_commission: 1200 });
  });

  it('mudar a classificação calculada exige motivo, e o motivo fica gravado', async () => {
    montar([]);
    const sem = await approveProposal('p1', { carteira: true });
    expect(sem.success).toBe(false);
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);

    montar([]);
    expect((await approveProposal('p1', { carteira: true, motivo: 'mesma mantenedora do Colégio X' })).success).toBe(true);
    expect(update()).toMatchObject({ carteira: true, carteira_motivo: expect.stringContaining('mesma mantenedora') });
  });

  it('não aprova proposta de oportunidade com registro não validado', async () => {
    montar([], 'aguardando');
    const r = await approveProposal('p1');
    expect(r.success).toBe(false);
    expect((r as { error?: string }).error).toMatch(/7\.1/);
  });
});

describe('7.1: submissão só com o registro validado', () => {
  const proposta = {
    id: 'p1', representante_id: 'rc-1', opportunity_id: 'opp-1', status: 'draft',
    customer_type: 'escola', number_of_users: 30, product_package: 'onboarding', contract_duration_months: 12,
    payment_terms: 'Mensal', included_scope: 'Jornada', monthly_value: 2000, total_contract_value: 24000,
  };
  const montar = (atribuicao: string) => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_proposals' ? proposta : tabela === 'sales_opportunities' ? { attribution_status: atribuicao } : null),
    });
  };

  it('registro aguardando validação: não submete e não grava nada', async () => {
    montar('aguardando');
    const r = await submitProposalForApproval('p1');
    expect(r.success).toBe(false);
    expect((r as { error?: string }).error).toMatch(/ainda não validou/);
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
  });

  it('registro validado: submete', async () => {
    montar('validada');
    expect((await submitProposalForApproval('p1')).success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0]?.payload.status).toBe('submitted_for_approval');
  });
});

describe('7.2 e 7.5: registro da oportunidade', () => {
  const input = {
    opportunity_name: 'Colégio Teste', account_id: 'acc-1', primary_contact_id: 'ct-1', origin: 'prospeccao',
    product_interest: 'onboarding', identified_need: 'Onboarding de professores', stage: 'contato_iniciado',
    estimated_value: 24000, estimated_close_date: '2026-12-01', next_action: 'Reunião', next_action_date: '2026-11-01',
    interaction_evidence: 'Reunião em 20/10 com a diretora',
  };
  const montar = (cnpj: string | null, cargo: string | null) => {
    sb = criarSupabaseMock({
      resolver: (tabela) => {
        if (tabela === 'sales_accounts') return { id: 'acc-1', representante_id: 'rc-1', cnpj };
        if (tabela === 'sales_contacts') return { id: 'ct-1', representante_id: 'rc-1', account_id: 'acc-1', role: cargo };
        return null;
      },
    });
  };

  it('sem CNPJ na conta ou sem cargo no contato o registro não entra', async () => {
    montar(null, null);
    const r = await createOpportunity(input);
    expect(r.success).toBe(false);
    expect((r as { fieldErrors?: Record<string, string> }).fieldErrors).toMatchObject({
      account_id: expect.stringMatching(/CNPJ/), primary_contact_id: expect.stringMatching(/cargo/),
    });
    expect(escritasEm('sales_opportunities', 'insert')).toHaveLength(0);
  });

  it('registro completo de cliente na lista de reserva nasce aguardando e SEM proteção', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => {
        if (tabela === 'sales_accounts') return { id: 'acc-1', representante_id: 'rc-1', cnpj: '12.345.678/0001-95' };
        if (tabela === 'sales_contacts') return { id: 'ct-1', representante_id: 'rc-1', account_id: 'acc-1', role: 'Diretora' };
        return null;
      },
      lista: (tabela) => (tabela === 'sales_reservas' ? [{ id: 'r1' }] : []),
    });
    expect((await createOpportunity(input)).success).toBe(true);
    expect(escritasEm('sales_opportunities', 'insert')[0]?.payload).toMatchObject({
      attribution_status: 'aguardando', protection_start_date: null, protection_end_date: null,
    });
  });

  it('validar começa a proteção de 90 dias na data da validação, como uma movimentação', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', status: 'open', attribution_status: 'aguardando' } : null),
      escrita: (tabela, op) => (tabela === 'sales_opportunities' && op === 'update' ? [{ id: 'opp-1' }] : null),
    });
    const r = await validarRegistroOportunidade('opp-1');
    expect(r.success).toBe(true);
    const patch = escritasEm('sales_opportunities', 'update')[0]?.payload;
    expect(patch).toMatchObject({ attribution_status: 'validada', attribution_decided_by: 'admin@vertho.ai' });
    const dias = (Date.parse(patch.protection_end_date) - Date.parse(patch.protection_start_date)) / 86_400_000;
    expect(dias).toBe(90);
    expect(patch.protection_start_date).toBe(dataBRT(new Date())); // dia de Brasília
    expect(patch.last_movement_at).toBeTruthy();
  });

  it('registro já decidido não é validado de novo', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', status: 'open', attribution_status: 'validada' } : null),
    });
    expect((await validarRegistroOportunidade('opp-1')).success).toBe(false);
    expect(escritasEm('sales_opportunities', 'update')).toHaveLength(0);
  });

  it('recusar exige motivo e tira a oportunidade do funil', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', attribution_status: 'aguardando' } : null),
      escrita: (tabela, op) => (tabela === 'sales_opportunities' && op === 'update' ? [{ id: 'opp-1' }] : null),
    });
    expect((await recusarRegistroOportunidade('opp-1', '  ')).success).toBe(false);
    expect((await recusarRegistroOportunidade('opp-1', 'Cliente em negociação direta (7.3)')).success).toBe(true);
    expect(escritasEm('sales_opportunities', 'update')[0]?.payload).toMatchObject({
      attribution_status: 'recusada', status: 'expired', attribution_note: 'Cliente em negociação direta (7.3)',
    });
  });

  it('mig 296: as oportunidades antigas ficam validadas e as novas nascem pendentes pelo DEFAULT', () => {
    const sql = readFileSync('migrations/296-rc-contrato-v5.sql', 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS attribution_status text NOT NULL DEFAULT 'validada'/);
    const add = sql.indexOf("DEFAULT 'validada'");
    const setDefault = sql.indexOf("SET DEFAULT 'aguardando'");
    expect(setDefault).toBeGreaterThan(add);
  });
});
