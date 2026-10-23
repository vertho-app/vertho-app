/**
 * Portal do RC no contrato de representação v6 (decisões do dono de 23/10/2026):
 *
 *   · 7.1 e 7.3: cliente livre (CNPJ básico e INEP fora de outro RC e da lista
 *     de reserva) é aceito na hora; reserva, outro RC ou conferência que falhou
 *     vão para a fila; dois registros simultâneos voltam os dois para a fila;
 *   · 7.5 e 7.6: a proteção vale até a última movimentação + 90 dias, o aviso
 *     sai aos 60, e a movimentação sobre proteção vencida não tira o cliente de
 *     quem o registrou depois; quem registra depois vê só data e estágio;
 *   · 10.6: mesmo cliente = mesmo CNPJ básico (matriz e filiais) ou INEP, na
 *     conta e na carteira;
 *   · o CNPJ alfanumérico (Receita, julho de 2026) entra no mesmo formato.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock, type Chamada, type SupabaseMock } from '../helpers/supabase-mock';
import { dataBRT, segundaDaSemana, somarDias } from '@/lib/dre/semana';

let sb: SupabaseMock = criarSupabaseMock();
const enviados: any[] = [];
let envioOk = true;

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
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => undefined) }));
vi.mock('@/lib/email-provider', () => ({
  sendEmail: vi.fn(async (input: any) => {
    enviados.push(input);
    return envioOk ? { ok: true, provider: 'ses', messageId: 'm1' } : { ok: false, provider: 'ses', error: 'caixa cheia' };
  }),
}));

import { normalizarCnpj, mesmaInstituicao } from '@/lib/sales/duplicidade';
import {
  AVISO_SEM_MOVIMENTO_DIAS,
  DECISOR_AUTOMATICO,
  MENSAGEM_FILA,
  cnpjRaiz,
  conferirRegistro,
  decidirRegistro,
  paraORepresentante,
  precisaDeMovimentacao,
  protecaoAPartirDe,
  registrarMovimentacao,
  revogavel,
} from '@/lib/sales/registro';
import { classificarCarteira } from '@/lib/sales/aceite-rc';
import { eventosDoPlano, pagamentosDoCronograma, planoDeComissao } from '@/lib/sales/commissions';
import { commissionRatesFor } from '@/lib/sales/constants';
import { ehRcFicticio, emailDoAviso, enviarAvisosDeProtecao } from '@/lib/sales/alerta-protecao';
import { createOpportunity, getOpportunity, moveOpportunityStage, recusarRegistroOportunidade, registrarContato } from '@/actions/sales/opportunities';
import * as permissoes from '@/lib/sales/permissions';
import { createSalesAccount, criarOportunidadeExpansao, updateSalesAccount } from '@/actions/sales/accounts';
import { registrarComissaoIndicacao } from '@/actions/sales/commissions-admin';
import { buscarEscolasDoMercado } from '@/actions/sales/escolas';
import { getAtividadeSemanal } from '@/actions/sales/atividade';
import { gerarApresentacao, getApresentacaoPublica } from '@/actions/sales/apresentacoes';
import { TOKEN_APRESENTACAO, buildApresentacao } from '@/lib/sales/apresentacao';
import { conteudoInstitucional } from '@/lib/sales/proposal-document';
import { getMinhaMeta, salvarMeta } from '@/actions/sales/metas';
import { mesesCompletos, metaEditavel, progressoDaMeta, provisaoDeIndenizacao } from '@/lib/sales/metas';
import { representantePorEmail } from '@/lib/sales/equipe';
import { adicionarIntegrante } from '@/actions/sales/representatives';
import { approveProposal, markProposalAccepted, markProposalSentToClient, registrarAceitePropostaDoRC, submitProposalForApproval } from '@/actions/sales/proposals';

const escritasEm = (tabela: string, op: string) => sb.escritas.filter((e) => e.tabela === tabela && e.op === op);
const temElo = (cadeia: Chamada[], metodo: string) => cadeia.some((c) => c.metodo === metodo);
// Dias de Brasília, como o código: às 22h o dia ainda é o de hoje.
const hoje = () => dataBRT(new Date());
const daquiA = (dias: number) => somarDias(hoje(), dias);

beforeEach(() => {
  enviados.length = 0;
  envioOk = true;
});

describe('CNPJ básico, INEP e CNPJ alfanumérico', () => {
  it('CNPJ com pontuação, em minúsculas ou alfanumérico vira 14 posições; o resto não serve', () => {
    expect(normalizarCnpj('12.345.678/0001-95')).toBe('12345678000195');
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35'); // exemplo oficial da Receita
    expect(normalizarCnpj('12.ABC.345/01DE-3X')).toBeNull(); // verificador é sempre número
    expect(normalizarCnpj('123')).toBeNull();
    expect(cnpjRaiz('12.ABC.345/01DE-35')).toBe('12ABC345');
  });

  it('o dígito verificador é conferido (erro de digitação não passa como outro cliente)', () => {
    expect(normalizarCnpj('12.345.678/0001-90')).toBeNull();
    expect(normalizarCnpj('12.ABC.345/01DE-36')).toBeNull();
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizarCnpj('00.000.000/0000-00')).toBeNull(); // sequência repetida
  });

  it('matriz e filial são o mesmo cliente; INEP decide quando as duas têm', () => {
    const conta = (o: Record<string, any>) => ({ id: Math.random().toString(), representante_id: 'x', legal_name: null, trade_name: null, cnpj: null, city: null, ...o });
    expect(mesmaInstituicao(conta({ cnpj: '12.345.678/0001-95' }), conta({ cnpj: '12.345.678/0002-76' }))).toBe(true);
    expect(mesmaInstituicao(conta({ cnpj: '12.345.678/0001-95' }), conta({ cnpj: '87.654.321/0001-98' }))).toBe(false);
    expect(mesmaInstituicao(conta({ codigo_inep: '35000001', cnpj: '12.345.678/0001-95' }), conta({ codigo_inep: '35000002', cnpj: '12.345.678/0002-76' }))).toBe(false);
  });

  it('a coluna gerada da mig 298 usa a mesma regra do código', () => {
    const sql = readFileSync('migrations/298-rc-contrato-v6.sql', 'utf8');
    expect(sql).toContain("~ '^[0-9A-Z]{12}[0-9]{2}$'");
    expect(sql).toMatch(/substring\(upper\(regexp_replace\(cnpj, '\[\^0-9A-Za-z\]', '', 'g'\)\) from 1 for 8\)/);
  });

  it('mig 298: tabelas novas fecham para anon e authenticated, e o contato entra no kind', () => {
    const sql = readFileSync('migrations/298-rc-contrato-v6.sql', 'utf8');
    for (const t of ['sales_reservas', 'sales_metas', 'sales_remuneracao_rc', 'sales_representative_users']) expect(sql).toContain(`'${t}'`);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.%I FROM anon, authenticated/);
    expect(sql).toMatch(/'expansao', 'contato'\]/);
  });
});

// ── Registro (7.1, 7.3, 7.6) ────────────────────────────────────────────────

type Cenario = {
  reservado?: boolean;
  /** Contas de OUTRO RC com o mesmo CNPJ básico ou INEP. */
  outrasContas?: { id: string; status: string }[] | ((chamada: number) => { id: string; status: string }[]);
  oppsDasOutras?: any[];
  /** Propostas aceitas nas contas de outro RC (cliente ativo de verdade). */
  aceitasDasOutras?: any[];
};

