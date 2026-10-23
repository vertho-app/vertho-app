// Núcleo do aceite de proposta do RC e das regras de comissão que dependem do
// histórico (contrato de representação v5).
//
// Fica em lib/ (e não num arquivo 'use server') porque lá todo export vira
// endpoint HTTP. O RC (`markProposalAccepted`) e o admin
// (`registrarAceitePropostaDoRC`) chamam o MESMO núcleo: aceitar não é só
// carimbar `accepted`, é fechar a oportunidade, ativar a conta e lançar a
// comissão, e dois caminhos com cópias diferentes disso divergem.
import type { createSupabaseAdmin } from '@/lib/supabase';
import { commissionRatesFor, type CompensationModel } from './constants';
import { eventosDoPlano, planoDeComissao } from './commissions';
import { PROPOSAL_VALIDITY_DAYS } from './proposal-document';
import { codigoInepValido } from './registro';

type Sb = ReturnType<typeof createSupabaseAdmin>;

export type ClassificacaoCarteira = { carteira: boolean; motivo: string | null };

/**
 * Cliente da carteira (10.6): o mesmo cliente já tem proposta ACEITA do mesmo
 * RC, além da que está sendo avaliada. "Mesmo cliente" = a mesma conta ou outra
 * conta do RC com o mesmo CNPJ básico (matriz e filiais) ou o mesmo INEP (v6,
 * 10.6). Versões substituídas não contam (nunca foram aceitas). NÃO usa
 * `contract_start_date` nem `active_client`: o próprio aceite e o "Fechado" do
 * funil carimbam esses campos, e a primeira venda viraria carteira. Grupo
 * econômico e mantenedora não se detectam por aqui: o admin marca na aprovação.
 */
export async function classificarCarteira(
  sb: Sb,
  { representanteId, accountId, excluirProposalId }: { representanteId: string; accountId: string | null; excluirProposalId?: string | null },
): Promise<ClassificacaoCarteira> {
  if (!accountId) return { carteira: false, motivo: null };
  const contas = await contasDoMesmoCliente(sb, representanteId, accountId);
  let q = sb.from('sales_proposals')
    .select('id, proposal_number')
    .eq('representante_id', representanteId)
    .in('account_id', contas)
    .eq('status', 'accepted');
  if (excluirProposalId) q = q.neq('id', excluirProposalId);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(1);
  // Falha de leitura não pode virar "cliente novo" calado: a carteira paga a metade.
  if (error) throw new Error(`Não foi possível conferir a carteira do cliente: ${error.message}`);
  const anterior = (data || [])[0] as { proposal_number?: string } | undefined;
  return anterior
    ? { carteira: true, motivo: `Cliente da carteira: o cliente já tem a proposta aceita ${anterior.proposal_number ?? ''}`.trim() }
    : { carteira: false, motivo: null };
}

/** A conta e as outras contas do RC com o mesmo CNPJ básico ou INEP. Erro de leitura lança. */
async function contasDoMesmoCliente(sb: Sb, representanteId: string, accountId: string): Promise<string[]> {
  const { data: conta, error } = await sb.from('sales_accounts').select('cnpj_raiz, codigo_inep').eq('id', accountId).maybeSingle();
  if (error) throw new Error(`Não foi possível conferir a carteira do cliente: ${error.message}`);
  const raiz = cnpjRaizGravada(conta?.cnpj_raiz);
  const inep = codigoInepValido(conta?.codigo_inep);
  if (!raiz && !inep) return [accountId];
  const filtro = [raiz ? `cnpj_raiz.eq.${raiz}` : null, inep ? `codigo_inep.eq.${inep}` : null].filter(Boolean).join(',');
  const { data: irmas, error: erroIrmas } = await sb.from('sales_accounts').select('id')
    .eq('representante_id', representanteId).or(filtro);
  if (erroIrmas) throw new Error(`Não foi possível conferir a carteira do cliente: ${erroIrmas.message}`);
  return [...new Set([accountId, ...((irmas || []) as { id: string }[]).map((c) => c.id)])];
}

