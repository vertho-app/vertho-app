import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-94 (04/10/2026): o `failed` da Meta reabre o envio da cadência.
 *
 * A Cloud API aceita o template na hora e o cron carimba o canal. Se a Meta reportava
 * `failed` depois, o webhook só gravava `failed_at` e o carimbo seguia dizendo "entregue":
 * o envio nunca voltava a ser pendente, a recuperação não tinha o que refazer e a pessoa
 * ficava sem a mensagem. Agora `failed` apaga o carimbo daquela coluna (só o carimbo DESTE
 * envio), e a janela de recuperação refaz.
 */

const h = vi.hoisted(() => ({ sb: null as any, degradacao: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/degradacao', async (orig) => ({ ...(await orig<any>()), registrarDegradacao: h.degradacao }));
vi.mock('@/lib/notifications/inbox-push', () => ({ fanoutInboxPush: vi.fn() }));
vi.mock('@/lib/notifications/ver-gestor', () => ({
  ehPedidoDeResumo: () => false, ehRecusa: () => false, responderPedidoDeResumo: vi.fn(), TEXTO_RECUSA: '',
}));
vi.mock('@/lib/whatsapp/cloud-api', () => ({ enviarTextoCloud: vi.fn() }));
vi.mock('@/lib/inbox/midia-recebida', () => ({ guardarMidiaRecebida: vi.fn() }));
vi.mock('@/lib/whatsapp/suporte-auto', () => ({ executarSuporteAuto: vi.fn() }));

import {
  carimboDaEntrega, falhaPermanente, reabrirEnvioPorFalha, CODIGOS_FALHA_PERMANENTE,
} from '@/lib/whatsapp/reabrir-envio';

const ENVIO = '4f2f9d0e-8f0c-4d63-9f6e-0b7a8a1c2d33';
const CRIADA = '2026-11-09T11:02:00.000Z';
const registros = () => h.degradacao.mock.calls.map((c: any[]) => c[0]);

describe('carimboDaEntrega: qual carimbo uma entrega de cadência ocupa', () => {
  it('lê a coluna do dedupe de cada papel', () => {
    expect(carimboDaEntrega(`ultima_pilula1_whatsapp_em:${ENVIO}`)).toEqual({ coluna: 'ultima_pilula1_whatsapp_em', envioId: ENVIO });
    expect(carimboDaEntrega(`ultima_pilula2_whatsapp_em:${ENVIO}`)).toEqual({ coluna: 'ultima_pilula2_whatsapp_em', envioId: ENVIO });
    expect(carimboDaEntrega(`ultima_evidencia_whatsapp_em:${ENVIO}`)).toEqual({ coluna: 'ultima_evidencia_whatsapp_em', envioId: ENVIO });
    expect(carimboDaEntrega(`missao:${ENVIO}`)).toEqual({ coluna: 'ultima_pilula1_whatsapp_em', envioId: ENVIO });
    expect(carimboDaEntrega(`avaliacao-final:${ENVIO}:7`)).toEqual({ coluna: 'ultima_pilula1_whatsapp_em', envioId: ENVIO });
    expect(carimboDaEntrega(`pendencia:${ENVIO}:2026-11-10`)).toEqual({ coluna: 'ultima_pilula2_whatsapp_em', envioId: ENVIO });
  });

  it('o que não é de cadência não tem carimbo a reabrir (login, nudge de inatividade, push, lixo)', () => {
    for (const k of [null, undefined, '', 'beto-acesso:wamid.X', `nudge:${ENVIO}:2026-11-12`, 'missao:nao-e-uuid', `pendencia-push:${ENVIO}:x`, 'ultima_pilula9_whatsapp_em:' + ENVIO]) {
      expect(carimboDaEntrega(k as any), String(k)).toBeNull();
    }
  });
});

describe('falhaPermanente: o problema é do destino, repetir não ajuda', () => {
  it('os códigos de destino inválido não reabrem', () => {
    for (const c of CODIGOS_FALHA_PERMANENTE) expect(falhaPermanente(`Message undeliverable (${c})`), c).toBe(true);
  });
  it('o resto (template pausado, taxa, erro genérico, sem código) é tentado de novo', () => {
    for (const e of ['Template paused (132015)', 'Rate limit hit (130429)', 'Something went wrong (131000)', 'erro sem código', null, undefined]) {
      expect(falhaPermanente(e as any), String(e)).toBe(false);
    }
  });
});

describe('reabrirEnvioPorFalha', () => {
  beforeEach(() => {
    h.degradacao.mockReset();
    h.sb = criarSupabaseMock({ escrita: (tabela) => (tabela === 'fase4_envios' ? [{ id: ENVIO }] : null) });
  });
  const entrega = { id: 'd1', dedupe_key: `ultima_pilula1_whatsapp_em:${ENVIO}`, empresa_id: 'emp-1', created_at: CRIADA };

  it('🔴 `failed` apaga o carimbo do canal, escopado ao envio e à empresa, só se for o carimbo DESTE envio', async () => {
    const r = await reabrirEnvioPorFalha(h.sb.client, entrega, 'Template paused (132015)');
    expect(r).toBe('reaberto');
    const escrita = h.sb.escritas.find((e: any) => e.tabela === 'fase4_envios');
    expect(escrita.payload).toEqual({ ultima_pilula1_whatsapp_em: null });
    expect(h.sb.usou('fase4_envios', 'eq', 'id')).toBe(true);
    expect(h.sb.usou('fase4_envios', 'eq', 'empresa_id')).toBe(true);
    // O carimbo posterior (a recuperação que deu certo) NÃO é apagado por um `failed` atrasado.
    const lte = h.sb.chamadas.find((c: any) => c.tabela === 'fase4_envios' && c.metodo === 'lte');
    expect(lte.args[0]).toBe('ultima_pilula1_whatsapp_em');
    expect(Date.parse(lte.args[1])).toBe(Date.parse(CRIADA) + 10 * 60_000);
    expect(registros()[0]).toMatchObject({ fluxo: 'envio', tipo: 'whatsapp-falha-de-entrega', chave: `${ENVIO}:ultima_pilula1_whatsapp_em`, severidade: 'aviso' });
    expect(registros()[0].detalhe.estado).toBe('reaberto');
  });

  it('🔴 falha do DESTINO (número sem WhatsApp) NÃO reabre, mas fica registrada para o cadastro', async () => {
    const r = await reabrirEnvioPorFalha(h.sb.client, entrega, 'Message undeliverable (131026)');
    expect(r).toBe('permanente');
    expect(h.sb.escritas.filter((e: any) => e.tabela === 'fase4_envios')).toHaveLength(0);
    expect(registros()[0].detalhe).toMatchObject({ estado: 'permanente' });
  });

  it('carimbo que já não é deste envio (nada casa): nada a reabrir, sem registro', async () => {
    h.sb = criarSupabaseMock({ escrita: () => [] });
    expect(await reabrirEnvioPorFalha(h.sb.client, entrega, 'x (131000)')).toBe('nao-aplica');
    expect(registros()).toHaveLength(0);
  });

  it('entrega que não é de cadência, ou sem empresa: não toca em nada', async () => {
    expect(await reabrirEnvioPorFalha(h.sb.client, { ...entrega, dedupe_key: 'beto-acesso:wamid.X' }, 'e')).toBe('nao-aplica');
    expect(await reabrirEnvioPorFalha(h.sb.client, { ...entrega, empresa_id: null }, 'e')).toBe('nao-aplica');
    expect(h.sb.escritas).toHaveLength(0);
  });

  it('a escrita que falha volta `falhou` e registra, SEM lançar (o webhook responde 200 sempre)', async () => {
    h.sb.falharEm({ tabela: 'fase4_envios', op: 'update', mensagem: 'timeout no pool' });
    expect(await reabrirEnvioPorFalha(h.sb.client, entrega, 'x (131000)')).toBe('falhou');
    expect(registros()[0].detalhe).toMatchObject({ estado: 'nao-reaberto' });
    expect(registros()[0].detalhe.motivo).toContain('timeout no pool');
  });
});

describe('o webhook aplica o `failed`', () => {
  const SEGREDO = 'segredo-de-teste';

  const post = async (status: string, errors?: any[]) => {
    const corpo = JSON.stringify({
      entry: [{ id: 'waba-1', changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: 'pn-1' },
        statuses: [{ id: 'wamid.ABC', status, timestamp: '1786620000', ...(errors ? { errors } : {}) }],
      } }] }],
    });
    const assinatura = 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(corpo, 'utf8').digest('hex');
    const { POST } = await import('@/app/api/webhooks/whatsapp-cloud/route');
    return POST(new Request('https://app.vertho.ai/api/webhooks/whatsapp-cloud', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura }, body: corpo,
    }));
  };

  beforeEach(() => {
    process.env.META_APP_SECRET = SEGREDO;
    h.degradacao.mockReset();
    h.sb = criarSupabaseMock({
      escrita: (tabela) => {
        if (tabela === 'notification_deliveries') return [{ id: 'd1', dedupe_key: `ultima_pilula1_whatsapp_em:${ENVIO}`, empresa_id: 'emp-1', created_at: CRIADA }];
        if (tabela === 'fase4_envios') return [{ id: ENVIO }];
        return null;
      },
    });
  });

  it('🔴 `failed` registra a falha na entrega E apaga o carimbo do envio', async () => {
    const res = await post('failed', [{ code: 132015, title: 'Template paused' }]);
    expect(res.status).toBe(200);
    const entrega = h.sb.escritas.find((e: any) => e.tabela === 'notification_deliveries');
    expect(entrega.payload.failed_at).toBeTruthy();
    const reabre = h.sb.escritas.find((e: any) => e.tabela === 'fase4_envios');
    expect(reabre.payload).toEqual({ ultima_pilula1_whatsapp_em: null });
  });

  it('`delivered` e `read` NÃO tocam no carimbo', async () => {
    for (const status of ['delivered', 'read']) {
      h.sb.reset();
      expect((await post(status)).status).toBe(200);
      expect(h.sb.escritas.filter((e: any) => e.tabela === 'fase4_envios'), status).toHaveLength(0);
    }
  });

  it('`failed` por número sem WhatsApp não reabre', async () => {
    const res = await post('failed', [{ code: 131026, title: 'Message undeliverable' }]);
    expect(res.status).toBe(200);
    expect(h.sb.escritas.filter((e: any) => e.tabela === 'fase4_envios')).toHaveLength(0);
  });

  it('a reabertura que falha não derruba o webhook: 200 sempre', async () => {
    h.sb.falharEm({ tabela: 'fase4_envios', op: 'update', mensagem: 'timeout no pool' });
    expect((await post('failed', [{ code: 131000, title: 'Something went wrong' }])).status).toBe(200);
  });
});