function montarRegistro(c: Cenario = {}) {
  let conferencias = 0;
  sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'sales_accounts') return { id: 'acc-1', representante_id: 'rc-1', cnpj: '12.345.678/0001-95', codigo_inep: '35000001' };
      if (tabela === 'sales_contacts') return { id: 'ct-1', representante_id: 'rc-1', account_id: 'acc-1', role: 'Diretora' };
      return null;
    },
    lista: (tabela, _cols, cadeia) => {
      if (tabela === 'sales_reservas') return c.reservado ? [{ id: 'r1' }] : [];
      if (tabela === 'sales_accounts' && temElo(cadeia, 'or')) {
        conferencias++;
        return typeof c.outrasContas === 'function' ? c.outrasContas(conferencias) : (c.outrasContas ?? []);
      }
      if (tabela === 'sales_opportunities') return c.oppsDasOutras ?? [];
      if (tabela === 'sales_proposals') return c.aceitasDasOutras ?? [];
      return [];
    },
    escrita: (tabela, op) => (tabela === 'sales_opportunities' && op === 'update' ? [{ id: 'opp-new' }] : null),
    escritaUnica: (tabela, op, payload) => (tabela === 'sales_opportunities' && op === 'insert' ? { id: 'opp-new' } : payload),
  });
}

const input = {
  opportunity_name: 'Colégio Teste', account_id: 'acc-1', primary_contact_id: 'ct-1', origin: 'prospeccao',
  product_interest: 'onboarding', identified_need: 'Onboarding de professores', stage: 'contato_iniciado',
  estimated_value: 24000, estimated_close_date: '2026-12-01', next_action: 'Reunião', next_action_date: '2026-11-01',
  interaction_evidence: 'Reunião em 20/10 com a diretora',
};

const oppProtegida = { status: 'open', attribution_status: 'validada', protection_end_date: daquiA(30), stage: 'diagnostico_reuniao_realizada', updated_at: '2026-09-01T00:00:00Z', last_movement_at: '2026-09-01T00:00:00Z' };
const oppVencida = { ...oppProtegida, protection_end_date: daquiA(-1), last_movement_at: '2026-07-10T15:00:00Z' };

describe('7.1: registro de cliente livre é aceito na hora', () => {
  it('livre: nasce validada, com proteção de 90 dias e movimentação de hoje', async () => {
    montarRegistro();
    const r = await createOpportunity(input);
    expect(r).toMatchObject({ success: true, aceito: true });
    const p = escritasEm('sales_opportunities', 'insert')[0]?.payload;
    expect(p).toMatchObject({ attribution_status: 'validada', attribution_decided_by: DECISOR_AUTOMATICO, protection_start_date: hoje(), protection_end_date: daquiA(90) });
    expect(p.last_movement_at).toBeTruthy();
    // pergunta certa: o mesmo CNPJ básico OU o mesmo INEP, em contas de OUTRO RC
    expect(sb.usou('sales_accounts', 'or', 'cnpj_raiz.eq.12345678,codigo_inep.eq.35000001')).toBe(true);
    expect(sb.usou('sales_accounts', 'neq', 'representante_id')).toBe(true);
    expect(sb.usou('sales_reservas', 'or', 'cnpj_raiz.eq.12345678,codigo_inep.eq.35000001')).toBe(true);
  });

  it('lista de reserva da vertho.ai: vai para a fila, sem proteção, com o motivo', async () => {
    montarRegistro({ reservado: true });
    const r = await createOpportunity(input);
    expect(r).toMatchObject({ success: true, aceito: false });
    expect(escritasEm('sales_opportunities', 'insert')[0]?.payload).toMatchObject({
      attribution_status: 'aguardando', protection_start_date: null, protection_end_date: null, attribution_note: expect.stringMatching(/7\.3/),
    });
    // o RC não fica sabendo que é a lista de reserva (sondagem de quem a vertho.ai negocia):
    // a frase é a mesma da conferência que falhou
    expect((r as any).mensagem).not.toMatch(/reserva|7\.3/i);
    expect((r as any).mensagem).toBe(MENSAGEM_FILA);
  });

  it('cliente com outro RC e proteção em vigor: fila, sem dizer quem é o outro', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [oppProtegida] });
    const r = await createOpportunity(input);
    expect(r).toMatchObject({ success: true, aceito: false });
    expect(escritasEm('sales_opportunities', 'insert')[0]?.payload.attribution_status).toBe('aguardando');
    expect((r as any).mensagem).toMatch(/outro representante/);
  });

  it('cliente ativo de outro RC, com proposta aceita: fila', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'active_client' }], aceitasDasOutras: [{ id: 'p9' }] });
    expect(await createOpportunity(input)).toMatchObject({ success: true, aceito: false });
    expect(sb.usou('sales_proposals', 'eq', 'status')).toBe(true);
  });

  it('"Fechado" no funil sem proposta aceita não trava o cliente para os outros', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'active_client' }], aceitasDasOutras: [] });
    expect(await createOpportunity(input)).toMatchObject({ success: true, aceito: true });
  });

  it('proteção do outro RC acabou: aceito, e o RC vê só a data e o estágio (7.6)', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [oppVencida] });
    const r = await createOpportunity(input) as any;
    expect(r).toMatchObject({ success: true, aceito: true });
    expect(r.jaProspectado).toMatch(/10\/07\/2026/);
    expect(r.jaProspectado).toMatch(/Diagnóstico \/ reunião realizada/);
    expect(r.jaProspectado).not.toMatch(/acc-9|rc-2/);
  });

  it('conferência que falhou não aceita: vai para a fila', async () => {
    montarRegistro();
    sb.falharEm({ tabela: 'sales_reservas', op: 'select', mensagem: 'timeout' });
    const r = await createOpportunity(input);
    expect(r).toMatchObject({ success: true, aceito: false, mensagem: MENSAGEM_FILA });
    expect(escritasEm('sales_opportunities', 'insert')[0]?.payload).toMatchObject({ attribution_status: 'aguardando', attribution_note: expect.stringMatching(/não rodou/) });
  });

  it('dois registros no mesmo instante: o que foi aceito volta para a fila', async () => {
    // 1ª conferência: ninguém; 2ª (depois do insert): o outro RC registrou junto.
    montarRegistro({ outrasContas: (n) => (n === 1 ? [] : [{ id: 'acc-9', status: 'prospect' }]), oppsDasOutras: [oppProtegida] });
    const r = await createOpportunity(input);
    expect(r).toMatchObject({ success: true, aceito: false });
    const volta = escritasEm('sales_opportunities', 'update')[0]?.payload;
    expect(volta).toMatchObject({ attribution_status: 'aguardando', protection_start_date: null, protection_end_date: null });
    // só desfaz o aceite automático, nunca uma validação do admin
    expect(sb.usou('sales_opportunities', 'eq', 'attribution_decided_by')).toBe(true);
  });

  it('sem CNPJ nem INEP não há o que conferir: fila, nunca o aceite automático', async () => {
    sb = criarSupabaseMock();
    const d = await decidirRegistro(sb.client, { representanteId: 'rc-1', cnpj: null, codigoInep: null });
    expect(d.aceito).toBe(false);
    expect(d.campos.attribution_status).toBe('aguardando');
    expect(d.mensagem).toMatch(/Sem CNPJ nem INEP/);
  });

  it('a janela de proteção conta em dias de Brasília (22h30 de BRT ainda é o mesmo dia)', () => {
    const j = protecaoAPartirDe(new Date('2026-10-24T01:30:00Z')); // 23/10, 22h30 em Brasília
    expect(j).toEqual({ start: '2026-10-23', end: '2027-01-21' });
  });

  it('a conferência pura: oportunidade aguardando também segura o cliente', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [{ ...oppProtegida, attribution_status: 'aguardando', protection_end_date: null }] });
    const c = await conferirRegistro(sb.client, { representanteId: 'rc-1', cnpj: '12.345.678/0001-95' });
    expect(c.livre).toBe(false);
  });
});