/** A raiz gravada pela coluna gerada; entra num filtro do PostgREST, então só o formato esperado passa. */
function cnpjRaizGravada(raiz: string | null | undefined): string | null {
  return raiz && /^[0-9A-Z]{8}$/.test(raiz) ? raiz : null;
}

/** Modelo e taxas que valem para a proposta: o gravado nela (10.5) ou, em proposta antiga, o atual do RC. */
export function termosDaProposta(
  p: { compensation_model?: string | null; carteira?: boolean | null },
  modeloAtualDoRc: string | null | undefined,
) {
  const modelo = (p.compensation_model || modeloAtualDoRc || 'sem_ajuda') as CompensationModel;
  return { modelo, rates: commissionRatesFor(modelo), carteira: !!p.carteira };
}

export type RcParaAceite = { status: string; contract_ended_at?: string | null };
export type PropostaParaAceite = {
  sent_to_client_at?: string | null;
  approved_at?: string | null;
  created_at: string;
};

/**
 * A comissão é devida neste aceite? (cláusula 18.7)
 *
 * Com o contrato em vigor (RC ativo ou suspenso), sempre. Depois do término, só
 * se a proposta foi ENVIADA ao cliente antes dele e é aceita dentro da validade.
 * Proposta enviada antes desta regra existir não tem `sent_to_client_at`: o
 * envio só acontece depois da aprovação, então a aprovação é o limite inferior.
 */
export function comissaoDevidaNoAceite(
  rep: RcParaAceite,
  p: PropostaParaAceite,
  agora: Date = new Date(),
): { devida: boolean; motivo: string | null } {
  if (rep.status !== 'inactive') return { devida: true, motivo: null };
  if (!rep.contract_ended_at) {
    return { devida: false, motivo: 'O RC está inativo sem data de término registrada. Confira o término do contrato antes de lançar a comissão.' };
  }
  const fim = new Date(rep.contract_ended_at);
  const enviada = p.sent_to_client_at || p.approved_at;
  if (!enviada || new Date(enviada).getTime() > fim.getTime()) {
    return { devida: false, motivo: 'A proposta não foi enviada ao cliente antes do término do contrato do RC (cláusula 18.7).' };
  }
  const validaAte = new Date(p.approved_at || p.created_at);
  validaAte.setDate(validaAte.getDate() + PROPOSAL_VALIDITY_DAYS);
  if (agora.getTime() > validaAte.getTime()) {
    return { devida: false, motivo: 'O aceite veio depois da validade da proposta, com o contrato do RC já encerrado (cláusula 18.7).' };
  }
  return { devida: true, motivo: 'Enviada antes do término do contrato do RC e aceita dentro da validade (cláusula 18.7).' };
}

export type ResultadoAceite =
  | { success: true; eventos: number }
  | { success: false; error: string };

/**
 * Aceite de proposta do RC: grava `accepted`, fecha a oportunidade como ganha,
 * ativa a conta na carteira e, quando a comissão é devida, lança os eventos
 * previstos nas regras GRAVADAS na proposta (modelo da aprovação e carteira).
 */
