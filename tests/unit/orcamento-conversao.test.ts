/**
 * Conversão de orçamento em proposta + ciclo de vida sem RC (mig 254).
 *
 * Os dois testes que justificam este arquivo existir:
 *
 * 1. O MAPEAMENTO DE VIGÊNCIA. O orçamento parcela por entrega (`ciclos × 2`);
 *    a proposta tinha CHECK IN (12,24,36). O mapeamento ingênuo — `monthly_value`
 *    = parcela do orçamento, vigência 12 — multiplica o contrato por 6, e é sobre
 *    `total_contract_value` que o aceite materializa comissão (9% + 12%). Um
 *    teste que só confere "criou a proposta" não pega isso: o número errado é um
 *    número válido.
 *
 * 2. A PROIBIÇÃO DE TOCAR EM PROPOSTA COM RC. Sem ela, `proposals-admin.ts` vira
 *    um atalho para um admin aprovar/enviar/aceitar a proposta DE UM RC por cima
 *    do fluxo que existe justamente para impedir isso ("RC nunca aprova a
 *    própria"). O gate não é `sales_channel.manage` — é `representante_id IS NULL`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

const ADMIN = 'rodrigo@vertho.ai';

let sb: SupabaseMock = criarSupabaseMock();
const gate = vi.fn(async (..._args: any[]) => sb.client);
const emailSessao = vi.fn(async () => ADMIN as string | null);
const auditoria = vi.fn(async (..._args: any[]) => {});

vi.mock('@/lib/admin-supabase', () => ({
  requirePlataformaSupabase: (...args: any[]) => gate(...(args as [])),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: () => emailSessao(),
}));
vi.mock('@/lib/audit', () => ({
  logAdminAction: (...args: any[]) => auditoria(...(args as [])),
}));

import {
  aprovarPropostaAdmin,
  criarPropostaDeOrcamento,
  gerarLinkPropostaAdmin,
  marcarPropostaAceitaAdmin,
  marcarPropostaEnviadaAdmin,
  marcarPropostaPerdidaAdmin,
} from '@/actions/sales/proposals-admin';
import { escopoPropostaDoCenario } from '@/lib/orcamento/cenario';

/** Orçamento salvo: jornada de 7 semanas, 1 ciclo → 2 parcelas. */
const ORCAMENTO = {
  id: 'orc-1',
  nome: 'Rede X · 100 pessoas',
  cliente: 'Rede X de Ensino',
  proposta_id: null as string | null,
  entradas: {
    nClusters: 1, nPerfis: 3, nColabs: 100, matrizNovas: 1, ciclosPorAno: 1,
    metodo: 'votacao', tipoComissao: 'rc', preset: 'atual', jornada: 'jornada',
    conteudoColab: { video: 12, podcast: 12, texto: 12, case: 12 },
    nVideosExtraidos: 0, auditarExtracao: true, comAvatar: true,
    pricing: { cotacao: 5.12, descontoPct: 0, precoPessoaCiclo: 300 },
  },
  resultado: {
    valorTabela: 32000, valorFinal: 32000, desconto: 0, parcela: 16000, parcelas: 2,
    margemAbs: 9000, margemPct: 28, descontoMaxPct: 11, acimaDoPiso: false,
    custoTotalBrl: 23000, custoOperacionalBrl: 18000, custoIABrl: 4200,
    investimentoPorPessoaBrl: 320, custoPorPessoaBrl: 230, mesesPrograma: 2, ciclos: 1,
    pessoas: 100, unidades: 1, cargos: 3, jornada: 'jornada',
    piorSaldo: { mes: 1, saldo: -7000 },
  },
};

/** Proposta sem RC, como a conversão cria. */
const PROPOSTA_SEM_RC = {
  id: 'prop-1', proposal_number: 'PROP-2026-0001', representante_id: null,
  status: 'draft', account_id: null, public_token: null,
  contract_duration_months: 2, total_contract_value: 32000,
};

let cenario: { orcamento: any; proposta: any; conta: any };

