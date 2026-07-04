'use server';

// Portal do Representante — Assistente Comercial (IA) do MVP 4.
//
// Reusa a infra central de IA do app (actions/ai-client.callAI: roteador
// multi-provedor Claude/Gemini/GPT com retry e fallback). Cada função aterra o
// prompt no CONTEXTO real (conta, oportunidade) + nos MATERIAIS aprovados
// (playbook/objeções), então a saída fala da Vertho e do cliente concreto — não
// genérico. RC-scoped (isolamento por representante_id).
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { requireRepresentativeAction, requireRepresentativeOrAdminAction } from '@/lib/sales/permissions';
import { PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';

const ASSISTANT_MAX_TOKENS = 2200;

const SYSTEM = `Você é um consultor comercial sênior da Vertho, apoiando um representante comercial autônomo.
A Vertho vende desenvolvimento de competências por IA: diagnóstico por cargo, trilha individual e um "Mentor IA" que acompanha a aplicação prática (WhatsApp). Público: escolas, redes de ensino, empresas (RH/T&D), fundações.
Seja PRÁTICO, específico ao cliente e à situação dados no contexto, e honesto (nunca invente números, cases ou promessas). Linguagem comercial-consultiva em português do Brasil.
Responda SEMPRE em JSON válido no formato pedido, sem texto fora do JSON.`;

/** Materiais aprovados como grounding (playbook/diagnóstico/objeções/política). */
async function materiaisGrounding(sb: ReturnType<typeof createSupabaseAdmin>, categorias: string[], segmento?: string | null): Promise<string> {
  let q = sb.from('sales_materials').select('title, category, segment, description').eq('is_active', true).in('category', categorias);
  const { data } = await q;
  const list = (data || []).filter((m: any) => !segmento || !m.segment || m.segment === 'geral' || m.segment === segmento);
  if (!list.length) return 'Sem materiais cadastrados.';
  return list.map((m: any) => `- [${m.category}${m.segment ? '/' + m.segment : ''}] ${m.title}: ${m.description || ''}`).join('\n');
}

async function loadOppContext(sb: ReturnType<typeof createSupabaseAdmin>, opportunityId: string, repId: string) {
  const { data: opp } = await sb.from('sales_opportunities')
    .select(`*, account:sales_accounts (legal_name, trade_name, segment, city, state, number_of_employees, number_of_units),
      primary_contact:sales_contacts!sales_opportunities_primary_contact_id_fkey (name, role)`)
    .eq('id', opportunityId).maybeSingle();
  if (!opp) return { error: 'Oportunidade não encontrada' as const };
  if (opp.representante_id !== repId) return { error: 'FORBIDDEN: oportunidade de outro representante' as const };
  return { opp };
}

function oppContextText(opp: any): string {
  const a = opp.account || {};
  const c = opp.primary_contact || {};
  const porte = [a.number_of_employees ? `${a.number_of_employees} colaboradores` : null, a.number_of_units ? `${a.number_of_units} unidades` : null].filter(Boolean).join(', ');
  return [
    `Oportunidade: ${opp.opportunity_name}`,
    `Cliente: ${a.trade_name || a.legal_name || '—'}${a.segment ? ` (segmento: ${a.segment})` : ''}${a.city ? ` — ${a.city}/${a.state || ''}` : ''}${porte ? ` — ${porte}` : ''}`,
    c.name ? `Contato: ${c.name}${c.role ? ` (${c.role})` : ''}` : null,
    opp.product_interest ? `Produto de interesse: ${PRODUCT_PACKAGE_LABELS[opp.product_interest] || opp.product_interest}` : null,
    opp.identified_need ? `Necessidade identificada: ${opp.identified_need}` : null,
    opp.estimated_value ? `Valor estimado: R$ ${Number(opp.estimated_value).toLocaleString('pt-BR')}` : null,
    opp.competitors ? `Concorrentes: ${opp.competitors}` : null,
    opp.objections ? `Objeções já sinalizadas: ${opp.objections}` : null,
    `Estágio atual: ${opp.stage}`,
  ].filter(Boolean).join('\n');
}

/** Preparação de reunião: briefing consultivo para a próxima conversa. */
export async function prepararReuniao(opportunityId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const r = await loadOppContext(sb, opportunityId, ctx.rep.id);
  if ('error' in r) return { success: false as const, error: r.error };

  const grounding = await materiaisGrounding(sb, ['playbook', 'diagnostico', 'objecoes'], r.opp.account?.segment);
  const user = `CONTEXTO DA OPORTUNIDADE:\n${oppContextText(r.opp)}\n\nMATERIAIS DA VERTHO (referência):\n${grounding}\n\nGere um briefing para a próxima reunião. JSON:
{"resumo_contexto": "2-3 frases situando a conta e o momento",
 "perguntas_diagnostico": ["4-6 perguntas específicas para aprofundar a dor e o valor"],
 "objecoes_provaveis": [{"objecao": "...", "resposta": "..."}],
 "proximo_passo_sugerido": "ação concreta para encaminhar a venda"}`;

  try {
    const raw = await callAI(SYSTEM, user, {}, ASSISTANT_MAX_TOKENS);
    const json = await extractJSON(raw);
    if (!json) return { success: false as const, error: 'A IA não retornou um resultado válido. Tente novamente.' };
    return { success: true as const, data: json };
  } catch (e: any) {
    return { success: false as const, error: `Falha ao preparar a reunião: ${e?.message || 'erro'}` };
  }
}

/** Assistente de proposta: reforça valor, escopo e antecipa objeções. */
export async function assistirProposta(opportunityId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const r = await loadOppContext(sb, opportunityId, ctx.rep.id);
  if ('error' in r) return { success: false as const, error: r.error };

  const grounding = await materiaisGrounding(sb, ['playbook', 'objecoes', 'case'], r.opp.account?.segment);
  const user = `CONTEXTO DA OPORTUNIDADE:\n${oppContextText(r.opp)}\n\nMATERIAIS DA VERTHO (referência):\n${grounding}\n\nAjude o representante a fortalecer a proposta comercial. JSON:
{"proposta_de_valor": "parágrafo curto conectando a solução Vertho à dor específica deste cliente",
 "escopo_sugerido": ["itens concretos que o escopo deveria destacar para este cliente"],
 "pontos_comerciais": ["argumentos/diferenciais a enfatizar na negociação"],
 "objecoes_provaveis": [{"objecao": "...", "resposta": "..."}]}`;

  try {
    const raw = await callAI(SYSTEM, user, {}, ASSISTANT_MAX_TOKENS);
    const json = await extractJSON(raw);
    if (!json) return { success: false as const, error: 'A IA não retornou um resultado válido. Tente novamente.' };
    return { success: true as const, data: json };
  } catch (e: any) {
    return { success: false as const, error: `Falha ao assistir a proposta: ${e?.message || 'erro'}` };
  }
}

/** Assistente de objeções: respostas ancoradas no playbook, adaptadas ao caso. */
export async function analisarObjecao(objecao: string, segmento?: string | null) {
  await requireRepresentativeOrAdminAction();
  const texto = String(objecao || '').trim();
  if (texto.length < 5) return { success: false as const, error: 'Descreva a objeção do cliente' };
  const sb = createSupabaseAdmin();
  const grounding = await materiaisGrounding(sb, ['objecoes', 'playbook'], segmento);
  const user = `OBJEÇÃO DO CLIENTE:\n"${texto}"${segmento ? `\nSegmento: ${segmento}` : ''}\n\nMATERIAIS DA VERTHO (referência de objeções):\n${grounding}\n\nGere respostas para o representante usar. JSON:
{"respostas": ["2-3 formas distintas de responder, consultivas e honestas"],
 "pergunta_de_retorno": "uma pergunta para devolver ao cliente e reabrir o diálogo",
 "dica": "orientação curta de postura/timing"}`;

  try {
    const raw = await callAI(SYSTEM, user, {}, 1600);
    const json = await extractJSON(raw);
    if (!json) return { success: false as const, error: 'A IA não retornou um resultado válido. Tente novamente.' };
    return { success: true as const, data: json };
  } catch (e: any) {
    return { success: false as const, error: `Falha ao analisar a objeção: ${e?.message || 'erro'}` };
  }
}
