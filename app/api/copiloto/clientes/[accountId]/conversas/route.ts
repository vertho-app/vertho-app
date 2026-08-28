import { NextResponse } from 'next/server';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { createSupabaseAdmin } from '@/lib/supabase';
import { findCopilotAccount, normalizeConversationRow } from '@/lib/copiloto/accounts';
import { analyzeCopilotConversation } from '@/lib/copiloto/conversation-analysis';
import { requireRepresentativeOrAdminRequest } from '@/lib/copiloto/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function POST(
  req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    const access = await requireRepresentativeOrAdminRequest(req);
    if (access instanceof Response) return access;
    const limited = await aiLimiter.check(req, access.email);
    if (limited) return limited;

    const { accountId } = await context.params;
    if (!UUID.test(accountId)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
    const account = await findCopilotAccount(access, accountId);
    if (!account) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

    const body = await req.json();
    const transcript = clean(body?.transcript, 30000);
    const opportunityId = clean(body?.opportunityId, 60);
    const planningId = clean(body?.planningId, 60);
    const source = body?.source === 'whisper_local' || body?.source === 'supernormal' || body?.source === 'manual'
      ? body.source
      : 'paste';
    const happenedAt = validDate(body?.happenedAt);
    const fallbackTitle = `Conversa de ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(happenedAt))}`;
    const title = clean(body?.title, 180) || fallbackTitle;
    if (transcript.length < 20) {
      return NextResponse.json({ error: 'Cole uma transcrição com pelo menos 20 caracteres' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    let opportunity: any = null;
    let planning: any = null;
    if (opportunityId) {
      if (!UUID.test(opportunityId)) return NextResponse.json({ error: 'Oportunidade inválida' }, { status: 400 });
      const { data } = await sb.from('sales_opportunities')
        .select('id, opportunity_name, stage, identified_need, next_action, next_action_date, objections, competitors')
        .eq('id', opportunityId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: 'A oportunidade não pertence a este cliente' }, { status: 400 });
      opportunity = data;
    }
    if (planningId) {
      if (!UUID.test(planningId)) return NextResponse.json({ error: 'Planejamento inválido' }, { status: 400 });
      const { data, error: planningError } = await sb.from('copilot_plans')
        .select('id, opportunity_id, conversation_id')
        .eq('id', planningId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (planningError) throw new Error(planningError.message);
      if (!data) return NextResponse.json({ error: 'O planejamento não pertence a esta empresa' }, { status: 400 });
      if (data.conversation_id) {
        return NextResponse.json({ error: 'Este planejamento já possui um resultado salvo' }, { status: 409 });
      }
      planning = data;
    }

    const [{ data: previousRows }, { data: activityRows }] = await Promise.all([
      sb.from('copilot_conversations')
        .select('title, happened_at, summary, analysis')
        .eq('account_id', accountId)
        .order('happened_at', { ascending: false })
        .limit(8),
      sb.from('sales_activity_notes')
        .select('note, kind, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    const conversationContext = (previousRows || []).map((row: any) => {
      const memory = row.analysis?.memory ? JSON.stringify(row.analysis.memory) : '';
      return `${row.happened_at} — ${row.title}\nResumo: ${row.summary}\nMemória: ${memory}`;
    }).join('\n\n');
    const activityContext = (activityRows || [])
      .filter((row: any) => !String(row.note || '').startsWith('Copiloto PACE —'))
      .map((row: any) => `${row.created_at} — ${row.kind || 'nota'}: ${row.note}`)
      .join('\n');
    const previousContext = [conversationContext, activityContext ? `Registros do CRM:\n${activityContext}` : '']
      .filter(Boolean).join('\n\n').slice(0, 14000);

    const crmContext = [
      account.notes ? `Notas da conta: ${account.notes}` : '',
      opportunity ? `Oportunidade: ${opportunity.opportunity_name} | estágio: ${opportunity.stage}` : '',
      opportunity?.identified_need ? `Necessidade registrada: ${opportunity.identified_need}` : '',
      opportunity?.next_action ? `Próxima ação no CRM: ${opportunity.next_action}` : '',
      opportunity?.objections ? `Objeções no CRM: ${opportunity.objections}` : '',
      opportunity?.competitors ? `Concorrentes no CRM: ${opportunity.competitors}` : '',
    ].filter(Boolean).join('\n');

    const accountName = account.trade_name || account.legal_name;
    const { summary, analysis } = await analyzeCopilotConversation({
      accountName, crmContext, previousContext, transcript,
    });

    const { data: inserted, error } = await sb.from('copilot_conversations').insert({
      account_id: accountId,
      opportunity_id: opportunity?.id || null,
      representante_id: account.representante_id,
      title,
      happened_at: happenedAt,
      source,
      transcript,
      summary,
      analysis,
      created_by_email: access.email,
    }).select('*').single();
    if (error || !inserted) throw new Error(error?.message || 'falha ao salvar conversa');

    if (planning) {
      const { error: linkError } = await sb.from('copilot_plans')
        .update({ conversation_id: inserted.id, updated_at: new Date().toISOString() })
        .eq('id', planning.id)
        .eq('account_id', accountId)
        .is('conversation_id', null);
      if (linkError) {
        console.warn('[copiloto/conversas] resultado salvo sem ligação ao planejamento:', linkError.message);
      }
    }

    await Promise.all([
      sb.from('sales_activity_notes').insert({
        representante_id: account.representante_id,
        opportunity_id: opportunity?.id || null,
        account_id: accountId,
        note: `Copiloto PACE — ${title}: ${summary.slice(0, 700)}`,
        kind: 'nota',
        created_by_email: access.email,
      }),
      sb.from('sales_accounts').update({ updated_at: new Date().toISOString() }).eq('id', accountId),
    ]);

    return NextResponse.json({ conversation: normalizeConversationRow(inserted) });
  } catch (error: any) {
    console.error('[copiloto/conversas]', error?.message || error);
    return NextResponse.json({ error: 'Não foi possível analisar e salvar a conversa agora.' }, { status: 502 });
  }
}