// ── Contas (bloqueio) ───────────────────────────────────────────────────────

describe('conta: o cliente com outro RC não entra', () => {
  it('CNPJ de cliente protegido de outro RC: a conta não é criada', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [oppProtegida] });
    const r = await createSalesAccount({ legal_name: 'Colégio X', cnpj: '12.345.678/0003-57' });
    expect(r.success).toBe(false);
    expect(escritasEm('sales_accounts', 'insert')).toHaveLength(0);
  });

  it('CNPJ fora do formato não entra', async () => {
    montarRegistro();
    const r = await createSalesAccount({ legal_name: 'Colégio X', cnpj: '123.456' });
    expect(r.success).toBe(false);
    expect(escritasEm('sales_accounts', 'insert')).toHaveLength(0);
  });

  it('CNPJ livre: a conta é criada com o CNPJ formatado', async () => {
    montarRegistro();
    const r = await createSalesAccount({ legal_name: 'Colégio X', cnpj: '12345678000195', codigo_inep: '35000001' });
    expect(r.success).toBe(true);
    expect(escritasEm('sales_accounts', 'insert')[0]?.payload).toMatchObject({ cnpj: '12.345.678/0001-95', codigo_inep: '35000001' });
  });

  it('trocar o CNPJ de conta com registro: só pela vertho.ai', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', cnpj: '12.345.678/0001-95', codigo_inep: null } : null),
      contagem: (tabela) => (tabela === 'sales_opportunities' ? 1 : 0),
    });
    const r = await updateSalesAccount('acc-1', { cnpj: '87.654.321/0001-98' });
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/vertho\.ai/);
    expect(escritasEm('sales_accounts', 'update')).toHaveLength(0);
  });

  it('completar o CNPJ de conta JÁ registrada com cliente reservado: o registro volta para a fila, sem dizer por quê', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', cnpj: null, codigo_inep: null } : null),
      contagem: (tabela) => (tabela === 'sales_opportunities' ? 1 : 0),
      lista: (tabela) => (tabela === 'sales_reservas' ? [{ id: 'r1' }] : []),
      escrita: (tabela, op) => (tabela === 'sales_opportunities' && op === 'update' ? [{ id: 'opp-1' }] : null),
    });
    const r = await updateSalesAccount('acc-1', { cnpj: '12.345.678/0001-95' });
    expect(r.success).toBe(true);
    expect((r as any).aviso).toMatch(/validação/);
    expect((r as any).aviso).not.toMatch(/reserva|7\.3/i);
    const fila = escritasEm('sales_opportunities', 'update')[0]?.payload;
    expect(fila).toMatchObject({ attribution_status: 'aguardando', protection_end_date: null, attribution_note: expect.stringMatching(/reserva/) });
    expect(sb.usou('sales_opportunities', 'eq', 'account_id')).toBe(true);
  });

  it('completar o CNPJ de conta registrada com cliente de outro RC: barra', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', cnpj: null, codigo_inep: null } : null),
      contagem: (tabela) => (tabela === 'sales_opportunities' ? 1 : 0),
      lista: (tabela, _c, cadeia) => (tabela === 'sales_accounts' && temElo(cadeia, 'or') ? [{ id: 'acc-9', status: 'prospect' }] : tabela === 'sales_opportunities' ? [oppProtegida] : []),
    });
    const r = await updateSalesAccount('acc-1', { cnpj: '12.345.678/0001-95' });
    expect(r.success).toBe(false);
    expect(escritasEm('sales_accounts', 'update')).toHaveLength(0);
  });

  it('conta nova com CNPJ reservado: criada, sem aviso nenhum', async () => {
    montarRegistro({ reservado: true });
    const r = await createSalesAccount({ legal_name: 'Colégio X', cnpj: '12.345.678/0001-95' });
    expect(r).toMatchObject({ success: true, aviso: null });
  });

  it('expansão só de cliente ativo da carteira', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', status: 'prospect', cnpj: null, codigo_inep: null, legal_name: 'X' } : null),
    });
    expect((await criarOportunidadeExpansao('acc-1')).success).toBe(false);
    expect(escritasEm('sales_opportunities', 'insert')).toHaveLength(0);
  });

  it('completar o CNPJ que estava vazio continua livre', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', cnpj: null, codigo_inep: null } : null),
      contagem: () => 1,
    });
    expect((await updateSalesAccount('acc-1', { cnpj: '12.345.678/0001-95' })).success).toBe(true);
    expect(escritasEm('sales_accounts', 'update')[0]?.payload.cnpj).toBe('12.345.678/0001-95');
  });
});

// ── Movimentação (7.5 e 7.6) ────────────────────────────────────────────────

function montarOpp(opp: Record<string, any>, outras: Cenario = {}) {
  sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'sales_opportunities'
      ? { id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', status: 'open', attribution_status: 'validada', stage: 'contato_iniciado', account: { cnpj: '12.345.678/0001-95', codigo_inep: null }, ...opp }
      : tabela === 'sales_proposals' ? { id: 'p1', representante_id: 'rc-1', status: 'approved', opportunity_id: 'opp-1' } : null),
    lista: (tabela, _c, cadeia) => {
      if (tabela === 'sales_accounts' && temElo(cadeia, 'or')) return (outras.outrasContas as any[]) ?? [];
      if (tabela === 'sales_opportunities') return outras.oppsDasOutras ?? [];
      return [];
    },
  });
}

