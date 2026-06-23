// Adapter Z-API (não-oficial, QR). Reusa a config/saúde já existentes em
// lib/zapi.ts. Mantém EXATAMENTE os endpoints/payloads que o app já usava,
// para não mudar o comportamento de envio ao centralizar.
import { getZapiConfig, getZapiStatus } from '@/lib/zapi';
import type { WaMessage, WaProvider, WaSendOutcome } from '../types';

const headers = () => ({
  'Content-Type': 'application/json',
  'Client-Token': process.env.ZAPI_CLIENT_TOKEN || '',
});

const digits = (phone: string) => phone.replace(/\D/g, '');

async function post(path: string, body: unknown): Promise<WaSendOutcome> {
  const cfg = getZapiConfig();
  if (!cfg.configured) return { ok: false, reason: 'Z-API não configurada' };
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 150);
      return { ok: false, status: res.status, reason: `Z-API HTTP ${res.status}${detail ? ': ' + detail : ''}` };
    }
    return { ok: true, status: res.status, data: await res.json().catch(() => null) };
  } catch (e: any) {
    return { ok: false, reason: `Z-API rede: ${String(e?.message || e).slice(0, 150)}` };
  }
}

export const zapiProvider: WaProvider = {
  id: 'zapi',
  label: 'Z-API',
  capabilities: { text: true, link: true, document: true, audio: true },
  configured: () => getZapiConfig().configured,
  async health() {
    const s = await getZapiStatus();
    if (!s.configured) return { ok: false, reason: s.error || 'não configurada' };
    // connected + smartphoneConnected é o sinal operacional mais confiável
    // (session pode vir false mesmo conectada) — mesma regra de assertZapiConnected.
    if (!s.connected || !s.smartphoneConnected) {
      return { ok: false, reason: `desconectada (connected=${s.connected}, smartphone=${s.smartphoneConnected})` };
    }
    return { ok: true };
  },
  async send(msg) {
    const phone = digits(msg.phone);
    switch (msg.kind) {
      case 'text':
        return post('/send-text', { phone, message: msg.text });
      case 'link':
        return post('/send-link', {
          phone,
          message: msg.text || msg.title || '',
          linkUrl: msg.url,
          title: msg.title || 'Vertho Mentor IA',
          linkDescription: '',
        });
      case 'document':
        return post(`/send-document/${phone}`, msg.base64
          ? { phone, document: `data:application/pdf;base64,${msg.base64}`, fileName: msg.filename }
          : { phone, document: msg.url, fileName: msg.filename });
      case 'audio':
        return post('/send-audio', { phone, audio: msg.url });
    }
  },
};