function mock() {
  return criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'orcamento_cenarios') return cenario.orcamento;
      if (tabela === 'sales_proposals') return cenario.proposta;
      if (tabela === 'sales_accounts') return cenario.conta;
      return null;
    },
  });
}

const escritasEm = (tabela: string, op?: string) =>
  sb.escritas.filter((e) => e.tabela === tabela && (!op || e.op === op));
const insertDeProposta = () => escritasEm('sales_proposals', 'insert')[0]?.payload;
const acoesAuditadas = () => auditoria.mock.calls.map((c: any[]) => c[0].acao);

beforeEach(() => {
  cenario = {
    orcamento: JSON.parse(JSON.stringify(ORCAMENTO)),
    proposta: { ...PROPOSTA_SEM_RC },
    conta: null,
  };
  sb = mock();
  // O número da proposta vem de uma função SQL (mig 159).
  sb.client.rpc = vi.fn(async () => ({ data: 'PROP-2026-0001', error: null }));
  gate.mockClear();
  auditoria.mockClear();
  emailSessao.mockClear();
  emailSessao.mockImplementation(async () => ADMIN);
});

const ESCOPO = 'Programa Jornada de 7 semanas · 1 ciclo\n100 pessoas';

describe('criarPropostaDeOrcamento — o mapeamento de dinheiro', () => {
  it('vigência = parcelas do projeto, e mensal = valor de tabela ÷ parcelas', async () => {
    const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(r.success).toBe(true);

    const gravado = insertDeProposta();
    // 2 parcelas (1 ciclo × 2) — NÃO 12. Se alguém "corrigir" para 12 meses,
    // o total do contrato vira 6× o valor do projeto e a comissão junto.
    expect(gravado.contract_duration_months).toBe(2);
    expect(gravado.monthly_value).toBe(16000);
    expect(gravado.contract_value_gross).toBe(32000);
    expect(gravado.total_contract_value).toBe(32000);
  });

  it('com desconto, o total do contrato BATE com o valor final do orçamento', async () => {
    cenario.orcamento.resultado = {
      ...ORCAMENTO.resultado,
      valorTabela: 100000, valorFinal: 90000, desconto: 10000, parcelas: 4, parcela: 22500, ciclos: 2,
    };
    cenario.orcamento.entradas.pricing.descontoPct = 10;

    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });

    const gravado = insertDeProposta();
    expect(gravado.contract_duration_months).toBe(4);
    expect(gravado.monthly_value).toBe(25000);        // tabela ÷ parcelas, não a parcela líquida
    expect(gravado.discount_requested).toBe(10);
    expect(gravado.contract_value_gross).toBe(100000);
    expect(gravado.total_contract_value).toBe(90000); // = valorFinal do orçamento
  });

  it('o desconto vem das ENTRADAS gravadas, não derivado de valorFinal/valorTabela', async () => {
    cenario.orcamento.entradas.pricing.descontoPct = 25;
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    // > 15% liga margin_alert — o histórico do desconto sobrevive na proposta.
    expect(insertDeProposta()).toMatchObject({ discount_requested: 25, margin_alert: true });
  });

  it('os números vêm do BANCO, não do que o cliente mandou', async () => {
    const r: any = await criarPropostaDeOrcamento({
      orcamentoId: 'orc-1',
      includedScope: ESCOPO,
      // tentativa de inflar o contrato por parâmetro
      ...({ monthly_value: 999999, total_contract_value: 999999 } as any),
    });
    expect(r.success).toBe(true);
    expect(insertDeProposta().monthly_value).toBe(16000);
    expect(insertDeProposta().total_contract_value).toBe(32000);
  });
});

