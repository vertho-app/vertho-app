import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Registro da abertura verificada do convite B (`/auth/degustacao/abertura`).
 *
 * `Medido 16/09/2026`: na versão A o "acesso" era carimbado pelo GET que o robô
 * de preview do WhatsApp também faz. Aqui só um POST de página (mesmo host, passe
 * válido, sessão viva) escreve, e o robô que chegasse a postar é barrado pelo
 * user agent. A resposta é sempre 204: ela não ensina nada a quem testa passes.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'bbbbbbbbbbbbbbbbbbbb';
const HOST = 'acme-demo.vertho.ai';
const NAVEGADOR = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';

let sessao: any = null;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'demo_prospect_sessions' ? sessao : null),
});
sb.client.auth = { admin: {} };
sb.client.rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => (slug === 'acme-demo' ? { id: 'acme-demo-id', slug } : null)),
}));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null } }));

import { POST } from '@/app/auth/degustacao/abertura/route';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';

const passe = () => emitirPasseDegustacao('acme-demo', SID, Math.floor(Date.now() / 1000) + 86_400);

function beacon({ ua = NAVEGADOR, origin = `https://${HOST}`, corpo }: { ua?: string; origin?: string; corpo?: unknown } = {}) {
  return new NextRequest(`https://${HOST}/auth/degustacao/abertura`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua, origin },
    body: JSON.stringify(corpo ?? { passe: passe() }),
  });
}

describe('registro da abertura do convite B', () => {
  beforeEach(() => {
    sb.reset();
    sessao = {
      invite_opened_at: null,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
    };
  });

  it('navegador de verdade, no mesmo host: um update escopado, só se ainda não havia abertura', async () => {
    const res = await POST(beacon());
    expect(res.status).toBe(204);
    const updates = sb.escritas.filter((e) => e.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ tabela: 'demo_prospect_sessions', payload: { invite_opened_at: expect.any(String) } });
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
    expect(sb.usou('demo_prospect_sessions', 'eq', 'session_id')).toBe(true);
    expect(sb.usou('demo_prospect_sessions', 'is', 'invite_opened_at')).toBe(true);
  });

  it('🔴 robô de preview não escreve, mesmo com passe válido e origem certa', async () => {
    for (const ua of ['WhatsApp/2.2449.4 A', 'facebookexternalhit/1.1', 'TelegramBot (like TwitterBot)']) {
      expect((await POST(beacon({ ua }))).status).toBe(204);
    }
    expect(sb.escritas).toHaveLength(0);
  });

  it('origem de outro host, passe forjado ou corpo quebrado: 204 e nada escrito', async () => {
    expect((await POST(beacon({ origin: 'https://rh-demo.vertho.ai' }))).status).toBe(204);
    expect((await POST(beacon({ corpo: { passe: 'forjado.x' } }))).status).toBe(204);
    const quebrado = new NextRequest(`https://${HOST}/auth/degustacao/abertura`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': NAVEGADOR, origin: `https://${HOST}` },
      body: '{nao-e-json',
    });
    expect((await POST(quebrado)).status).toBe(204);
    expect(sb.escritas).toHaveLength(0);
  });

  it('abertura já registrada não é reescrita; sessão vencida não registra', async () => {
    sessao = { ...sessao, invite_opened_at: '2026-09-16T12:00:00.000Z' };
    await POST(beacon());
    sessao = { ...sessao, invite_opened_at: null, expires_at: new Date(Date.now() - 1_000).toISOString() };
    await POST(beacon());
    expect(sb.escritas).toHaveLength(0);
  });
});