describe('7.5: a proteção vale até a última movimentação + 90 dias', () => {
  it('contato exige canal e evidência, e não grava nada sem eles', async () => {
    montarOpp({ protection_end_date: daquiA(10) });
    expect((await registrarContato('opp-1', { canal: 'pombo', evidencia: 'Falei com a diretora sobre o piloto' })).success).toBe(false);
    expect((await registrarContato('opp-1', { canal: 'telefone', evidencia: 'ok' })).success).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });

  it('contato registrado renova a proteção e zera o aviso de 60 dias', async () => {
    montarOpp({ protection_end_date: daquiA(10) });
    const r = await registrarContato('opp-1', { canal: 'whatsapp', evidencia: 'Diretora pediu proposta para 40 professores' });
    expect(r.success).toBe(true);
    expect(escritasEm('sales_activity_notes', 'insert')[0]?.payload).toMatchObject({ kind: 'contato', canal: 'whatsapp' });
    expect(escritasEm('sales_opportunities', 'update')[0]?.payload).toMatchObject({ protection_end_date: daquiA(90), aviso_60_em: null, protection_status: 'active' });
  });

  it('não encurta uma janela maior que a vertho.ai tenha dado', async () => {
    montarOpp({ protection_end_date: daquiA(200) });
    const r = await registrarMovimentacao(sb.client, 'opp-1');
    expect(r).toEqual({ renovada: true, protecaoAte: daquiA(200) });
  });

  it('proteção vencida e cliente já com outro RC: registra o movimento sem renovar', async () => {
    montarOpp({ protection_end_date: daquiA(-3) }, { outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [oppProtegida] } as any);
    const r = await registrarMovimentacao(sb.client, 'opp-1');
    expect(r).toEqual({ renovada: false, motivo: 'cliente_com_outro' });
    const patch = escritasEm('sales_opportunities', 'update')[0]?.payload;
    expect(patch.last_movement_at).toBeTruthy();
    expect(patch).not.toHaveProperty('protection_end_date');
  });

  it('proteção vencida e cliente ainda livre: a movimentação renova', async () => {
    montarOpp({ protection_end_date: daquiA(-3) });
    expect(await registrarMovimentacao(sb.client, 'opp-1')).toEqual({ renovada: true, protecaoAte: daquiA(90) });
  });

  it('registro na fila não ganha proteção por movimentação', async () => {
    montarOpp({ attribution_status: 'aguardando', protection_end_date: null });
    expect(await registrarMovimentacao(sb.client, 'opp-1')).toEqual({ renovada: false, motivo: 'nao_se_aplica' });
    expect(escritasEm('sales_opportunities', 'update')).toHaveLength(0);
  });

  it('mudança de estágio e proposta enviada são movimentação', async () => {
    montarOpp({ protection_end_date: daquiA(5) });
    expect((await moveOpportunityStage('opp-1', 'diagnostico_reuniao_realizada')).success).toBe(true);
    expect(escritasEm('sales_opportunities', 'update').some((e) => e.payload.protection_end_date === daquiA(90))).toBe(true);

    montarOpp({ protection_end_date: daquiA(5) });
    expect((await markProposalSentToClient('p1')).success).toBe(true);
    expect(escritasEm('sales_opportunities', 'update').some((e) => e.payload.protection_end_date === daquiA(90))).toBe(true);
  });

  it('aviso: 60 dias sem movimentação ou proteção vencida; registro na fila não', () => {
    const base = { status: 'open', attribution_status: 'validada', protection_end_date: daquiA(40) };
    const ha = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
    expect(precisaDeMovimentacao({ ...base, last_movement_at: ha(AVISO_SEM_MOVIMENTO_DIAS - 1) })).toBe(false);
    expect(precisaDeMovimentacao({ ...base, last_movement_at: ha(AVISO_SEM_MOVIMENTO_DIAS) })).toBe(true);
    expect(precisaDeMovimentacao({ ...base, protection_end_date: daquiA(-1), last_movement_at: ha(10) })).toBe(true);
    expect(precisaDeMovimentacao({ ...base, attribution_status: 'aguardando', last_movement_at: ha(80) })).toBe(false);
  });
});

describe('e-mail de 60 dias (cron alerta_protecao_rc)', () => {
  const opp = { id: 'opp-1', representante_id: 'rc-1', opportunity_name: 'Colégio Aurora', last_movement_at: '2026-08-20T10:00:00Z', protection_end_date: '2026-11-18', account: { legal_name: 'Aurora Ltda', trade_name: 'Colégio Aurora' } };
  const montar = (reps: any[]) => {
    sb = criarSupabaseMock({
      lista: (tabela) => (tabela === 'sales_opportunities' ? [opp] : tabela === 'sales_representatives' ? reps : []),
    });
  };

  it('texto: 60 dias, a cláusula, a data de corte e o link', () => {
    const e = emailDoAviso('Angélica', [opp]);
    expect(e.subject).toMatch(/60 dias/);
    expect(e.text).toMatch(/7\.5/);
    expect(e.text).toMatch(/18\/11\/2026/);
    expect(e.html).toContain('/representante/crm/opp-1');
  });

  it('pergunta só as abertas, validadas, sem aviso no ciclo e ainda protegidas', async () => {
    montar([{ id: 'rc-1', name: 'Angélica Souza', email: 'angelica@exemplo.com', status: 'active' }]);
    const r = await enviarAvisosDeProtecao(sb.client);
    expect(sb.usou('sales_opportunities', 'is', 'aviso_60_em')).toBe(true);
    expect(sb.usou('sales_opportunities', 'lte', 'last_movement_at')).toBe(true);
    expect(sb.usou('sales_opportunities', 'gte', 'protection_end_date')).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(r).toMatchObject({ representantes: 1, oportunidades: 1, falhas: [] });
    expect(escritasEm('sales_opportunities', 'update')[0]?.payload.aviso_60_em).toBeTruthy();
  });

  it('envio que falhou não marca o aviso (sai de novo amanhã) e volta como falha', async () => {
    montar([{ id: 'rc-1', name: 'Angélica', email: 'angelica@exemplo.com', status: 'active' }]);
    envioOk = false;
    const r = await enviarAvisosDeProtecao(sb.client);
    expect(r.falhas).toHaveLength(1);
    expect(escritasEm('sales_opportunities', 'update')).toHaveLength(0);
  });

  it('RC inativo não recebe', async () => {
    montar([{ id: 'rc-1', name: 'Angélica', email: 'angelica@exemplo.com', status: 'inactive' }]);
    await enviarAvisosDeProtecao(sb.client);
    expect(enviados).toHaveLength(0);
  });

  it('RC fictício da demonstração não recebe (a caixa não existe)', async () => {
    montar([{ id: 'rc-1', name: 'Mariana Costa', email: 'demo-rc-mariana@vertho.ai', status: 'active' }]);
    await enviarAvisosDeProtecao(sb.client);
    expect(enviados).toHaveLength(0);
    expect(ehRcFicticio('exemplo-doc@vertho.ai')).toBe(true);
    expect(ehRcFicticio('rodrigo@vertho.ai')).toBe(false);
    expect(ehRcFicticio('demo-rc-mariana@vertho.ai.evil.com')).toBe(false);
  });

  it('o cron chama a action e o vercel.json agenda', () => {
    expect(readFileSync('app/api/cron/route.ts', 'utf8')).toContain("case 'alerta_protecao_rc'");
    expect(readFileSync('vercel.json', 'utf8')).toContain('/api/cron?action=alerta_protecao_rc');
  });
});

// ── Revogação do aceite automático (7.1) e proposta de quem perdeu o cliente (7.6) ──

describe('7.1: a vertho.ai revoga o aceite automático em até 10 dias', () => {
  const ha = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
  const opp = (o: Record<string, any>) => ({ id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', status: 'open', attribution_status: 'validada', attribution_decided_by: DECISOR_AUTOMATICO, attribution_decided_at: ha(3), ...o });
  const montar = (o: Record<string, any>) => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? opp(o) : null),
      escrita: (tabela, op) => (tabela === 'sales_opportunities' && op === 'update' ? [{ id: 'opp-1' }] : null),
    });
  };

  it('dentro da janela: revoga, só se ainda for o aceite automático, e as propostas abertas caem junto', async () => {
    montar({});
    expect((await recusarRegistroOportunidade('opp-1', 'Cliente em negociação direta (7.3)')).success).toBe(true);
    expect(escritasEm('sales_opportunities', 'update')[0]?.payload).toMatchObject({ attribution_status: 'recusada', status: 'expired' });
    expect(escritasEm('sales_proposals', 'update')[0]?.payload).toMatchObject({ status: 'lost' });
    expect(sb.usou('sales_proposals', 'eq', 'opportunity_id')).toBe(true);
    expect(sb.usou('sales_opportunities', 'eq', 'attribution_decided_by')).toBe(true);
    expect(escritasEm('sales_activity_notes', 'insert')[0]?.payload.note).toMatch(/revogado/);
  });

  it('depois de 10 dias, ou validado pelo admin: não revoga', async () => {
    montar({ attribution_decided_at: ha(11) });
    expect((await recusarRegistroOportunidade('opp-1', 'tarde demais')).success).toBe(false);
    montar({ attribution_decided_by: 'admin@vertho.ai' });
    expect((await recusarRegistroOportunidade('opp-1', 'decisão do admin')).success).toBe(false);
    expect(escritasEm('sales_opportunities', 'update')).toHaveLength(0);
    expect(revogavel(opp({ status: 'won' }))).toBe(false);
  });
});

