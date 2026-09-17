'use server';

// Ciclo de vida de proposta criada pelo DEAL DESK (mig 254) — sem RC.
//
// POR QUE ESTE ARQUIVO EXISTE
// Toda action de ciclo de vida de `actions/sales/proposals.ts` passa por
// `requireRepresentativeAction` + `assertRepresentativeOwnership`, e esta última
// LANÇA quando `representante_id` é nulo. Uma proposta sem RC nascia `draft` e
// morria aí: não podia ser submetida, aprovada, enviada ao cliente nem receber
// link público. Decisão do dono em 14/09/2026: o admin ganha o ciclo completo.
//
// 🔒 A PROPRIEDADE QUE NÃO PODE SER PERDIDA
// Cada action daqui exige `representante_id IS NULL`. Sem isso, este arquivo
// viraria um atalho para um admin mover a proposta DE UM RC — aprovar sem
// submissão, marcar como enviada, aceitar — pulando exatamente o controle de
// quatro olhos que `proposals.ts` foi escrito para garantir ("RC cria e submete;
// NUNCA aprova a própria proposta"). Proposta com RC continua sendo operada só
// pelo fluxo do Portal do Representante.
//
// ⚠️ O QUE ESTE CAMINHO NÃO FAZ, DE PROPÓSITO
//   · NÃO materializa eventos de comissão. `sales_commission_events.
//     representante_id` é NOT NULL (mig 159) e não há RC — não existe quem
//     receba. Inventar um RC fictício para não pular este passo distorceria o
//     ledger financeiro.
//   · NÃO tem quatro olhos: quem cria aprova. `created_by_email` + `approved_by`
//     ficam na linha para que isso seja auditável depois do fato.
//
// Todo export é endpoint HTTP: o gate é aplicado SEMPRE, em cada um, e a
// identidade vem 100% do cookie SSR — nunca de parâmetro do cliente.
// `requirePlataformaSupabase('sales_channel.manage')` equivale a
// `requireCommercialAdminAction()` + client, e delega o service-role (por isso
// este arquivo não entra na allowlist de `createSupabaseAdmin`).

import { requirePlataformaSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import type { ActionResult } from '@/lib/auth/protected-action';
import { logAdminAction } from '@/lib/audit';
import { calculateProposalFinancials } from '@/lib/sales/commissions';
import { CUSTOMER_TYPE_LABELS, PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';
import { novoTokenProposta } from '@/lib/sales/proposal-token';
import { normalizarResumo } from '@/lib/orcamento/cenario';
import { validateWhatsApp } from '@/lib/phone';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Estados em que o documento já pode ir ao cliente (igual ao fluxo do RC). */
const COMPARTILHAVEIS = ['approved', 'sent_to_client', 'accepted'];

export type PropostaCriada = {
  id: string;
  numero: string;
  valorMensal: number;
  vigenciaMeses: number;
  totalContrato: number;
};

export type EntradaConversao = {
  orcamentoId: string;
  /** Escopo REVISTO por gente — vira os bullets do documento público. */
  includedScope: string;
  paymentTerms?: string | null;
  customerType?: string | null;
  productPackage?: string | null;
  accountId?: string | null;
  /** Contato que assina o documento (mig 255) — os três são obrigatórios. */
  contatoNome: string;
  contatoEmail: string;
  contatoWhatsapp: string;
};

export type EntradaAtualizacao = {
  orcamentoId: string;
  /** Escopo REVISTO por gente, como na conversão. */
  includedScope: string;
  paymentTerms?: string | null;
};

/**
 * Estados em que a proposta já fechou: mudar valor ou escopo reescreveria o que
 * o cliente aceitou, ou ressuscitaria uma proposta perdida/substituída.
 */
const FECHADAS: Record<string, string> = {
  accepted: 'aceita',
  lost: 'perdida',
  superseded: 'substituída por outra versão',
};

function numeroPositivoOu(v: unknown, limite: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(limite, Math.max(0, n));
}

/**
 * Os números da proposta a partir do orçamento GRAVADO. Fonte única de criar e
 * de atualizar: duas cópias desta conta divergiriam em silêncio, e é sobre
 * `total_contract_value` que o aceite age.
 */
function numerosDoOrcamento(resultado: unknown, entradasBrutas: unknown) {
  const resumo = normalizarResumo(resultado);
  if (!resumo || resumo.valorFinal <= 0) {
    return { erro: 'O orçamento salvo não tem um valor de projeto válido.' } as const;
  }

  // O desconto vem das ENTRADAS gravadas (a % que a tela aplicou), não derivado
  // de valorFinal/valorTabela — assim `margin_alert` e o histórico do desconto
  // sobrevivem na proposta.
  const entradas = entradasBrutas && typeof entradasBrutas === 'object' ? (entradasBrutas as any) : {};
  const descontoPct = numeroPositivoOu(entradas?.pricing?.descontoPct, 100) ?? 0;

  const vigencia = resumo.parcelas;
  const monthly = round2(resumo.valorTabela / vigencia);
  const fin = calculateProposalFinancials({
    monthly_value: monthly,
    contract_duration_months: vigencia,
    discount_requested: descontoPct,
  });
  // Sem RC não existe comissão a pagar. Deixar a estimativa preenchida faria a
  // tela do admin exibir um valor que nunca sai do caixa — e número de comissão
  // na tela é número em que alguém age. `total/gross/desconto` seguem corretos.
  const finSemComissao = {
    ...fin,
    estimated_acquisition_commission: 0,
    estimated_recurring_commission: 0,
    estimated_total_commission: 0,
  };
  return { resumo, descontoPct, vigencia, monthly, fin, finSemComissao } as const;
}

/**
 * Lê a proposta e garante que ela é do deal desk (sem RC).
 *
 * É aqui que mora a propriedade de segurança do arquivo: uma proposta com RC
 * nunca sai deste helper, então nenhuma action abaixo consegue tocá-la.
 */
async function exigirPropostaDoDealDesk(sb: any, proposalId: string) {
  if (typeof proposalId !== 'string' || !proposalId) return { erro: 'Id obrigatório' };
  const { data, error } = await sb
    .from('sales_proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: 'Proposta não encontrada' };
  if (data.representante_id) {
    return { erro: 'Esta proposta tem um RC dono — ela segue pelo Portal do Representante.' };
  }
  return { proposta: data };
}

async function auditar(email: string, acao: string, alvo: string, detalhes?: Record<string, any>) {
  await logAdminAction({ adminEmail: email, acao, alvo, detalhes });
}

/**
 * Converte um orçamento SALVO em proposta `draft`.
 *
 * Os números vêm da LINHA DO BANCO, nunca do cliente: quem chama manda só o id e
 * o texto revisado. O valor do projeto foi congelado no save (mig 253), então a
 * proposta herda a decisão do dia mesmo que a régua tenha mudado desde então.
 *
 * MAPEAMENTO DE VIGÊNCIA (decisão de 14/09/2026: preservar as parcelas)
 * O orçamento parcela por entrega — `parcelas = ciclos × 2`. Então:
 *   · `contract_duration_months` = parcelas (2 numa jornada de 7 semanas)
 *   · `monthly_value`            = valorTabela ÷ parcelas
 *   · `discount_requested`       = o desconto que a tela aplicou
 * Com isso `calculateProposalFinancials` devolve gross = valorTabela e
 * total = valorFinal do orçamento (a menos do arredondamento da parcela), e a
 * comissão incide sobre o valor certo. Passar `monthly_value = parcela` com
 * vigência 12 multiplicaria o contrato por 6.
 */
export async function criarPropostaDeOrcamento(
  input: EntradaConversao,
): Promise<ActionResult<PropostaCriada>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const bruto = (input ?? {}) as Record<string, unknown>;
  const orcamentoId = typeof bruto.orcamentoId === 'string' ? bruto.orcamentoId.trim() : '';
  if (!orcamentoId) return { success: false, error: 'Informe o orçamento salvo.' };

  const escopo = typeof bruto.includedScope === 'string' ? bruto.includedScope.trim() : '';
  if (!escopo) {
    return { success: false, error: 'Revise o escopo: é o texto que o cliente lê no documento da proposta.' };
  }

  const customerType = typeof bruto.customerType === 'string' && bruto.customerType
    ? bruto.customerType
    : null;
  if (customerType && !(customerType in CUSTOMER_TYPE_LABELS)) {
    return { success: false, error: 'Tipo de cliente inválido' };
  }
  const productPackage = typeof bruto.productPackage === 'string' && bruto.productPackage
    ? bruto.productPackage
    : null;
  if (productPackage && !(productPackage in PRODUCT_PACKAGE_LABELS)) {
    return { success: false, error: 'Pacote inválido' };
  }
  const accountId = typeof bruto.accountId === 'string' && bruto.accountId ? bruto.accountId : null;
  const paymentTerms = typeof bruto.paymentTerms === 'string' ? bruto.paymentTerms.trim() : '';

  // ── Contato do documento (mig 255) ────────────────────────────────────────
  // Obrigatório: a proposta do deal desk não tem RC, e sem estes três campos o
  // documento que vai ao cliente não diz com quem falar. Era exatamente o que
  // acontecia com a PROP-2026-0008 — "Representante Vertho", sem e-mail nem
  // telefone, no rodapé de um contrato de sete dígitos.
  const contatoNome = typeof bruto.contatoNome === 'string' ? bruto.contatoNome.trim() : '';
  const contatoEmail = typeof bruto.contatoEmail === 'string' ? bruto.contatoEmail.trim().toLowerCase() : '';
  const contatoWhats = typeof bruto.contatoWhatsapp === 'string' ? bruto.contatoWhatsapp.trim() : '';
  if (!contatoNome) return { success: false, error: 'Informe o nome de quem assina a proposta pela Vertho.' };
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(contatoEmail)) {
    return { success: false, error: 'Informe um e-mail de contato válido para o cliente responder.' };
  }
  const fone = validateWhatsApp(contatoWhats);
  if (!('e164' in fone)) {
    return { success: false, error: `WhatsApp do contato: ${fone.error}` };
  }

  // ── O orçamento é a fonte dos números ──
  const { data: orc, error: erroOrc } = await sb
    .from('orcamento_cenarios')
    .select('id, nome, cliente, entradas, resultado, proposta_id')
    .eq('id', orcamentoId)
    .maybeSingle();
  if (erroOrc) return { success: false, error: erroOrc.message };
  if (!orc) return { success: false, error: 'Orçamento não encontrado' };
  if (orc.proposta_id) {
    return { success: false, error: 'Este orçamento já foi convertido em proposta.' };
  }

  const numeros = numerosDoOrcamento(orc.resultado, orc.entradas);
  if ('erro' in numeros) return { success: false, error: numeros.erro };
  const { resumo, descontoPct, vigencia, monthly, fin, finSemComissao } = numeros;

  const { data: numero, error: erroNumero } = await sb.rpc('sales_next_proposal_number');
  if (erroNumero) return { success: false, error: `Falha ao gerar número: ${erroNumero.message}` };
  if (!numero) return { success: false, error: 'Falha ao gerar o número da proposta.' };

  const { data: criada, error: erroInsert } = await sb
    .from('sales_proposals')
    .insert({
      representante_id: null,
      opportunity_id: null,
      account_id: accountId,
      cliente_nome: orc.cliente ?? null,
      proposal_number: numero as string,
      status: 'draft',
      created_by_email: email,
      customer_type: customerType,
      number_of_users: resumo.pessoas > 0 ? resumo.pessoas : null,
      number_of_roles_mapped: resumo.cargos > 0 ? resumo.cargos : null,
      product_package: productPackage,
      contract_duration_months: vigencia,
      discount_requested: descontoPct,
      payment_terms: paymentTerms || null,
      included_scope: escopo,
      contact_name: contatoNome,
      contact_email: contatoEmail,
      // E.164 sem "+", normalizado: é o que monta o link wa.me do documento.
      contact_phone: fone.e164,
      // `commercial_notes` NÃO é interno: buildProposalDocument o expõe como
      // `notasComerciais` no documento que o cliente lê. A proveniência fica em
      // created_by_email + orcamento_cenarios.proposta_id + admin_audit_log.
      commercial_notes: null,
      monthly_value: monthly,
      ...finSemComissao,
    })
    .select('id')
    .single();
  if (erroInsert) return { success: false, error: erroInsert.message };

  const propostaId = String((criada as any).id);

  // Vínculo de mão única: se falhar, a proposta JÁ EXISTE — dizer que falhou
  // sem dizer o número deixaria o admin sem saber o que procurar no banco.
  const { error: erroVinculo } = await sb
    .from('orcamento_cenarios')
    .update({ proposta_id: propostaId, updated_at: new Date().toISOString() })
    .eq('id', orcamentoId);

  await auditar(email, 'proposta_deal_desk.criar', numero as string, {
    orcamentoId, propostaId, vigenciaMeses: vigencia, totalContrato: fin.total_contract_value,
    vinculo: erroVinculo ? 'falhou' : 'ok',
  });

  if (erroVinculo) {
    return {
      success: false,
      error: `Proposta ${numero} criada, mas o vínculo com o orçamento falhou (${erroVinculo.message}). Não converta de novo: procure a proposta na lista.`,
    };
  }

  return {
    success: true,
    data: {
      id: propostaId,
      numero: numero as string,
      valorMensal: monthly,
      vigenciaMeses: vigencia,
      totalContrato: fin.total_contract_value,
    },
  };
}

/**
 * Atualiza a proposta que um orçamento JÁ gerou, a partir do orçamento salvo.
 *
 * Existe porque a conversão é de mão única (um orçamento, uma proposta) e editar
 * o orçamento depois não chegava à proposta. Medido 17/09/2026: o "Futuro SA"
 * ganhou simuladores e passou a valer R$ 1.599.000, e a PROP-2026-0008 seguiu
 * em R$ 1.569.000 enquanto a faixa de métricas do documento já lia o orçamento
 * novo, ao vivo. O documento misturava as duas versões.
 *
 * Os números saem da LINHA DO BANCO pela mesma conta da conversão
 * (`numerosDoOrcamento`); do cliente vêm só o escopo revisado e as condições.
 * Número, contato, link público, tipo de cliente e status ficam como estão.
 * Recusa proposta com RC (helper do arquivo) e proposta já fechada (`FECHADAS`).
 */
export async function atualizarPropostaDeOrcamento(
  input: EntradaAtualizacao,
): Promise<ActionResult<PropostaCriada>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const bruto = (input ?? {}) as Record<string, unknown>;
  const orcamentoId = typeof bruto.orcamentoId === 'string' ? bruto.orcamentoId.trim() : '';
  if (!orcamentoId) return { success: false, error: 'Informe o orçamento salvo.' };
  const escopo = typeof bruto.includedScope === 'string' ? bruto.includedScope.trim() : '';
  if (!escopo) {
    return { success: false, error: 'Revise o escopo: é o texto que o cliente lê no documento da proposta.' };
  }
  const paymentTerms = typeof bruto.paymentTerms === 'string' ? bruto.paymentTerms.trim() : '';

  const { data: orc, error: erroOrc } = await sb
    .from('orcamento_cenarios')
    .select('id, entradas, resultado, proposta_id')
    .eq('id', orcamentoId)
    .maybeSingle();
  if (erroOrc) return { success: false, error: erroOrc.message };
  if (!orc) return { success: false, error: 'Orçamento não encontrado' };
  if (!orc.proposta_id) {
    return { success: false, error: 'Este orçamento ainda não virou proposta: use "Converter em proposta".' };
  }

  const alvo = await exigirPropostaDoDealDesk(sb, String(orc.proposta_id));
  if (alvo.erro) return { success: false, error: alvo.erro };
  const proposta = alvo.proposta;
  if (FECHADAS[proposta.status]) {
    return {
      success: false,
      error: `A proposta ${proposta.proposal_number} já está ${FECHADAS[proposta.status]}: valor e escopo não mudam mais.`,
    };
  }

  const numeros = numerosDoOrcamento(orc.resultado, orc.entradas);
  if ('erro' in numeros) return { success: false, error: numeros.erro };
  const { resumo, descontoPct, vigencia, monthly, fin, finSemComissao } = numeros;

  const { data: gravadas, error: erroUpdate } = await sb
    .from('sales_proposals')
    .update({
      number_of_users: resumo.pessoas > 0 ? resumo.pessoas : null,
      number_of_roles_mapped: resumo.cargos > 0 ? resumo.cargos : null,
      contract_duration_months: vigencia,
      discount_requested: descontoPct,
      payment_terms: paymentTerms || null,
      included_scope: escopo,
      monthly_value: monthly,
      ...finSemComissao,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposta.id)
    // As mesmas duas travas de antes, repetidas NA ESCRITA: entre a leitura e o
    // update a proposta pode ter sido aceita (link público) ou ganho RC.
    .is('representante_id', null)
    .not('status', 'in', `(${Object.keys(FECHADAS).join(',')})`)
    .select('id');
  if (erroUpdate) return { success: false, error: erroUpdate.message };
  if (!gravadas || gravadas.length !== 1) {
    return {
      success: false,
      error: `A proposta ${proposta.proposal_number} mudou de estado durante a atualização. Recarregue e confira antes de tentar de novo.`,
    };
  }

  await auditar(email, 'proposta_deal_desk.atualizar', proposta.proposal_number, {
    orcamentoId,
    propostaId: proposta.id,
    antes: { total: proposta.total_contract_value, parcelas: proposta.contract_duration_months },
    depois: { total: fin.total_contract_value, parcelas: vigencia },
  });

  return {
    success: true,
    data: {
      id: String(proposta.id),
      numero: proposta.proposal_number,
      valorMensal: monthly,
      vigenciaMeses: vigencia,
      totalContrato: fin.total_contract_value,
    },
  };
}

/**
 * Aprova direto de `draft`.
 *
 * No fluxo do RC a aprovação exige `submitted_for_approval` porque o RC precisa
 * declarar que terminou. Aqui não há RC: quem criou é quem aprova, e exigir um
 * estado intermediário seria cerimônia, não controle. É justamente por isso que
 * `created_by_email` fica na linha.
 */
export async function aprovarPropostaAdmin(proposalId: string): Promise<ActionResult<void>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const r = await exigirPropostaDoDealDesk(sb, proposalId);
  if (r.erro || !r.proposta) return { success: false, error: r.erro ?? 'Proposta não encontrada' };

  // Checagem explícita, não só o `.eq('status','draft')` da escrita: sem ela, uma
  // proposta já aprovada/aceita não casaria linha nenhuma, o update voltaria
  // `error: null` e a action diria "aprovada" — aprovando no log o que não mudou.
  if (!['draft', 'submitted_for_approval'].includes(r.proposta.status)) {
    return { success: false, error: `Uma proposta "${r.proposta.status}" não pode ser aprovada.` };
  }

  const { error } = await sb
    .from('sales_proposals')
    .update({
      status: 'approved',
      approved_by: email,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('status', r.proposta.status);
  if (error) return { success: false, error: error.message };

  await auditar(email, 'proposta_deal_desk.aprovar', r.proposta.proposal_number, { proposalId });
  return { success: true };
}

/** Gera/recupera o token público do documento. Só depois de aprovada. */
export async function gerarLinkPropostaAdmin(proposalId: string): Promise<ActionResult<string>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const r = await exigirPropostaDoDealDesk(sb, proposalId);
  if (r.erro || !r.proposta) return { success: false, error: r.erro ?? 'Proposta não encontrada' };
  if (!COMPARTILHAVEIS.includes(r.proposta.status)) {
    return { success: false, error: 'A proposta precisa estar aprovada antes de gerar o link do cliente.' };
  }

  let token = r.proposta.public_token as string | null;
  if (!token) {
    token = novoTokenProposta();
    const { error } = await sb
      .from('sales_proposals')
      .update({ public_token: token, updated_at: new Date().toISOString() })
      .eq('id', proposalId);
    if (error) return { success: false, error: error.message };
    await auditar(email, 'proposta_deal_desk.gerar_link', r.proposta.proposal_number, { proposalId });
  }
  return { success: true, data: token };
}

/** Aprovada → enviada ao cliente. */
export async function marcarPropostaEnviadaAdmin(proposalId: string): Promise<ActionResult<void>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const r = await exigirPropostaDoDealDesk(sb, proposalId);
  if (r.erro || !r.proposta) return { success: false, error: r.erro ?? 'Proposta não encontrada' };
  if (r.proposta.status !== 'approved') {
    return { success: false, error: 'Só proposta aprovada pode ser marcada como enviada ao cliente.' };
  }

  const { error } = await sb
    .from('sales_proposals')
    .update({ status: 'sent_to_client', updated_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('status', 'approved');
  if (error) return { success: false, error: error.message };

  await auditar(email, 'proposta_deal_desk.enviar', r.proposta.proposal_number, { proposalId });
  return { success: true };
}

/**
 * Aceite do cliente.
 *
 * ⚠️ NÃO materializa `sales_commission_events`: sem RC não há quem receba, e a
 * coluna `representante_id` daquela tabela é NOT NULL. O fluxo do RC materializa
 * aquisição (9%) + recorrente (12%) aqui; este caminho salta de propósito.
 */
export async function marcarPropostaAceitaAdmin(proposalId: string): Promise<ActionResult<void>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const r = await exigirPropostaDoDealDesk(sb, proposalId);
  if (r.erro || !r.proposta) return { success: false, error: r.erro ?? 'Proposta não encontrada' };
  const p = r.proposta;
  if (p.status !== 'sent_to_client') {
    return { success: false, error: 'Só proposta enviada ao cliente pode ser marcada como aceita.' };
  }

  const { error } = await sb
    .from('sales_proposals')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('status', 'sent_to_client');
  if (error) return { success: false, error: error.message };

  if (p.account_id) {
    const { data: conta, error: erroConta } = await sb
      .from('sales_accounts')
      .select('contract_start_date')
      .eq('id', p.account_id)
      .maybeSingle();
    if (erroConta) return { success: false, error: erroConta.message };

    // Conta já contratada NÃO tem as datas sobrescritas: proposta do deal desk
    // não tem oportunidade, então não há `origin` para distinguir expansão de
    // negócio novo — e resetar a renovação de um cliente ativo seria pior do que
    // não carimbar nada.
    const patch: Record<string, any> = { status: 'active_client', updated_at: new Date().toISOString() };
    if (!conta?.contract_start_date) {
      const inicio = new Date();
      const renovacao = new Date(inicio);
      renovacao.setMonth(renovacao.getMonth() + (Number(p.contract_duration_months) || 12));
      patch.contract_start_date = inicio.toISOString().slice(0, 10);
      patch.renewal_date = renovacao.toISOString().slice(0, 10);
    }
    const { error: erroContaUpdate } = await sb.from('sales_accounts').update(patch).eq('id', p.account_id);
    if (erroContaUpdate) return { success: false, error: erroContaUpdate.message };
  }

  await auditar(email, 'proposta_deal_desk.aceite', p.proposal_number, {
    proposalId,
    totalContrato: p.total_contract_value,
    comissao: 'nenhuma — proposta sem RC',
  });
  return { success: true };
}

/** Aprovada/enviada que não evoluiu. */
export async function marcarPropostaPerdidaAdmin(
  proposalId: string,
  reason?: string,
): Promise<ActionResult<void>> {
  const sb = await requirePlataformaSupabase('sales_channel.manage');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { success: false, error: 'Sessão expirada. Entre de novo para continuar.' };

  const r = await exigirPropostaDoDealDesk(sb, proposalId);
  if (r.erro || !r.proposta) return { success: false, error: r.erro ?? 'Proposta não encontrada' };
  if (!['draft', 'approved', 'sent_to_client'].includes(r.proposta.status)) {
    return { success: false, error: 'Estado atual não permite marcar como perdida.' };
  }

  const { error } = await sb
    .from('sales_proposals')
    .update({
      status: 'lost',
      rejection_reason: reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId);
  if (error) return { success: false, error: error.message };

  await auditar(email, 'proposta_deal_desk.perdida', r.proposta.proposal_number, { proposalId });
  return { success: true };
}
