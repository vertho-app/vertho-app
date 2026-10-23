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
  cnpjRaiz,
  conferirRegistro,
  precisaDeMovimentacao,
  registrarMovimentacao,
} from '@/lib/sales/registro';
import { classificarCarteira } from '@/lib/sales/aceite-rc';
import { ehRcFicticio, emailDoAviso, enviarAvisosDeProtecao } from '@/lib/sales/alerta-protecao';
import { createOpportunity, moveOpportunityStage, registrarContato } from '@/actions/sales/opportunities';
import { createSalesAccount, updateSalesAccount } from '@/actions/sales/accounts';
import { markProposalSentToClient, registrarAceitePropostaDoRC } from '@/actions/sales/proposals';

const escritasEm = (tabela: string, op: string) => sb.escritas.filter((e) => e.tabela === tabela && e.op === op);
const temElo = (cadeia: Chamada[], metodo: string) => cadeia.some((c) => c.metodo === metodo);
const hoje = () => new Date().toISOString().slice(0, 10);
const daquiA = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  enviados.length = 0;
  envioOk = true;
});

describe('CNPJ básico, INEP e CNPJ alfanumérico', () => {
  it('CNPJ com pontuação, em minúsculas ou alfanumérico vira 14 posições; o resto não serve', () => {
    expect(normalizarCnpj('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(normalizarCnpj('12.ABC.345/01DE-3X')).toBeNull(); // verificador é sempre número
    expect(normalizarCnpj('123')).toBeNull();
    expect(cnpjRaiz('12.ABC.345/01DE-35')).toBe('12ABC345');
  });

  it('matriz e filial são o mesmo cliente; INEP decide quando as duas têm', () => {
    const conta = (o: Record<string, any>) => ({ id: Math.random().toString(), representante_id: 'x', legal_name: null, trade_name: null, cnpj: null, city: null, ...o });
    expect(mesmaInstituicao(conta({ cnpj: '12.345.678/0001-90' }), conta({ cnpj: '12.345.678/0002-71' }))).toBe(true);
    expect(mesmaInstituicao(conta({ cnpj: '12.345.678/0001-90' }), conta({ cnpj: '87.654.321/0001-90' }))).toBe(false);
    expect(mesmaInstituicao(conta({ codigo_inep: '35000001', cnpj: '12.345.678/0001-90' }), conta({ codigo_inep: '35000002', cnpj: '12.345.678/0002-71' }))).toBe(false);
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
};

function montarRegistro(c: Cenario = {}) {
  let conferencias = 0;
  sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'sales_accounts') return { id: 'acc-1', representante_id: 'rc-1', cnpj: '12.345.678/0001-90', codigo_inep: '35000001' };
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
    // o RC não fica sabendo que é a lista de reserva (sondagem de quem a vertho.ai negocia)
    expect((r as any).mensagem).not.toMatch(/reserva/i);
  });

  it('cliente com outro RC e proteção em vigor: fila, sem dizer quem é o outro', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [oppProtegida] });
    const r = await createOpportunity(input);
    expect(r).toMatchObject({ success: true, aceito: false });
    expect(escritasEm('sales_opportunities', 'insert')[0]?.payload.attribution_status).toBe('aguardando');
    expect((r as any).mensagem).toMatch(/outro representante/);
  });

  it('cliente que é cliente ativo de outro RC: fila', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'active_client' }] });
    expect(await createOpportunity(input)).toMatchObject({ success: true, aceito: false });
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
    expect(r).toMatchObject({ success: true, aceito: false });
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

  it('a conferência pura: oportunidade aguardando também segura o cliente', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [{ ...oppProtegida, attribution_status: 'aguardando', protection_end_date: null }] });
    const c = await conferirRegistro(sb.client, { representanteId: 'rc-1', cnpj: '12.345.678/0001-90' });
    expect(c.livre).toBe(false);
  });
});

// ── Contas (bloqueio) ───────────────────────────────────────────────────────

describe('conta: o cliente com outro RC não entra', () => {
  it('CNPJ de cliente protegido de outro RC: a conta não é criada', async () => {
    montarRegistro({ outrasContas: [{ id: 'acc-9', status: 'prospect' }], oppsDasOutras: [oppProtegida] });
    const r = await createSalesAccount({ legal_name: 'Colégio X', cnpj: '12.345.678/0003-52' });
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
    const r = await createSalesAccount({ legal_name: 'Colégio X', cnpj: '12345678000190', codigo_inep: '35000001' });
    expect(r.success).toBe(true);
    expect(escritasEm('sales_accounts', 'insert')[0]?.payload).toMatchObject({ cnpj: '12.345.678/0001-90', codigo_inep: '35000001' });
  });

  it('trocar o CNPJ de conta com registro: só pela vertho.ai', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', cnpj: '12.345.678/0001-90', codigo_inep: null } : null),
      contagem: (tabela) => (tabela === 'sales_opportunities' ? 1 : 0),
    });
    const r = await updateSalesAccount('acc-1', { cnpj: '87.654.321/0001-90' });
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/vertho\.ai/);
    expect(escritasEm('sales_accounts', 'update')).toHaveLength(0);
  });

  it('completar o CNPJ que estava vazio continua livre', async () => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_accounts' ? { id: 'acc-1', representante_id: 'rc-1', cnpj: null, codigo_inep: null } : null),
      contagem: () => 1,
    });
    expect((await updateSalesAccount('acc-1', { cnpj: '12.345.678/0001-90' })).success).toBe(true);
    expect(escritasEm('sales_accounts', 'update')[0]?.payload.cnpj).toBe('12.345.678/0001-90');
  });
});

// ── Movimentação (7.5 e 7.6) ────────────────────────────────────────────────

function montarOpp(opp: Record<string, any>, outras: Cenario = {}) {
  sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'sales_opportunities'
      ? { id: 'opp-1', representante_id: 'rc-1', account_id: 'acc-1', status: 'open', attribution_status: 'validada', stage: 'contato_iniciado', account: { cnpj: '12.345.678/0001-90', codigo_inep: null }, ...opp }
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