describe('7.6: proposta de quem perdeu o cliente não segue', () => {
  const proposta = {
    id: 'p1', representante_id: 'rc-1', opportunity_id: 'opp-1', status: 'draft',
    customer_type: 'escola', number_of_users: 30, product_package: 'onboarding', contract_duration_months: 12,
    payment_terms: 'Mensal', included_scope: 'Jornada', monthly_value: 2000, total_contract_value: 24000,
  };
  const montar = (outrasContas: any[]) => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_proposals' ? proposta
        : tabela === 'sales_opportunities' ? { attribution_status: 'validada', representante_id: 'rc-1', protection_end_date: daquiA(-5), account: { cnpj: '12.345.678/0001-95', codigo_inep: null } } : null),
      lista: (tabela, _c, cadeia) => (tabela === 'sales_accounts' && temElo(cadeia, 'or') ? outrasContas : tabela === 'sales_opportunities' ? [oppProtegida] : []),
    });
  };

  it('proteção vencida e cliente com outro RC: não submete', async () => {
    montar([{ id: 'acc-9', status: 'prospect' }]);
    const r = await submitProposalForApproval('p1');
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/7\.6/);
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
  });

  it('proteção vencida e cliente ainda livre: submete', async () => {
    montar([]);
    expect((await submitProposalForApproval('p1')).success).toBe(true);
  });

  it('registro revogado: a proposta aprovada não é enviada nem aceita', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_proposals' ? { ...proposta, status: 'approved' }
        : tabela === 'sales_opportunities' ? { attribution_status: 'recusada' } : null),
    });
    expect((await markProposalSentToClient('p1')).success).toBe(false);
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_proposals' ? { ...proposta, status: 'sent_to_client' }
        : tabela === 'sales_opportunities' ? { attribution_status: 'recusada' } : null),
    });
    expect((await markProposalAccepted('p1')).success).toBe(false);
    expect(escritasEm('sales_commission_events', 'insert')).toHaveLength(0);
  });
});

// ── Carteira (10.6) e aceite ────────────────────────────────────────────────

describe('10.6: carteira pelo CNPJ básico ou INEP', () => {
  it('proposta aceita em outra conta do RC com o mesmo CNPJ básico conta como carteira', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { cnpj_raiz: '12345678', codigo_inep: null } : null),
      lista: (tabela, _c, cadeia) => {
        if (tabela === 'sales_accounts') return [{ id: 'acc-2' }];
        if (tabela === 'sales_proposals') {
          const em = cadeia.find((e) => e.metodo === 'in' && e.args[0] === 'account_id')?.args[1] ?? [];
          return em.includes('acc-2') ? [{ id: 'p0', proposal_number: 'PROP-9' }] : [];
        }
        return [];
      },
    });
    const c = await classificarCarteira(sb.client, { representanteId: 'rc-1', accountId: 'acc-1' });
    expect(c.carteira).toBe(true);
    expect(sb.usou('sales_accounts', 'eq', 'representante_id')).toBe(true);
    expect(sb.usou('sales_accounts', 'or', 'cnpj_raiz.eq.12345678')).toBe(true);
  });

  it('o aceite registra a data (base das metas)', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => {
        if (tabela === 'sales_proposals') return { id: 'p1', proposal_number: 'PROP-1', representante_id: 'rc-1', status: 'sent_to_client', opportunity_id: null, account_id: null, total_contract_value: 24000, contract_duration_months: 12, compensation_model: 'sem_ajuda', carteira: false, created_at: '2026-10-01T00:00:00Z' };
        if (tabela === 'sales_representatives') return { status: 'active', compensation_model: 'sem_ajuda', contract_ended_at: null };
        return null;
      },
      escrita: (tabela, op) => (tabela === 'sales_proposals' && op === 'update' ? [{ id: 'p1' }] : null),
    });
    expect((await registrarAceitePropostaDoRC('p1')).success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0]?.payload).toMatchObject({ status: 'accepted', accepted_recorded_at: expect.any(String) });
  });
});

// ── Cronograma de pagamento (10.2 e 10.3) ───────────────────────────────────

describe('10.3: comissão por Parcela Mensal Equivalente, na data do pagamento que a cobre', () => {
  const sem = commissionRatesFor('sem_ajuda');
  const com = commissionRatesFor('com_ajuda');
  const soma = (ev: { amount: number }[]) => Math.round(ev.reduce((t, e) => t + e.amount, 0) * 100) / 100;

  it('cada pagamento cobre um bloco igual de parcelas, adiantado', () => {
    expect(pagamentosDoCronograma(12, { pagamentos: 4 })).toEqual([
      { numero: 1, mes: 0, pmeDe: 1, pmeAte: 3 }, { numero: 2, mes: 3, pmeDe: 4, pmeAte: 6 },
      { numero: 3, mes: 6, pmeDe: 7, pmeAte: 9 }, { numero: 4, mes: 9, pmeDe: 10, pmeAte: 12 },
    ]);
    expect(pagamentosDoCronograma(6, { pagamentos: 1, primeiroEmMeses: 2 })).toEqual([{ numero: 1, mes: 2, pmeDe: 1, pmeAte: 6 }]);
    expect(pagamentosDoCronograma(6)).toHaveLength(6); // sem cronograma: mensal
  });

  it('exemplo do Anexo II: 6 meses, 60 mil à vista = 4.800 de aquisição + 5.000 das parcelas 2 a 6, no 1º pagamento', () => {
    const ev = eventosDoPlano(planoDeComissao(60000, 6, sem), '2026-11-10', { pagamentos: 1 });
    expect(ev.map((e) => [e.type, e.amount, e.reference_month])).toEqual([
      ['aquisicao', 4800, '2026-11-01'],
      ['recorrente', 5000, '2026-11-01'],
    ]);
    expect(ev[1].base_value).toBe(50000);
  });

  it('com ajuda, à vista: 10% de tudo no 1º pagamento (6.000)', () => {
    const ev = eventosDoPlano(planoDeComissao(60000, 6, com), '2026-11-10', { pagamentos: 1 });
    expect(ev.map((e) => [e.type, e.amount])).toEqual([['recorrente', 6000]]);
  });

  it('o prazo do cliente empurra as datas, e a soma é sempre o plano', () => {
    const plano = planoDeComissao(48000, 24, sem);
    const mensal = eventosDoPlano(plano, '2026-11-10');
    const trimestral = eventosDoPlano(plano, '2026-11-10', { pagamentos: 8, primeiroEmMeses: 1 });
    expect(soma(mensal)).toBe(plano.total); // 1.920 + 4.600
    expect(soma(trimestral)).toBe(plano.total);
    expect(trimestral[0]).toMatchObject({ type: 'aquisicao', amount: 1920, reference_month: '2026-12-01', expected_payment_date: '2027-01-15' });
    // 1º pagamento cobre as parcelas 1 a 3; a 1ª dispara a aquisição, então 2 parcelas comissionadas
    expect(trimestral[1]).toMatchObject({ type: 'recorrente', amount: 400, reference_month: '2026-12-01' });
    expect(trimestral[2]).toMatchObject({ amount: 600, reference_month: '2027-03-01' });
  });

  it('a aprovação grava o cronograma, e número fora da vigência não passa', async () => {
    const proposta = {
      id: 'p1', representante_id: 'rc-1', account_id: 'acc-1', opportunity_id: 'opp-1', status: 'submitted_for_approval',
      monthly_value: 2000, contract_duration_months: 12, discount_requested: 0, customer_type: 'escola', number_of_users: 30,
      product_package: 'onboarding', payment_terms: 'Trimestral', included_scope: 'Jornada', compensation_model: 'sem_ajuda', carteira: false,
    };
    const montar = () => {
      sb = criarSupabaseMock({
        resolver: (tabela) => (tabela === 'sales_proposals' ? proposta
          : tabela === 'sales_opportunities' ? { attribution_status: 'validada' }
          : tabela === 'sales_representatives' ? { compensation_model: 'sem_ajuda' } : null),
      });
    };
    montar();
    expect((await approveProposal('p1', { pagamentos: 13 })).success).toBe(false);
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
    montar();
    expect((await approveProposal('p1', { pagamentos: 4, primeiroPagamentoEmMeses: 1 })).success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0]?.payload).toMatchObject({ payment_count: 4, first_payment_offset_months: 1 });
    montar();
    expect((await approveProposal('p1', { pagamentos: 12 })).success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0]?.payload).toMatchObject({ payment_count: null }); // mensal
  });
});

