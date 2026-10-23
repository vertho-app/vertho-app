'use server';

// Portal do Representante — apresentação personalizada (decisão do dono de
// 23/10/2026; mig 299; conteúdo em lib/sales/apresentacao.ts).
//
//   • gerarApresentacao: o RC gera (ou atualiza) o link da oportunidade dele, com
//     o contexto que CONFIRMOU para o cliente ler.
//   • getApresentacaoPublica: leitura pública por token (sem sessão), conta a
//     abertura e devolve o VM sem preço. Usada por /apresentacao/[token].
//   • revogarApresentacao: o RC tira o link do ar.
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeAction, assertRepresentativeOwnership } from '@/lib/sales/permissions';
import { novoTokenProposta } from '@/lib/sales/proposal-token';
import { segmentoDoCliente } from '@/lib/sales/proposal-document';
import { CONTEXTO_MAX, TOKEN_APRESENTACAO, buildApresentacao, type ApresentacaoVM } from '@/lib/sales/apresentacao';

export type ApresentacaoDoRc = {
  id: string;
  token: string;
  contexto: string | null;
  criado_em: string;
  view_count: number;
  last_viewed_at: string | null;
};

/** A apresentação em vigor da oportunidade (a mais recente não revogada), se houver. */
export async function getApresentacaoDaOportunidade(opportunityId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: opp, error: erroOpp } = await sb.from('sales_opportunities')
    .select('representante_id, identified_need').eq('id', opportunityId).maybeSingle();
  if (erroOpp) return { success: false as const, error: erroOpp.message };
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  const { data, error } = await sb.from('sales_apresentacoes')
    .select('id, token, contexto, criado_em, view_count, last_viewed_at')
    .eq('opportunity_id', opportunityId).is('revogada_em', null)
    .order('criado_em', { ascending: false }).limit(1);
  if (error) return { success: false as const, error: error.message };
  return {
    success: true as const,
    apresentacao: ((data || [])[0] ?? null) as ApresentacaoDoRc | null,
    sugestaoDeContexto: (opp.identified_need as string | null) ?? null,
  };
}

/**
 * Gera o link da apresentação da oportunidade (ou atualiza o contexto do link em
 * vigor, mantendo o endereço que o cliente já recebeu). Registro recusado não
 * gera apresentação: o cliente não é do RC.
 */
export async function gerarApresentacao(opportunityId: string, input: { contexto?: string | null }) {
  const ctx = await requireRepresentativeAction();
  const contexto = String(input?.contexto ?? '').trim().slice(0, CONTEXTO_MAX) || null;
  const sb = createSupabaseAdmin();
  const { data: opp, error: erroOpp } = await sb.from('sales_opportunities')
    .select('id, representante_id, account_id, status, attribution_status, account:sales_accounts (legal_name, trade_name, segment)')
    .eq('id', opportunityId).maybeSingle();
  if (erroOpp) return { success: false as const, error: erroOpp.message };
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  if (opp.attribution_status === 'recusada') return { success: false as const, error: 'O registro desta oportunidade foi recusado: não dá para gerar apresentação.' };
  if (opp.status !== 'open') return { success: false as const, error: 'A oportunidade não está mais aberta.' };

  const { data: atual, error: erroAtual } = await sb.from('sales_apresentacoes')
    .select('id, token').eq('opportunity_id', opportunityId).is('revogada_em', null)
    .order('criado_em', { ascending: false }).limit(1);
  if (erroAtual) return { success: false as const, error: erroAtual.message };
  const emVigor = (atual || [])[0] as { id: string; token: string } | undefined;
  if (emVigor) {
    const { error } = await sb.from('sales_apresentacoes').update({ contexto }).eq('id', emVigor.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, token: emVigor.token, novo: false };
  }

  const conta: any = Array.isArray(opp.account) ? opp.account[0] : opp.account;
  const token = novoTokenProposta();
  const { error } = await sb.from('sales_apresentacoes').insert({
    representante_id: ctx.rep.id,
    opportunity_id: opp.id,
    account_id: opp.account_id,
    token,
    cliente_nome: conta?.trade_name || conta?.legal_name || null,
    segmento: segmentoDoCliente(conta?.segment),
    contexto,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, token, novo: true };
}

/** Tira o link do ar. O histórico de aberturas fica. */
export async function revogarApresentacao(apresentacaoId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: a, error: erroLeitura } = await sb.from('sales_apresentacoes')
    .select('id, representante_id').eq('id', apresentacaoId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!a) return { success: false as const, error: 'Apresentação não encontrada' };
  assertRepresentativeOwnership(ctx, a.representante_id);
  const { error } = await sb.from('sales_apresentacoes').update({ revogada_em: new Date().toISOString() }).eq('id', apresentacaoId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/**
 * Leitura PÚBLICA por token (sem sessão). null quando o token não tem o formato,
 * não existe, foi revogado, o registro da oportunidade foi recusado ou o RC não
 * está mais ativo no canal: a página não pode apresentar como contato quem não
 * representa mais aquele cliente. Conta a abertura (best-effort, como a proposta).
 */
export async function getApresentacaoPublica(token: string): Promise<ApresentacaoVM | null> {
  if (typeof token !== 'string' || !TOKEN_APRESENTACAO.test(token)) return null;
  const sb = createSupabaseAdmin();
  const { data: a, error } = await sb.from('sales_apresentacoes')
    .select('id, representante_id, cliente_nome, segmento, contexto, view_count, first_viewed_at, revogada_em, opportunity:sales_opportunities (attribution_status)')
    .eq('token', token).maybeSingle();
  if (error || !a || a.revogada_em) return null;
  const opp: any = Array.isArray(a.opportunity) ? a.opportunity[0] : a.opportunity;
  if (opp?.attribution_status === 'recusada') return null;

  const { data: rep, error: erroRep } = await sb.from('sales_representatives').select('name, email, phone, status').eq('id', a.representante_id).maybeSingle();
  if (erroRep || !rep || rep.status !== 'active') {
    if (erroRep) console.error('[sales] RC da apresentação não lido:', erroRep.message);
    return null;
  }
  const agora = new Date().toISOString();
  const { error: erroAbertura } = await sb.from('sales_apresentacoes').update({
    first_viewed_at: a.first_viewed_at || agora,
    last_viewed_at: agora,
    view_count: (a.view_count || 0) + 1,
  }).eq('id', a.id);
  if (erroAbertura) console.error('[sales] abertura da apresentação não registrada:', erroAbertura.message);

  return buildApresentacao(a, rep);
}
