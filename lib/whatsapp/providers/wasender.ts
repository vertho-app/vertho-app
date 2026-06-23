// Adapter WaSenderApi (não-oficial, QR) — plano B / backup de envio.
// REST: POST {BASE}/api/send-message  ·  Authorization: Bearer {key}
//   texto:     { to: "+55...", text: "..." }
//   documento: { to, document: { url }, fileName }   (exige URL pública)
//   áudio:     { to, audio: { url } }
//   link:      sem endpoint dedicado → vai como texto (WhatsApp gera o preview)
// Saúde: GET {BASE}/api/status
import type { WaMessage, WaProvider, WaSendOutcome } from '../types';

const BASE = (process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com').replace(/\/+$/, '');
const key = () => process.env.WASENDER_API_KEY || '';
const to = (phone: string) => '+' + phone.replace(/\D/g, '');

async function post(path: string, body: unknown): Promise<WaSendOutcome> {
  if (!key()) return { ok: false, reason: 'WaSender não configurado' };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 150);
      return { ok: false, status: res.status, reason: `WaSender HTTP ${res.status}${detail ? ': ' + detail : ''}` };
    }
    return { ok: true, status: res.status, data: await res.json().catch(() => null) };
  } catch (e: any) {
    return { ok: false, reason: `WaSender rede: ${String(e?.message || e).slice(0, 150)}` };
  }
}

export const wasenderProvider: WaProvider = {
  id: 'wasender',
  label: 'WaSender',
  capabilities: { text: true, link: true, document: true, audio: true },
  configured: () => Boolean(key()),
  async health() {
    if (!key()) return { ok: false, reason: 'não configurado' };
    try {
      const res = await fetch(`${BASE}/api/status`, {
        headers: { Authorization: `Bearer ${key()}` },
        cache: 'no-store',
      });
      if (!res.ok) return { ok: false, reason: `status HTTP ${res.status}` };
      const j: any = await res.json().catch(() => null);
      // tolera formatos: { status:'connected' } | { connected:true } | { data:{ status } }
      const st = j?.status ?? j?.data?.status;
      const connected = st === 'connected' || j?.connected === true || j?.data?.connected === true;
      return connected ? { ok: true } : { ok: false, reason: `status=${st ?? 'desconhecido'}` };
    } catch (e: any) {
      return { ok: false, reason: `status rede: ${String(e?.message || e).slice(0, 120)}` };
    }
  },
  async send(msg) {
    switch (msg.kind) {
      case 'text':
        return post('/api/send-message', { to: to(msg.phone), text: msg.text });
      case 'link':
        return post('/api/send-message', {
          to: to(msg.phone),
          text: [msg.title, msg.text, msg.url].filter(Boolean).join('\n'),
        });
      case 'document':
        if (!msg.url) return { ok: false, reason: 'WaSender exige URL pública para documento (base64 não suportado)' };
        return post('/api/send-message', { to: to(msg.phone), document: { url: msg.url }, fileName: msg.filename });
      case 'audio':
        return post('/api/send-message', { to: to(msg.phone), audio: { url: msg.url } });
    }
  },
};
