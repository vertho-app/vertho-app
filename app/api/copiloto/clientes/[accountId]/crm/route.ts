import { NextResponse } from 'next/server';
import { csrfCheck } from '@/lib/csrf';
import { readLimiter } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeOrAdminRequest } from '@/lib/copiloto/auth';
import { findCopilotAccount } from '@/lib/copiloto/accounts';
import { normalizarDataDeAcao } from '@/lib/copiloto/fechamento';
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/sales/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES = new Set<string>(PIPELINE_STAGES);

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Aplica no CRM o que o vendedor aceitou do fechamento da conversa.
 *
 * Rota separada da análise de propósito: salvar o resultado não pode mover a
 * oportunidade sozinho. A conversa PROPÕE (estágio, próxima ação, prazo), a
 * pessoa confirma, e só então o funil muda — mover estágio mexe em pipeline
 * ponderado e comissão.
 *
 * O que entra aqui é o que o vendedor viu na tela, revalidado: estágio precisa
 * existir no enum e a data precisa ser futura, mesmo que a proposta tenha vindo
 * do nosso próprio modelo. `use server` e rota HTTP são a mesma coisa para quem
 * chama de fora.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    const access = await requireRepresentativeOrAdminRequest(req);
    if (access instanceof Response) return access;
    const limited = await readLimiter.check(req, access.email);
    if (limited) return limited;

    const { accountId } = await context.params;
    if (!UUID.test(accountId)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
    const account = await findCopilotAccount(access, accountId);
    if (!account) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
    }

    const opportunityId = clean(body?.opportunityId, 60);
    if (!UUID.test(opportunityId)) {
      return NextResponse.json({ error: 'Escolha a oportunidade que vai receber a atualização' }, { status: 400 });
    }

    const stage = clean(body?.stage, 60);
    const nextAction = clean(body?.nextAction, 300);
    const nextActionDate = normalizarDataDeAcao(body?.nextActionDate);
    if (stage && !STAGES.has(stage)) {
      return NextResponse.json({ error: 'Estágio inválido' }, { status: 400 });
    }
    if (!stage && !nextAction && !nextActionDate) {
      return NextResponse.json({ error: 'Nada para aplicar' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    // A oportunidade precisa ser DESTA conta: o accountId já passou pelo gate de
    // posse, e sem esta amarra um id de outro representante entraria pelo corpo.
    const { data: opportunity, error: readError } = await sb.from('sales_opportunities')
      .select('id, stage, next_action, next_action_date')
      .eq('id', opportunityId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (readError) {
      console.error('[copiloto/crm] leitura:', readError.message);
      return NextResponse.json({ error: 'Falha ao ler a oportunidade' }, { status: 502 });
    }
    if (!opportunity) {
      return NextResponse.json({ error: 'A oportunidade não pertence a este cliente' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (stage) patch.stage = stage as PipelineStage;
    if (nextAction) patch.next_action = nextAction;
    if (nextActionDate) patch.next_action_date = nextActionDate;

    const { data: updated, error } = await sb.from('sales_opportunities')
      .update(patch)
      .eq('id', opportunityId)
      .eq('account_id', accountId)
      .select('id, stage, next_action, next_action_date')
      .single();
    if (error || !updated) {
      console.error('[copiloto/crm] update:', error?.message);
      return NextResponse.json({ error: 'Não foi possível atualizar a oportunidade' }, { status: 502 });
    }

    // Rastro de quem mudou o quê: o histórico da conta é onde alguém vai
    // procurar quando o estágio "andou sozinho".
    const mudancas = [
      stage && stage !== opportunity.stage ? `estágio: ${opportunity.stage} → ${stage}` : '',
      nextAction ? `próxima ação: ${nextAction}` : '',
      nextActionDate ? `prazo: ${nextActionDate}` : '',
    ].filter(Boolean).join(' | ');
    const { error: noteError } = await sb.from('sales_activity_notes').insert({
      representante_id: account.representante_id,
      opportunity_id: opportunityId,
      account_id: accountId,
      note: `Copiloto PACE — atualização aplicada pelo vendedor: ${mudancas}`,
      kind: 'nota',
      created_by_email: access.email,
    });
    if (noteError) console.warn('[copiloto/crm] nota não registrada:', noteError.message);

    return NextResponse.json({ opportunity: updated });
  } catch (error: any) {
    console.error('[copiloto/crm]', error?.message || error);
    return NextResponse.json({ error: 'Não foi possível atualizar o CRM agora.' }, { status: 502 });
  }
}