export async function concluirAceiteDoRC(
  sb: Sb,
  p: Record<string, any>,
  { modeloAtualDoRc, comComissao }: { modeloAtualDoRc: string | null | undefined; comComissao: boolean },
): Promise<ResultadoAceite> {
  const agora = new Date();
  // Só uma transição vale: dois cliques (ou RC e admin ao mesmo tempo) não
  // podem lançar a comissão duas vezes.
  const { data: mudou, error } = await sb.from('sales_proposals')
    .update({ status: 'accepted', accepted_recorded_at: agora.toISOString(), updated_at: agora.toISOString() })
    .eq('id', p.id).eq('status', 'sent_to_client')
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!mudou || mudou.length === 0) {
    return { success: false, error: 'A proposta não está mais como enviada ao cliente: o aceite já pode ter sido registrado.' };
  }

  // Daqui em diante o aceite já está gravado: uma falha nos passos seguintes não
  // pode interromper o lançamento da comissão, mas tem que voltar como erro.
  const falhas: string[] = [];
  if (p.opportunity_id) {
    const { error: erroOpp } = await sb.from('sales_opportunities').update({ stage: 'fechado_ganho', status: 'won', updated_at: agora.toISOString() })
      .eq('id', p.opportunity_id).eq('status', 'open');
    if (erroOpp) falhas.push(`a oportunidade não foi fechada (${erroOpp.message})`);
  }
  if (p.account_id) {
    // Expansão (upsell em cliente já ativo) NÃO reseta o contrato-base: preserva
    // início e renovação vigentes. Negócio novo ou renovação carimba as datas.
    let ehExpansao = false;
    if (p.opportunity_id) {
      const { data: opp, error: erroOrigem } = await sb.from('sales_opportunities').select('origin').eq('id', p.opportunity_id).maybeSingle();
      if (erroOrigem) falhas.push(`a origem da oportunidade não foi lida (${erroOrigem.message})`);
      ehExpansao = opp?.origin === 'expansao';
    }
    const { data: acc, error: erroConta } = await sb.from('sales_accounts').select('contract_start_date').eq('id', p.account_id).maybeSingle();
    if (erroConta) falhas.push(`a conta não foi lida (${erroConta.message})`);
    const preservarContrato = ehExpansao && !!acc?.contract_start_date;

    const patch: Record<string, any> = { status: 'active_client', updated_at: agora.toISOString() };
    if (!preservarContrato) {
      const renewal = new Date(agora);
      renewal.setMonth(renewal.getMonth() + (Number(p.contract_duration_months) || 12));
      patch.contract_start_date = agora.toISOString().slice(0, 10);
      patch.renewal_date = renewal.toISOString().slice(0, 10);
    }
    const { error: erroAtivar } = await sb.from('sales_accounts').update(patch).eq('id', p.account_id);
    if (erroAtivar) falhas.push(`a conta não entrou na carteira (${erroAtivar.message})`);
  }
  const avisoFalhas = falhas.length ? ` Além disso, ${falhas.join('; ')}.` : '';

  if (!comComissao) {
    return falhas.length
      ? { success: false, error: `Proposta aceita.${avisoFalhas} Avise a vertho.ai.` }
      : { success: true, eventos: 0 };
  }

  // Eventos previstos: aquisição (1º pagamento) + uma linha por pagamento do
  // cliente com as parcelas mensais equivalentes que ele cobre, nas regras e no
  // cronograma gravados na aprovação (10.3). A granularidade por pagamento
  // permite ao financeiro reconhecer/pagar cada competência e ao RC emitir NF.
  const { rates, carteira } = termosDaProposta(p, modeloAtualDoRc);
  const plano = planoDeComissao(Number(p.total_contract_value) || 0, Number(p.contract_duration_months) || 0, rates, carteira);
  const base = { representante_id: p.representante_id, proposal_id: p.id, account_id: p.account_id };
  const cronograma = { pagamentos: p.payment_count ?? null, primeiroEmMeses: p.first_payment_offset_months ?? 0 };
  const eventos = eventosDoPlano(plano, agora, cronograma).map((e) => ({ ...base, ...e }));
  if (eventos.length > 0) {
    const { error: erroEventos } = await sb.from('sales_commission_events').insert(eventos);
    // O aceite já foi gravado; sem os eventos o extrato do RC e o financeiro
    // ficariam sem a comissão, então a falha volta como erro e não como sucesso.
    if (erroEventos) {
      return { success: false, error: `Proposta aceita, mas a previsão de comissão não foi gravada: ${erroEventos.message}.${avisoFalhas} Avise a vertho.ai.` };
    }
  }
  if (falhas.length) return { success: false, error: `Proposta aceita e comissão prevista lançada.${avisoFalhas} Avise a vertho.ai.` };
  return { success: true, eventos: eventos.length };
}
