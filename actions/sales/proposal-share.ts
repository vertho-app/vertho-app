'use server';

// Portal do Representante — compartilhamento do documento da proposta (item 1).
//
//   • gerarLinkProposta: cria (idempotente) o token público da proposta. Só
//     após aprovação da Vertho (a proposta que vai ao cliente é a aprovada).
//   • getPropostaPublica: leitura pública por token (sem sessão), registra a
//     abertura e devolve o VM cliente-safe. Usada pela página /proposta/[token].
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeAction } from '@/lib/sales/permissions';
import { novoTokenProposta } from '@/lib/sales/proposal-token';
import { buildProposalDocument, PROPOSAL_VALIDITY_DAYS, type ProposalDocumentVM } from '@/lib/sales/proposal-document';
import { validarAceite, ipDoCliente } from '@/lib/sales/proposal-aceite';
import { createRateLimiter } from '@/lib/rate-limit';
import type { SalesProposal } from '@/lib/sales/types';

// Estados em que a proposta já pode ser enviada ao cliente.
const SHAREABLE_STATUSES = ['approved', 'sent_to_client', 'accepted'];

// Estados em que o CLIENTE ainda pode aceitar pelo link. 'accepted' fica de fora
// de propósito: quem já aceitou cai no ramo idempotente, não reescreve o aceite.
const ACEITAVEIS = ['approved', 'sent_to_client'];

/**
 * 5 tentativas por minuto POR TOKEN. O endpoint é público e escreve no banco:
 * sem isso, quem tem o link pode martelar a action. Por token (e não por IP)
 * porque a proteção que interessa é a da proposta, e o IP do cliente muda.
 */
const aceiteLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

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
    token = novoTokenProposta();
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

  const [{ data: account }, { data: rep }, { data: opp }, { data: orc }] = await Promise.all([
    p.account_id
      ? sb.from('sales_accounts').select('legal_name, trade_name').eq('id', p.account_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Proposta do deal desk não tem RC (mig 254): sem este ramo, `.eq('id', null)`
    // viraria `id=eq.null` no PostgREST — query inútil em vez de "sem representante".
    p.representante_id
      ? sb.from('sales_representatives').select('name, email, phone').eq('id', p.representante_id).maybeSingle()
      : Promise.resolve({ data: null }),
    p.opportunity_id
      ? sb.from('sales_opportunities').select('identified_need').eq('id', p.opportunity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Orçamento que gerou a proposta: é de onde saem os números do programa
    // (pessoas, cargos, ciclos, duração) que o documento mostra na abertura.
    // Só os DOIS jsonb, filtrados pela allowlist de `proposal-programa.ts` —
    // eles também carregam custo e margem, que nunca podem sair daqui.
    sb.from('orcamento_cenarios').select('entradas, resultado').eq('proposta_id', p.id).maybeSingle(),
  ]);

  // Registra a abertura (best-effort — não bloqueia a exibição).
  await sb.from('sales_proposals').update({
    first_viewed_at: p.first_viewed_at || new Date().toISOString(),
    last_viewed_at: new Date().toISOString(),
    view_count: (p.view_count || 0) + 1,
  }).eq('id', p.id);

  return buildProposalDocument(p as SalesProposal, account, rep, {
    contexto: (opp as any)?.identified_need ?? null,
    orcamento: orc,
  });
}

export type ResultadoAceite =
  | { success: true; aceite: { nome: string; cargo: string | null; em: string }; jaAceita: boolean }
  | { success: false; error: string; campo?: 'nome' | 'cargo' | 'email' };

/**
 * ACEITE PÚBLICO da proposta (sem sessão), a partir do token do link.
 *
 * É escrita sem autenticação, então a régua é estreita de propósito:
 *   · o token é a única credencial e resolve UMA proposta (24 chars aleatórios);
 *   · só muda `draft→` nada: exige status `approved`/`sent_to_client` e validade
 *     em dia — proposta expirada ou já perdida não vira contrato por um clique;
 *   · é IDEMPOTENTE: quem recarregar e reenviar recebe o aceite já registrado,
 *     em vez de sobrescrever o nome de quem aceitou primeiro;
 *   · nome/cargo/e-mail são DECLARAÇÃO do cliente (ninguém autenticou ninguém).
 *     Por isso guardamos junto IP e user-agent: a trilha técnica é o que se tem.
 */
export async function registrarAceitePublico(token: string, dados: unknown): Promise<ResultadoAceite> {
  if (!token || typeof token !== 'string') return { success: false, error: 'Link inválido.' };

  // `'erro' in v` e não `!v.ok`: com `strict:false` o TS não estreita união por
  // booleano (ver tsconfig — a checagem por propriedade é o padrão do projeto).
  const v = validarAceite(dados);
  if ('erro' in v) return { success: false, error: v.erro, campo: v.campo };

  const h = await headers();
  const barrado = await aceiteLimiter.check(new Request('https://app.vertho.ai/proposta'), `aceite:${token}`);
  if (barrado) return { success: false, error: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' };

  const sb = createSupabaseAdmin();
  const { data: p, error: erroLeitura } = await sb.from('sales_proposals')
    .select('id, status, approved_at, created_at, accepted_at, accepted_by_name, accepted_by_role')
    .eq('public_token', token).maybeSingle();
  // Falha de LEITURA não pode virar "proposta não encontrada": o supabase-js
  // devolve `{ error }` com `data: null`, e uma coluna que ainda não existe no
  // schema derruba a query inteira (42703). Quem está com o link na mão veria
  // "link inválido" e desistiria, em vez de tentar de novo.
  if (erroLeitura) {
    return { success: false, error: 'Não foi possível abrir a proposta agora. Tente de novo em instantes.' };
  }
  if (!p) return { success: false, error: 'Proposta não encontrada ou indisponível.' };

  // Já aceita: devolve o que está gravado. Reenvio de formulário (ou dois
  // decisores clicando) não pode reescrever quem assinou primeiro.
  if (p.accepted_at) {
    return {
      success: true,
      jaAceita: true,
      aceite: { nome: p.accepted_by_name || 'Cliente', cargo: p.accepted_by_role ?? null, em: p.accepted_at },
    };
  }
  if (p.status === 'accepted') {
    return { success: false, error: 'Esta proposta já consta como aceita. Fale com o seu contato na Vertho.' };
  }
  if (!ACEITAVEIS.includes(p.status)) {
    return { success: false, error: 'Esta proposta não está disponível para aceite. Fale com o seu contato na Vertho.' };
  }

  // Validade: a mesma régua do documento (emissão + PROPOSAL_VALIDITY_DAYS).
  const emitida = new Date(p.approved_at || p.created_at);
  const valida = new Date(emitida);
  valida.setDate(valida.getDate() + PROPOSAL_VALIDITY_DAYS);
  if (valida.getTime() < Date.now()) {
    return { success: false, error: 'A validade desta proposta expirou. Peça uma revisão ao seu contato na Vertho.' };
  }

  const agora = new Date().toISOString();
  const { error } = await sb.from('sales_proposals').update({
    status: 'accepted',
    accepted_at: agora,
    accepted_by_name: v.valor.nome,
    accepted_by_role: v.valor.cargo,
    accepted_by_email: v.valor.email,
    accepted_ip: ipDoCliente(h),
    accepted_user_agent: (h.get('user-agent') || '').slice(0, 300) || null,
    updated_at: agora,
  }).eq('id', p.id).is('accepted_at', null); // corrida: o segundo clique não regrava
  if (error) return { success: false, error: 'Não foi possível registrar o aceite agora. Tente de novo em instantes.' };

  return { success: true, jaAceita: false, aceite: { nome: v.valor.nome, cargo: v.valor.cargo, em: agora } };
}