// ── Modelo de indicação (consultor, 10% de cada recebimento) ────────────────

describe('indicação: a vertho.ai lança 10% de cada pagamento recebido, cliente a cliente', () => {
  const montar = (modelo: string) => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_representatives' ? { id: 'rc-9', name: 'Consultor Salvador', compensation_model: modelo } : null),
    });
  };

  it('lança a receber, com competência do recebimento e pagamento no dia 15 do mês seguinte', async () => {
    montar('indicacao');
    const r = await registrarComissaoIndicacao({ representanteId: 'rc-9', cliente: 'Clínica Bem Estar', valorRecebido: 1234.5, recebidoEm: '2026-10-07' });
    expect(r).toMatchObject({ success: true, comissao: 123.45 });
    expect(escritasEm('sales_commission_events', 'insert')[0]?.payload).toMatchObject({
      type: 'indicacao', status: 'accrued', base_value: 1234.5, percent: 10, amount: 123.45,
      reference_month: '2026-10-01', expected_payment_date: '2026-11-15', notes: expect.stringContaining('Clínica Bem Estar'),
    });
  });

  it('representante de outro modelo, cliente em branco ou data futura: não lança', async () => {
    montar('sem_ajuda');
    expect((await registrarComissaoIndicacao({ representanteId: 'rc-9', cliente: 'Clínica', valorRecebido: 100, recebidoEm: '2026-10-07' })).success).toBe(false);
    montar('indicacao');
    expect((await registrarComissaoIndicacao({ representanteId: 'rc-9', cliente: '  ', valorRecebido: 100, recebidoEm: '2026-10-07' })).success).toBe(false);
    expect((await registrarComissaoIndicacao({ representanteId: 'rc-9', cliente: 'Clínica', valorRecebido: 100, recebidoEm: daquiA(3) })).success).toBe(false);
    expect(escritasEm('sales_commission_events', 'insert')).toHaveLength(0);
  });
});

describe('sigilo da fila: o RC não recebe o motivo enquanto o registro aguarda', () => {
  it('getOpportunity do RC volta sem attribution_note; a do admin, com', async () => {
    const linha = { id: 'opp-1', representante_id: 'rc-1', status: 'open', attribution_status: 'aguardando', attribution_note: 'Lista de reserva da vertho.ai (cláusula 7.3).', protection_end_date: null, protection_status: 'active' };
    sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_opportunities' ? linha : null) });
    vi.mocked(permissoes.requireRepresentativeOrAdminAction).mockResolvedValueOnce({ kind: 'representative', email: 'rc@teste.vertho', rep: { id: 'rc-1' } } as any);
    const rc = await getOpportunity('opp-1');
    expect((rc as any).data.attribution_note).toBeNull();
    expect(JSON.stringify(rc)).not.toMatch(/reserva/);

    vi.mocked(permissoes.requireRepresentativeOrAdminAction).mockResolvedValueOnce({ kind: 'admin', email: 'admin@vertho.ai' } as any);
    const admin = await getOpportunity('opp-1');
    expect((admin as any).data.attribution_note).toMatch(/reserva/);
  });

  it('recusada: o recado do admin chega ao RC', () => {
    expect(paraORepresentante({ attribution_status: 'recusada', attribution_note: 'Cliente da vertho.ai' }).attribution_note).toBe('Cliente da vertho.ai');
  });
});

// ── CRM com a base de escolas e atividade semanal (decisões 6 e 7) ──────────

describe('busca de escola na base do Mercado Potencial', () => {
  it('só rede privada da UF, cada palavra sem acento no nome, cidade com curinga de acento', async () => {
    sb = criarSupabaseMock({ lista: (tabela) => (tabela === 'diag_mv_mercado_escola' ? [{ codigo_inep: '35000001', nome: 'COLEGIO SAO JOSE', municipio: 'São Paulo', uf: 'SP', qt_professores: 40, qt_coord_pedag: 3, qt_diretor_proxy: 1, etapas: ['EF'] }] : []) });
    const r = await buscarEscolasDoMercado({ termo: 'Colégio São', uf: 'sp', municipio: 'sao paulo' });
    expect(r).toMatchObject({ success: true, escolas: [{ codigo_inep: '35000001', professores: 40, coordenadores: 3, diretores: 1 }] });
    expect(sb.usou('diag_mv_mercado_escola', 'eq', 'rede')).toBe(true);
    const ilikes = sb.chamadas.filter((c) => c.metodo === 'ilike').map((c) => c.args);
    expect(ilikes).toContainEqual(['nome', '%COLEGIO%']);
    expect(ilikes).toContainEqual(['nome', '%SAO%']);
    expect(ilikes).toContainEqual(['municipio', '%s__ p__l_%']);
  });

  it('sem UF válida ou com menos de 3 letras não busca', async () => {
    sb = criarSupabaseMock();
    expect((await buscarEscolasDoMercado({ termo: 'Colégio', uf: 'XX' })).success).toBe(false);
    expect((await buscarEscolasDoMercado({ termo: 'ab', uf: 'SP' })).success).toBe(false);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('nunca lê os contatos enriquecidos nem diz se a escola está com outro RC', () => {
    const src = readFileSync('actions/sales/escolas.ts', 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/mercado_escola_contatos|sales_accounts|sales_opportunities/);
  });
});

describe('atividade semanal (só admin)', () => {
  it('conta contatos, registros, estágios e propostas na semana de Brasília', async () => {
    const segunda = segundaDaSemana(dataBRT(new Date()));
    const terca = `${somarDias(segunda, 1)}T15:00:00Z`;
    sb = criarSupabaseMock({
      lista: (tabela) => {
        if (tabela === 'sales_representatives') return [{ id: 'rc-1', name: 'Angélica', status: 'active' }];
        if (tabela === 'sales_activity_notes') return [
          { representante_id: 'rc-1', kind: 'contato', note: 'WhatsApp: ...', created_at: terca },
          { representante_id: 'rc-1', kind: 'nota', note: 'Estágio: a → b', created_at: terca },
          { representante_id: 'rc-2', kind: 'contato', note: 'outro RC', created_at: terca },
        ];
        if (tabela === 'sales_opportunities') return [{ representante_id: 'rc-1', created_at: terca, last_movement_at: terca }];
        if (tabela === 'sales_proposals') return [{ representante_id: 'rc-1', created_at: terca, sent_to_client_at: terca }];
        return [];
      },
    });
    const r = await getAtividadeSemanal(4) as any;
    expect(r.success).toBe(true);
    expect(r.inicios).toHaveLength(4);
    expect(r.linhas[0].semanas[3]).toMatchObject({ inicio: segunda, contatos: 1, registros: 1, mudancasDeEstagio: 1, propostasCriadas: 1, propostasEnviadas: 1 });
    expect(r.linhas[0].semanas[0]).toMatchObject({ contatos: 0, registros: 0 });
  });

  it('leitura que falha não vira semana vazia', async () => {
    sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'sales_activity_notes', op: 'select', mensagem: 'timeout' });
    expect((await getAtividadeSemanal(4)).success).toBe(false);
  });
});

