import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { verifyZapiWebhook } from '@/lib/zapi-webhook';

export async function POST(req: Request) {
  try {
    // S2: shared-secret hardening (Z-API não assina o payload nem manda header).
    // Secret obrigatório em produção, via header OU querystring, timing-safe,
    // valida instância (ZAPI_INSTANCE_ID) e exige JSON de objeto.
    const check = await verifyZapiWebhook(req);
    if (!check.ok) {
      console.warn('[zapi/disconnected] recusado:', check.reason);
      return NextResponse.json({ error: 'unauthorized' }, { status: check.status });
    }
    const payload = check.payload;

    const sb = createSupabaseAdmin();
    await sb.from('admin_audit_log').insert({
      admin_email: 'sistema@vertho.ai',
      acao: 'whatsapp.zapi_disconnected',
      alvo: payload?.instanceId || process.env.ZAPI_INSTANCE_ID || null,
      detalhes: {
        provider: 'z-api',
        disconnected: payload?.disconnected ?? true,
        error: payload?.error || null,
        type: payload?.type || null,
        momment: payload?.momment || null,
        instanceId: payload?.instanceId || null,
      },
      resultado: 'erro',
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[zapi/disconnected]', err?.message || err);
    return NextResponse.json({ error: err?.message || 'erro' }, { status: 500 });
  }
}
