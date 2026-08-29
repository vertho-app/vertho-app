import { NextResponse } from 'next/server';
import { csrfCheck } from '@/lib/csrf';
import { createRateLimiter } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase';
import { findCopilotAccount, normalizePlanRow } from '@/lib/copiloto/accounts';
import { requireRepresentativeOrAdminRequest } from '@/lib/copiloto/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const saveLimiter = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
    const limited = await saveLimiter.check(req, access.email);
    if (limited) return limited;

    const { accountId } = await context.params;
    if (!UUID.test(accountId)) return NextResponse.json({ error: 'Empresa inválida' }, { status: 400 });
    const account = await findCopilotAccount(access, accountId);
    if (!account) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const body = await req.json();
    const plan = body?.plan && typeof body.plan === 'object' && !Array.isArray(body.plan) ? body.plan : null;
    if (!plan || !clean(plan.companyIdentified, 240) || !Array.isArray(plan.questions)) {
      return NextResponse.json({ error: 'Planejamento inválido' }, { status: 400 });
    }
    if (JSON.stringify(plan).length > 180_000) {
      return NextResponse.json({ error: 'Planejamento excede o limite de armazenamento' }, { status: 413 });
    }

    const opportunityId = clean(body?.opportunityId, 60);
    if (opportunityId && !UUID.test(opportunityId)) {
      return NextResponse.json({ error: 'Oportunidade inválida' }, { status: 400 });
    }
    if (opportunityId) {
      const { data, error: opportunityError } = await createSupabaseAdmin().from('sales_opportunities')
        .select('id').eq('id', opportunityId).eq('account_id', accountId).maybeSingle();
      if (opportunityError) throw new Error(opportunityError.message);
      if (!data) return NextResponse.json({ error: 'A oportunidade não pertence a esta empresa' }, { status: 400 });
    }

    const inputs = {
      company: clean(body?.inputs?.company, 240),
      site: clean(body?.inputs?.site, 1000),
      socialProfiles: clean(body?.inputs?.socialProfiles, 5000),
      context: clean(body?.inputs?.context, 30000),
      offer: clean(body?.inputs?.offer, 12000),
      opportunityId,
    };
    const { data, error } = await createSupabaseAdmin().from('copilot_plans').insert({
      account_id: accountId,
      opportunity_id: opportunityId || null,
      representante_id: account.representante_id,
      plan,
      inputs,
      created_by_email: access.email,
    }).select('*').single();
    if (error || !data) throw new Error(error?.message || 'falha ao salvar planejamento');

    return NextResponse.json({ planning: normalizePlanRow(data) });
  } catch (error: any) {
    console.error('[copiloto/planejamentos]', error?.message || error);
    return NextResponse.json({ error: 'Não foi possível salvar o planejamento agora.' }, { status: 502 });
  }
}
