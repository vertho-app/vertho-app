import { NextResponse } from 'next/server';

export async function GET() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || '';

  if (!instanceId || !token) {
    return NextResponse.json({ error: 'Z-API não configurado', instanceId: !!instanceId, token: !!token });
  }

  try {
    // Testar primeiro se a instância existe
    const statusRes = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/status`, {
      headers: { 'Client-Token': clientToken },
    });
    const statusBody = await statusRes.text();

    const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
      body: JSON.stringify({ phone: '5511973882303', message: 'Teste Vertho - se recebeu, Z-API está OK!' }),
    });

    const body = await res.text();
    return NextResponse.json({
      instanceId, tokenLen: token.length, clientTokenLen: clientToken.length,
      statusCheck: { status: statusRes.status, body: statusBody },
      sendResult: { status: res.status, ok: res.ok, body },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