describe('criarPropostaDeOrcamento — autoria e vínculo', () => {
  it('nasce sem RC, em rascunho, com o autor e o nome do cliente do orçamento', async () => {
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(insertDeProposta()).toMatchObject({
      representante_id: null,
      opportunity_id: null,
      status: 'draft',
      created_by_email: ADMIN,
      cliente_nome: 'Rede X de Ensino',
      number_of_users: 100,
      number_of_roles_mapped: 3,
    });
  });

  it('cliente em texto livre vira cliente_nome — sem ele o documento diria "Cliente"', async () => {
    cenario.orcamento.cliente = null;
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(insertDeProposta().cliente_nome).toBeNull();
  });

  it('vincula o orçamento à proposta criada', async () => {
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    const vinculo = escritasEm('orcamento_cenarios', 'update')[0]?.payload;
    expect(vinculo).toBeTruthy();
    expect(vinculo.proposta_id).toBeTruthy();
  });

  it('gate sales_channel.manage; audita a criação', async () => {
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(gate).toHaveBeenCalledWith('sales_channel.manage');
    expect(acoesAuditadas()).toContain('proposta_deal_desk.criar');
  });

  it('commercial_notes fica NULO — o campo aparece no documento que o cliente lê', async () => {
    // buildProposalDocument expõe commercial_notes como `notasComerciais`, e o
    // header daquele arquivo diz que ele exclui "tudo que é interno". Gravar ali
    // a proveniência ("gerada a partir do orçamento X") vazaria o deal desk para
    // o cliente. A proveniência vive em created_by_email + proposta_id + auditoria.
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    const gravado = insertDeProposta();
    expect(gravado.commercial_notes).toBeNull();
    expect(JSON.stringify(gravado)).not.toMatch(/deal desk|orçamento "Rede/i);
  });

  it('comissão estimada vai ZERADA — sem RC não há quem receba', async () => {
    // `calculateProposalFinancials` calcula 9% + 12% sempre. Deixar isso gravado
    // faria a tela do admin mostrar ~R$ 6,7 mil de comissão numa proposta que não
    // paga nenhuma — e número de comissão na tela é número em que alguém age.
    await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    const gravado = insertDeProposta();
    expect(gravado.estimated_acquisition_commission).toBe(0);
    expect(gravado.estimated_recurring_commission).toBe(0);
    expect(gravado.estimated_total_commission).toBe(0);
    // o que interessa do financeiro segue correto
    expect(gravado.total_contract_value).toBe(32000);
    expect(gravado.contract_value_gross).toBe(32000);
  });
});

describe('criarPropostaDeOrcamento — o que recusa', () => {
  it('escopo vazio não cria proposta: é o texto que o CLIENTE lê', async () => {
    for (const includedScope of ['', '   ', undefined as any]) {
      sb = mock();
      const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/escopo/i);
      expect(escritasEm('sales_proposals')).toHaveLength(0);
      expect(auditoria).not.toHaveBeenCalled();
    }
  });

  it('orçamento já convertido não vira duas propostas', async () => {
    cenario.orcamento.proposta_id = 'prop-antiga';
    const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/já foi convertido/i);
    expect(escritasEm('sales_proposals')).toHaveLength(0);
  });

  it('orçamento inexistente não cria proposta', async () => {
    cenario.orcamento = null;
    const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-fantasma', includedScope: ESCOPO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não encontrado/i);
    expect(escritasEm('sales_proposals')).toHaveLength(0);
  });

  it('tipo de cliente e pacote inválidos são recusados antes de escrever (há CHECK no banco)', async () => {
    const r1: any = await criarPropostaDeOrcamento({
      orcamentoId: 'orc-1', includedScope: ESCOPO, customerType: 'ong',
    });
    expect(r1.success).toBe(false);
    expect(escritasEm('sales_proposals')).toHaveLength(0);

    sb = mock();
    const r2: any = await criarPropostaDeOrcamento({
      orcamentoId: 'orc-1', includedScope: ESCOPO, productPackage: 'pacote_inventado',
    });
    expect(r2.success).toBe(false);
    expect(escritasEm('sales_proposals')).toHaveLength(0);
  });

  it('valores aceitos passam e chegam à linha', async () => {
    const r: any = await criarPropostaDeOrcamento({
      orcamentoId: 'orc-1', includedScope: ESCOPO,
      customerType: 'rede_ensino', productPackage: 'custom',
      paymentTerms: '2 parcelas de R$ 16.000,00',
    });
    expect(r.success).toBe(true);
    expect(insertDeProposta()).toMatchObject({
      customer_type: 'rede_ensino',
      product_package: 'custom',
      payment_terms: '2 parcelas de R$ 16.000,00',
    });
  });

  it('falha ao gerar o número não cria proposta sem número (a coluna é NOT NULL UNIQUE)', async () => {
    sb.client.rpc = vi.fn(async () => ({ data: null, error: { message: 'sequence broken' } }));
    const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(r.success).toBe(false);
    expect(escritasEm('sales_proposals')).toHaveLength(0);
  });

  it('erro do banco vira {success:false} com a mensagem', async () => {
    sb.falharEm({ tabela: 'sales_proposals', op: 'insert', mensagem: 'duplicate key' });
    const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/duplicate key/);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('vínculo que falha é reportado COM o número — senão o admin não sabe o que procurar', async () => {
    sb.falharEm({ tabela: 'orcamento_cenarios', op: 'update', mensagem: 'timeout' });
    const r: any = await criarPropostaDeOrcamento({ orcamentoId: 'orc-1', includedScope: ESCOPO });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/PROP-2026-0001/);
    expect(r.error).toMatch(/não converta de novo/i);
    // a proposta foi criada de fato — o aviso não pode levar a criar outra
    expect(escritasEm('sales_proposals', 'insert')).toHaveLength(1);
  });
});