// ── Apresentação personalizada (decisão 8, mig 299) ─────────────────────────

describe('apresentação personalizada que o RC gera', () => {
  it('o VM tem o conteúdo da proposta e nada de preço', () => {
    const vm = buildApresentacao({ cliente_nome: 'Colégio Aurora', segmento: 'educacao', contexto: '  Coordenação nova  ' }, { name: 'Angélica', email: 'a@x.com', phone: '11999990000' });
    expect(vm.contexto).toBe('Coordenação nova');
    expect(vm.pilares).toBe(conteudoInstitucional('educacao').pilares);
    expect(vm.videos).toEqual([]);
    expect(JSON.stringify(vm)).not.toMatch(/investimento|monthly|total_contract|comiss/i);
    expect(buildApresentacao({ cliente_nome: null, segmento: 'xyz', contexto: null }, null)).toMatchObject({ segmento: 'corporativo', contato: { nome: 'Representante vertho.ai' } });
  });

  it('gera com o contexto confirmado (cortado em 600) e o segmento da conta', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', status: 'open', attribution_status: 'validada', account: { legal_name: 'Aurora Ltda', trade_name: 'Colégio Aurora', segment: 'escola' } } : null),
    });
    const r = await gerarApresentacao('opp-1', { contexto: 'x'.repeat(700) });
    expect(r).toMatchObject({ success: true, novo: true });
    const p = escritasEm('sales_apresentacoes', 'insert')[0]?.payload;
    expect(p).toMatchObject({ segmento: 'educacao', cliente_nome: 'Colégio Aurora', representante_id: 'rc-1' });
    expect(p.contexto).toHaveLength(600);
    expect(TOKEN_APRESENTACAO.test(p.token)).toBe(true);
  });

  it('com link em vigor, só atualiza o contexto (o endereço que o cliente tem continua)', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', status: 'open', attribution_status: 'validada', account: null } : null),
      lista: (tabela) => (tabela === 'sales_apresentacoes' ? [{ id: 'ap-1', token: 'TOKEN_existente_123456' }] : []),
    });
    expect(await gerarApresentacao('opp-1', { contexto: 'novo' })).toMatchObject({ success: true, novo: false, token: 'TOKEN_existente_123456' });
    expect(escritasEm('sales_apresentacoes', 'insert')).toHaveLength(0);
  });

  it('registro recusado não gera apresentação', async () => {
    sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', attribution_status: 'recusada' } : null) });
    expect((await gerarApresentacao('opp-1', {})).success).toBe(false);
    expect(escritasEm('sales_apresentacoes', 'insert')).toHaveLength(0);
  });

  it('leitura pública: token fora do formato nem consulta; revogada não abre; aberta conta a visita', async () => {
    sb = criarSupabaseMock();
    expect(await getApresentacaoPublica('../../etc')).toBeNull();
    expect(sb.chamadas).toHaveLength(0);

    sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_apresentacoes' ? { id: 'ap-1', representante_id: 'rc-1', segmento: 'educacao', revogada_em: '2026-10-20T00:00:00Z' } : null) });
    expect(await getApresentacaoPublica('TOKEN_valido_abcdefghij')).toBeNull();

    const linha = { id: 'ap-1', representante_id: 'rc-1', cliente_nome: 'Colégio Aurora', segmento: 'educacao', contexto: null, view_count: 2, first_viewed_at: '2026-10-20T00:00:00Z', revogada_em: null, opportunity: { attribution_status: 'validada' } };
    const montar = (ap: any, rep: any) => { sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_apresentacoes' ? ap : tabela === 'sales_representatives' ? rep : null) }); };
    montar(linha, { name: 'Angélica', email: 'a@x.com', phone: null, status: 'active' });
    const vm = await getApresentacaoPublica('TOKEN_valido_abcdefghij');
    expect(vm?.cliente.nome).toBe('Colégio Aurora');
    expect(escritasEm('sales_apresentacoes', 'update')[0]?.payload).toMatchObject({ view_count: 3, first_viewed_at: '2026-10-20T00:00:00Z' });

    // registro recusado ou RC fora do canal: a página não abre (e não conta abertura)
    montar({ ...linha, opportunity: { attribution_status: 'recusada' } }, { name: 'Angélica', status: 'active' });
    expect(await getApresentacaoPublica('TOKEN_valido_abcdefghij')).toBeNull();
    montar(linha, { name: 'Angélica', status: 'inactive' });
    expect(await getApresentacaoPublica('TOKEN_valido_abcdefghij')).toBeNull();
    expect(escritasEm('sales_apresentacoes', 'update')).toHaveLength(0);
  });

  it('recusar ou revogar o registro desativa a apresentação; oportunidade fechada não gera', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', status: 'open', attribution_status: 'aguardando' } : null),
      escrita: (tabela, op) => (tabela === 'sales_opportunities' && op === 'update' ? [{ id: 'opp-1' }] : null),
    });
    expect((await recusarRegistroOportunidade('opp-1', 'Cliente da vertho.ai')).success).toBe(true);
    expect(escritasEm('sales_apresentacoes', 'update')[0]?.payload).toMatchObject({ revogada_em: expect.any(String) });

    sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_opportunities' ? { id: 'opp-1', representante_id: 'rc-1', status: 'won', attribution_status: 'validada' } : null) });
    expect((await gerarApresentacao('opp-1', {})).success).toBe(false);
  });

  it('a página pública não fala de preço e a mig 299 fecha a tabela', () => {
    const pagina = readFileSync('app/apresentacao/[token]/page.tsx', 'utf8');
    expect(pagina).not.toMatch(/fmtBRL|investimento|total_contract|monthly_value/);
    const sql = readFileSync('migrations/299-rc-apresentacao.sql', 'utf8');
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.sales_apresentacoes FROM anon, authenticated/);
    expect(sql).toMatch(/opportunity_id\s+uuid REFERENCES public\.sales_opportunities\(id\) ON DELETE CASCADE/);
  });
});

// ── Metas (Anexo IV) e provisão da indenização (cláusula 19) ────────────────

