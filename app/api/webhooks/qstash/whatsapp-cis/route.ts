import { NextResponse } from 'next/server';

/**
 * Webhook chamado pelo QStash para enviar um link CIS individual via WhatsApp.
 * Valida assinatura QStash (Receiver manual/lazy), chama Z-API, retorna 200 ou 500 (retry).
 */

// Lazy Receiver — só instancia se as keys existirem
async function verifyQStashSignature(req, body) {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey || !nextKey) {
    console.warn('[qstash/whatsapp-cis] Signing keys não configuradas, pulando verificação');
    return true;
  }

  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get('upstash-signature') || '';
    await receiver.verify({ signature, body });
    return true;
  } catch (err) {
    console.error('[qstash/whatsapp-cis] Assinatura inválida:', err.message);
    return false;
  }
}

export async function POST(req) {
  try {
    const rawBody = await req.text();

    // Verificar assinatura
    const valid = await verifyQStashSignature(req, rawBody);
    if (!valid) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { telefone, mensagem } = payload;

    if (!telefone || !mensagem) {
      return NextResponse.json({ error: 'telefone e mensagem obrigatórios' }, { status: 400 });
    }

    // Enviar via Z-API
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const token = process.env.ZAPI_TOKEN;
    const clientToken = process.env.ZAPI_CLIENT_TOKEN || '';

    if (!instanceId || !token) {
      return NextResponse.json({ error: 'Z-API não configurado' }, { status: 500 });
    }

    let phone = telefone.replace(/\D/g, '');
    if (phone.length <= 11) phone = `55${phone}`;

    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
      body: JSON.stringify({ phone, message: mensagem }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[qstash/whatsapp-cis] Z-API ${res.status}: ${detail}`);
      // Retorna 500 para QStash fazer retry automático
      return NextResponse.json({ error: `Z-API ${res.status}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[qstash/whatsapp-cis] Erro:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