describe('ciclo de vida — SÓ proposta sem RC', () => {
  const comRc = { ...PROPOSTA_SEM_RC, representante_id: 'rc-9' };

  it('nenhuma action opera proposta que tem RC dono (atalho sobre o fluxo do representante)', async () => {
    cenario.proposta = comRc;
    const chamadas: Array<Promise<any>> = [
      aprovarPropostaAdmin('prop-1'),
      gerarLinkPropostaAdmin('prop-1'),
      marcarPropostaEnviadaAdmin('prop-1'),
      marcarPropostaAceitaAdmin('prop-1'),
      marcarPropostaPerdidaAdmin('prop-1'),
    ];
    const resultados = await Promise.all(chamadas);
    for (const r of resultados) {
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Portal do Representante/);
    }
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
  });

  it('id vazio é recusado sem ir ao banco', async () => {
    const r: any = await aprovarPropostaAdmin('');
    expect(r.success).toBe(false);
    expect(sb.chamadas).toHaveLength(0);
  });
});

describe('ciclo de vida — transições', () => {
  it('admin aprova direto do rascunho (sem RC não há submissão)', async () => {
    const r: any = await aprovarPropostaAdmin('prop-1');
    expect(r.success).toBe(true);
    const gravado = escritasEm('sales_proposals', 'update')[0].payload;
    expect(gravado.status).toBe('approved');
    expect(gravado.approved_by).toBe(ADMIN);
    expect(acoesAuditadas()).toContain('proposta_deal_desk.aprovar');
  });

  it('aprovar de novo não vira sucesso silencioso (o .eq(status) não casaria linha nenhuma)', async () => {
    for (const status of ['approved', 'sent_to_client', 'accepted', 'lost']) {
      sb = mock();
      cenario.proposta = { ...PROPOSTA_SEM_RC, status };
      const r: any = await aprovarPropostaAdmin('prop-1');
      expect(r.success, `status ${status}`).toBe(false);
      expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
      // Aprovar no log uma proposta que não mudou é pior do que não auditar.
      expect(auditoria).not.toHaveBeenCalled();
    }
  });

  it('aceita submitted_for_approval também (a máquina de estados não é só draft)', async () => {
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'submitted_for_approval' };
    const r: any = await aprovarPropostaAdmin('prop-1');
    expect(r.success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0].payload.status).toBe('approved');
  });

  it('link público só depois de aprovada', async () => {
    const r: any = await gerarLinkPropostaAdmin('prop-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/aprovada/);

    sb = mock();
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'approved' };
    const r2: any = await gerarLinkPropostaAdmin('prop-1');
    expect(r2.success).toBe(true);
    expect(typeof r2.data).toBe('string');
    expect(r2.data.length).toBeGreaterThan(20);
    expect(escritasEm('sales_proposals', 'update')[0].payload.public_token).toBe(r2.data);
  });

  it('token existente é reaproveitado (idempotente)', async () => {
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'approved', public_token: 'token-antigo' };
    const r: any = await gerarLinkPropostaAdmin('prop-1');
    expect(r.data).toBe('token-antigo');
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
  });

  it('enviada ao cliente só a partir de aprovada', async () => {
    const r: any = await marcarPropostaEnviadaAdmin('prop-1');
    expect(r.success).toBe(false);

    sb = mock();
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'approved' };
    const r2: any = await marcarPropostaEnviadaAdmin('prop-1');
    expect(r2.success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0].payload.status).toBe('sent_to_client');
  });

  it('aceite NÃO materializa comissão — sem RC não há quem receba', async () => {
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'sent_to_client' };
    const r: any = await marcarPropostaAceitaAdmin('prop-1');
    expect(r.success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0].payload.status).toBe('accepted');
    expect(escritasEm('sales_commission_events')).toHaveLength(0);
    expect(auditoria.mock.calls[0][0].detalhes.comissao).toMatch(/nenhuma/i);
  });

  it('aceite com conta no CRM ativa a conta e carimba o contrato', async () => {
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'sent_to_client', account_id: 'acc-1' };
    cenario.conta = { contract_start_date: null };
    const r: any = await marcarPropostaAceitaAdmin('prop-1');
    expect(r.success).toBe(true);
    const conta = escritasEm('sales_accounts', 'update')[0].payload;
    expect(conta.status).toBe('active_client');
    expect(conta.contract_start_date).toBeTruthy();
    expect(conta.renewal_date).toBeTruthy();
  });

  it('conta já contratada NÃO tem as datas sobrescritas (não há origin para saber se é expansão)', async () => {
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'sent_to_client', account_id: 'acc-1' };
    cenario.conta = { contract_start_date: '2025-01-01' };
    await marcarPropostaAceitaAdmin('prop-1');
    const conta = escritasEm('sales_accounts', 'update')[0].payload;
    expect(conta.status).toBe('active_client');
    expect(conta.contract_start_date).toBeUndefined();
    expect(conta.renewal_date).toBeUndefined();
  });

  it('perdida a partir de rascunho, aprovada ou enviada — e nunca de aceita', async () => {
    const r: any = await marcarPropostaPerdidaAdmin('prop-1', 'cliente optou por outro');
    expect(r.success).toBe(true);
    expect(escritasEm('sales_proposals', 'update')[0].payload).toMatchObject({
      status: 'lost', rejection_reason: 'cliente optou por outro',
    });

    sb = mock();
    cenario.proposta = { ...PROPOSTA_SEM_RC, status: 'accepted' };
    const r2: any = await marcarPropostaPerdidaAdmin('prop-1');
    expect(r2.success).toBe(false);
    expect(escritasEm('sales_proposals', 'update')).toHaveLength(0);
  });

  it('sessão expirada não muda estado nenhum', async () => {
    emailSessao.mockImplementation(async () => null);
    const r: any = await aprovarPropostaAdmin('prop-1');
    expect(r.success).toBe(false);
    expect(escritasEm('sales_proposals')).toHaveLength(0);
  });

  it('erro do banco vira {success:false}', async () => {
    sb.falharEm({ tabela: 'sales_proposals', op: 'update', mensagem: 'deadlock' });
    const r: any = await aprovarPropostaAdmin('prop-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/deadlock/);
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe('escopoPropostaDoCenario — o rascunho que o admin revisa', () => {
  const entradas: any = ORCAMENTO.entradas;
  const resumo: any = ORCAMENTO.resultado;
  const jornada = { rotulo: 'Jornada', semanas: 7 };

  it('uma linha por item (buildProposalDocument quebra por \\n)', () => {
    const linhas = escopoPropostaDoCenario(entradas, resumo, jornada).split('\n');
    expect(linhas.length).toBe(6);
    expect(linhas[0]).toMatch(/Jornada de 7 semanas · 1 ciclo/);
    expect(linhas[1]).toMatch(/100 pessoas · 1 unidade · 3 cargos mapeados por votação/);
    expect(linhas[3]).toMatch(/12 vídeos, 12 podcasts, 12 textos e 12 cases/);
  });

  it('separa matrizes novas de adaptadas pela régua (cargos = novas + adaptadas)', () => {
    const linhas = escopoPropostaDoCenario(entradas, resumo, jornada).split('\n');
    expect(linhas[2]).toMatch(/1 nova, 2 adaptadas/);
  });

  it('workshop e plural aparecem certos', () => {
    const texto = escopoPropostaDoCenario(
      { ...entradas, metodo: 'workshop' },
      { ...resumo, cargos: 1, unidades: 4, ciclos: 3 },
      { rotulo: 'Regular DUO', semanas: 14 },
    );
    expect(texto).toMatch(/Regular DUO de 14 semanas · 3 ciclos/);
    expect(texto).toMatch(/4 unidades · 1 cargo mapeado por workshop/);
  });

  it('extração de vídeo entra no escopo só quando existe', () => {
    expect(escopoPropostaDoCenario(entradas, resumo, jornada)).not.toMatch(/Extração/);
    const comExtracao = escopoPropostaDoCenario(
      { ...entradas, nVideosExtraidos: 3 }, resumo, jornada,
    );
    expect(comExtracao).toMatch(/Extração de 3 vídeos institucionais/);
  });

  it('singular não sai errado — este texto vai no documento do cliente', () => {
    // `institucional + "s"` daria "institucionalis"; `1 vídeos` daria na mesma
    // classe de erro. Os dois são texto publicado, não detalhe cosmético.
    const singular = escopoPropostaDoCenario(
      {
        ...entradas,
        nVideosExtraidos: 1,
        conteudoColab: { video: 1, podcast: 1, texto: 1, case: 1 },
      },
      { ...resumo, pessoas: 1, unidades: 1, cargos: 1, ciclos: 1 },
      { rotulo: 'Piloto', semanas: 1 },
    );
    expect(singular).toMatch(/1 semana · 1 ciclo/);
    expect(singular).toMatch(/1 pessoa · 1 unidade · 1 cargo mapeado por/);
    expect(singular).toMatch(/1 vídeo, 1 podcast, 1 texto e 1 case por pessoa\/ciclo/);
    expect(singular).toMatch(/Extração de 1 vídeo institucional/);
    expect(singular).not.toMatch(/institucionalis|1 vídeos|1 pessoas|1 semanas/);
  });
});

describe('a migration 254', () => {
  it('afrouxa o que precisa e documenta o que custa', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(join(process.cwd(), 'migrations', '254-proposta-do-deal-desk.sql'), 'utf8');

    expect(sql).toContain('ALTER COLUMN representante_id DROP NOT NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS cliente_nome');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS created_by_email');
    expect(sql).toMatch(/orcamento_cenarios[\s\S]*ADD COLUMN IF NOT EXISTS proposta_id/);
    expect(sql).toContain('ON DELETE SET NULL');
    // O CHECK novo é mais largo que o antigo, senão linhas existentes violariam.
    expect(sql).toMatch(/contract_duration_months > 0 AND contract_duration_months <= 360/);
    // Drop pelo nome REAL, nunca hardcoded (padrão das migs 166/168).
    expect(sql).toContain('pg_constraint');
    expect(sql).not.toMatch(/DROP CONSTRAINT sales_proposals_contract_duration_months_check/);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
    expect(sql).toMatch(/Rollback/);
    // As três consequências aceitas precisam estar escritas onde alguém as lê.
    expect(sql).toMatch(/QUATRO OLHOS/);
    expect(sql).toMatch(/SEM COMISSÃO/);
    expect(sql).toMatch(/RENOVAÇÃO/);
  });
});