describe('metas: marcos trimestrais acumulados sobre o valor contratado', () => {
  const meta = { periodo_inicio: '2026-11-03', meta_anual: 400000, marco_t1: 50000, marco_t2: 150000, marco_t3: 250000, ativacao_pipeline: 100000, primeiro_contrato_meses: 4 };
  const aceita = (valor: number, em: string, carteira = false) => ({ total_contract_value: valor, accepted_recorded_at: em, carteira });

  it('acumula desde o início, só dentro do período, e marca o que já encerrou', () => {
    const p = progressoDaMeta(meta, [
      aceita(30000, '2026-12-10T15:00:00Z'),
      aceita(40000, '2027-02-02T23:30:00Z'), // 02/02 20h30 em Brasília: 1º trimestre (até 02/02)
      aceita(90000, '2027-04-15T12:00:00Z', true),
      aceita(999999, '2026-10-01T12:00:00Z'), // antes do período
    ], new Date('2027-05-20T12:00:00Z'));
    expect(p.fim).toBe('2027-11-02');
    expect(p.trimestres.map((t) => [t.ate, t.realizado, t.atingido])).toEqual([
      ['2027-02-02', 70000, true],
      ['2027-05-02', 160000, true],
      ['2027-08-02', 160000, null],
      ['2027-11-02', 160000, null],
    ]);
    expect(p).toMatchObject({ realizadoNoAno: 160000, contratos: 3, contratosDaCarteira: 1 });
    expect(p.ativacao.primeiroContrato).toMatchObject({ ate: '2027-03-02', fechadoEm: '2026-12-10', atingido: true });
    expect(p.ativacao.pipeline).toMatchObject({ ate: '2027-01-31', aberto: false });
  });

  it('trimestre encerrado abaixo do marco fica marcado; a meta só muda antes do período (9.10)', () => {
    const p = progressoDaMeta(meta, [aceita(10000, '2026-12-01T12:00:00Z')], new Date('2027-02-10T12:00:00Z'));
    expect(p.trimestres[0].atingido).toBe(false);
    expect(metaEditavel('2026-11-03', new Date('2026-11-02T12:00:00Z'))).toBe(true);
    expect(metaEditavel('2026-11-03', new Date('2026-11-03T12:00:00Z'))).toBe(false);
  });

  it('provisão: 1/12 de comissões pagas e ajuda de custo dos meses completos', () => {
    expect(mesesCompletos('2026-11-03', new Date('2027-02-02T12:00:00Z'))).toBe(2);
    expect(mesesCompletos('2026-11-03', new Date('2027-02-03T12:00:00Z'))).toBe(3);
    expect(provisaoDeIndenizacao(12000, 3000, 3)).toEqual({ comissoes: 12000, ajudaDeCusto: 9000, base: 21000, provisao: 1750 });
  });

  it('salvarMeta: marcos acumulados, período iniciado não muda, novo entra', async () => {
    const montar = (existente: any) => { sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_metas' ? existente : null) }); };
    const base = { representanteId: '11111111-1111-4111-8111-111111111111', periodoInicio: '2026-11-03', metaAnual: '400000', marcoT1: '50000', marcoT2: '40000' };
    montar(null);
    expect((await salvarMeta(base)).success).toBe(false); // T2 < T1
    montar({ id: 'm1' });
    expect((await salvarMeta({ ...base, periodoInicio: '2020-01-01', marcoT2: '150000' })).success).toBe(false); // já começou
    expect(escritasEm('sales_metas', 'update')).toHaveLength(0);
    montar(null);
    expect((await salvarMeta({ ...base, marcoT2: '150000' })).success).toBe(true);
    expect(escritasEm('sales_metas', 'insert')[0]?.payload).toMatchObject({ meta_anual: 400000, marco_t1: 50000, marco_t2: 150000, marco_t3: null });
  });

  it('o portal do RC não recebe a ajuda de custo', async () => {
    sb = criarSupabaseMock({
      lista: (tabela) => (tabela === 'sales_commission_events' ? [{ amount: 1200 }, { amount: -200 }] : tabela === 'sales_metas' ? [meta] : []),
    });
    const r = await getMinhaMeta();
    expect(r).toMatchObject({ success: true, provisaoSobreComissoes: 83.33 });
    expect(JSON.stringify(r)).not.toMatch(/ajuda/i);
    expect(sb.usou('sales_remuneracao_rc', 'select')).toBe(false);
    const src = readFileSync('components/sales/minha-meta-card.tsx', 'utf8');
    expect(src).not.toMatch(/sales_remuneracao_rc|ajuda_custo_mensal/);
  });
});

// ── Equipe do representante (21.4) ──────────────────────────────────────────

describe('equipe do representante: vários logins para o mesmo RC', () => {
  const rc = { id: 'rc-1', email: 'angelica@exemplo.com', name: 'Angélica', status: 'active' };

  it('o e-mail do RC resolve o RC; o do integrante ativo resolve o RC dele', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela, _c, cadeia) => {
        const email = cadeia.find((e) => e.metodo === 'eq' && e.args[0] === 'email')?.args[1];
        if (tabela === 'sales_representatives') return email === rc.email || cadeia.some((e) => e.metodo === 'eq' && e.args[0] === 'id') ? rc : null;
        if (tabela === 'sales_representative_users') return email === 'sdr@exemplo.com' ? { id: 'u1', name: 'SDR', email, representante_id: 'rc-1' } : null;
        return null;
      },
    });
    expect(await representantePorEmail(sb.client, ' Angelica@Exemplo.com ')).toMatchObject({ rep: { id: 'rc-1' }, integrante: null });
    expect(await representantePorEmail(sb.client, 'sdr@exemplo.com')).toMatchObject({ rep: { id: 'rc-1' }, integrante: { id: 'u1' } });
    expect(sb.usou('sales_representative_users', 'eq', 'status')).toBe(true);
    expect(await representantePorEmail(sb.client, 'ninguem@exemplo.com')).toBeNull();
  });

  it('erro de leitura lança: o gate não vira "não é representante"', async () => {
    sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'sales_representative_users', op: 'select', mensagem: 'timeout' });
    await expect(representantePorEmail(sb.client, 'sdr@exemplo.com')).rejects.toThrow(/equipe/);
  });

  it('o portal, o Copiloto e o magic link usam o mesmo resolvedor', () => {
    for (const arquivo of ['lib/sales/permissions.ts', 'lib/copiloto/auth.ts', 'app/api/auth/magic-link/route.ts']) {
      expect(readFileSync(arquivo, 'utf8')).toContain('representantePorEmail(');
    }
  });

  it('dar acesso: um e-mail opera um representante só', async () => {
    const montar = (ehRc: any, jaEsta: any) => {
      sb = criarSupabaseMock({
        resolver: (tabela, _c, cadeia) => {
          if (tabela === 'sales_representatives') return cadeia.some((e) => e.metodo === 'eq' && e.args[0] === 'id') ? { id: 'rc-1', name: 'Angélica' } : ehRc;
          if (tabela === 'sales_representative_users') return jaEsta;
          return null;
        },
      });
    };
    montar({ id: 'rc-2' }, null);
    expect((await adicionarIntegrante('rc-1', { name: 'SDR', email: 'outro-rc@exemplo.com' })).success).toBe(false);
    montar(null, { id: 'u9', representante_id: 'rc-2', status: 'active' });
    expect((await adicionarIntegrante('rc-1', { name: 'SDR', email: 'sdr@exemplo.com' })).success).toBe(false);
    expect(escritasEm('sales_representative_users', 'insert')).toHaveLength(0);
    montar(null, null);
    expect(await adicionarIntegrante('rc-1', { name: 'SDR', email: ' SDR@Exemplo.com ' })).toEqual({ success: true });
    expect(escritasEm('sales_representative_users', 'insert')[0]?.payload).toMatchObject({ representante_id: 'rc-1', email: 'sdr@exemplo.com', status: 'active' });
  });

  it('o aviso de 60 dias vai também para a equipe ativa', async () => {
    const opp = { id: 'opp-1', representante_id: 'rc-1', opportunity_name: 'Colégio Aurora', last_movement_at: '2026-08-20T10:00:00Z', protection_end_date: '2026-11-18', account: null };
    sb = criarSupabaseMock({
      lista: (tabela) => (tabela === 'sales_opportunities' ? [opp]
        : tabela === 'sales_representatives' ? [rc]
        : tabela === 'sales_representative_users' ? [{ representante_id: 'rc-1', email: 'sdr@exemplo.com' }, { representante_id: 'rc-9', email: 'alheio@exemplo.com' }] : []),
    });
    await enviarAvisosDeProtecao(sb.client);
    expect(enviados[0]?.to).toEqual(['angelica@exemplo.com', 'sdr@exemplo.com']);
  });
});
