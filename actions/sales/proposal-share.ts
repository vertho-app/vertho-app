'use server';

// Portal do Representante — compartilhamento do documento da proposta (item 1).
//
//   • gerarLinkProposta: cria (idempotente) o token público da proposta. Só
//     após aprovação da Vertho (a proposta que vai ao cliente é a aprovada).
//   • getPropostaPublica: leitura pública por token (sem sessão), registra a
//     abertura e devolve o VM cliente-safe. Usada pela página /proposta/[token].
import crypto from 'node:crypto';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeAction } from '@/lib/sales/permissions';
import { buildProposalDocument, type ProposalDocumentVM } from '@/lib/sales/proposal-document';
import type { SalesProposal } from '@/lib/sales/types';

// Estados em que a proposta já pode ser enviada ao cliente.
const SHAREABLE_STATUSES = ['approved', 'sent_to_client', 'accepted'];

/** Gera/recupera o token público da proposta (RC dono, só após aprovação). */
export async function gerarLinkProposta(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals')
    .select('id, representante_id, status, public_token').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.representante_id !== ctx.rep.id) return { success: false as const, error: 'FORBIDDEN: proposta de outro representante' };
  if (!SHAREABLE_STATUSES.includes(p.status)) {
    return { success: false as const, error: 'A proposta precisa estar aprovada pela Vertho antes de ser enviada ao cliente.' };
  }

  let token = p.public_token as string | null;
  if (!token) {
    token = crypto.randomBytes(18).toString('base64url'); // 144 bits, url-safe
    const { error } = await sb.from('sales_proposals')
      .update({ public_token: token, updated_at: new Date().toISOString() }).eq('id', proposalId);
    if (error) return { success: false as const, error: error.message };
  }
  return { success: true as const, token };
}

/**
 * Leitura PÚBLICA da proposta por token (sem sessão). Registra a abertura
 * (primeira/última + contagem) e devolve o VM cliente-safe. null se não achar.
 */
export async function getPropostaPublica(token: string): Promise<ProposalDocumentVM | null> {
  if (!token || typeof token !== 'string') return null;
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('*').eq('public_token', token).maybeSingle();
  if (!p) return null;

  const [{ data: account }, { data: rep }] = await Promise.all([
    p.account_id
      ? sb.from('sales_accounts').select('legal_name, trade_name').eq('id', p.account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('sales_representatives').select('name, email, phone').eq('id', p.representante_id).maybeSingle(),
  ]);

  // Registra a abertura (best-effort — não bloqueia a exibição).
  await sb.from('sales_proposals').update({
    first_viewed_at: p.first_viewed_at || new Date().toISOString(),
    last_viewed_at: new Date().toISOString(),
    view_count: (p.view_count || 0) + 1,
  }).eq('id', p.id);

  return buildProposalDocument(p as SalesProposal, account, rep);
}
