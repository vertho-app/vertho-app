// O NÚMERO de origem (mig 252): responder sai pelo mesmo número que recebeu.
//
// Três invariantes, todas FALHAM EM SILÊNCIO sem teste:
//   1. `resolverNumeroParaEnvio` decide por ONDE sai — pedido conhecido vai nele,
//      ausente/desconhecido cai no inicial sem exceção (exceção = msg que não sai).
//   2. O envio USA o número na URL (`/{id}/messages`), não o global.
//   3. Telemetria e conteúdo GRAVAM o número efetivo (`from_phone_id`) — sem isso
//      o dash não responde "quantas saíram por cada número".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../../helpers/supabase-mock';

const h = vi.hoisted(() => ({ sb: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async () => undefined,
}));

const { resolverNumeroParaEnvio, rotuloDoNumero } = await import('@/lib/whatsapp/numeros');
const { enviarTextoCloud, enviarTemplateCloud } = await import('@/lib/whatsapp/cloud-api');

const urls: string[] = [];
function stubarFetch() {
  global.fetch = vi.fn(async (url: any) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.NOVA' }] }) } as any;
  }) as any;
}

function novoMock(): SupabaseMock {
  const m = criarSupabaseMock();
  h.sb = m;
  return m;
}

beforeEach(() => {
  urls.length = 0;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '111';
  delete process.env.WHATSAPP_NUMEROS_EXTRA;
  stubarFetch();
});

afterEach(() => {
  delete process.env.META_WHATSAPPBUSINESS_API;
  delete process.env.PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_NUMEROS_EXTRA;
});

describe('resolverNumeroParaEnvio — por qual número sai', () => {
  it('sem pedido cai no inicial (histórico e cadência sem contexto)', () => {
    expect(resolverNumeroParaEnvio(null)).toEqual({ id: '111', caiuNoInicial: true });
    expect(resolverNumeroParaEnvio(undefined)).toEqual({ id: '111', caiuNoInicial: true });
    expect(resolverNumeroParaEnvio('')).toEqual({ id: '111', caiuNoInicial: true });
  });

  it('o próprio inicial não conta como queda', () => {
    expect(resolverNumeroParaEnvio('111')).toEqual({ id: '111', caiuNoInicial: false });
  });

  it('número extra conhecido sai por ele', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: '+55 11 90000-0002', nome: 'Atendimento' }]);
    expect(resolverNumeroParaEnvio('222')).toEqual({ id: '222', caiuNoInicial: false });
  });

  it('número desconhecido cai no inicial em vez de lançar', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: 'x' }]);
    expect(resolverNumeroParaEnvio('999')).toEqual({ id: '111', caiuNoInicial: true });
  });

  it('variável malformada não derruba a resolução', () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = 'não-é-json';
    expect(resolverNumeroParaEnvio('222')).toEqual({ id: '111', caiuNoInicial: true });
  });
});

describe('o envio usa o número na URL e grava por onde saiu', () => {
  it('resposta com numeroId sai pelo número de origem', async () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: '+55 11 90000-0002' }]);
    const sb = novoMock();

    await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' }, { motivo: 'atendimento', numeroId: '222' });

    expect(urls.some((u) => u.includes('/222/messages'))).toBe(true);
    const tel = sb.escritas.find((e) => e.tabela === 'notification_deliveries');
    expect(tel?.payload.from_phone_id).toBe('222');
    const cont = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_enviadas');
    expect(cont?.payload.from_phone_id).toBe('222');
  });

  it('sem numeroId sai pelo inicial e grava o inicial', async () => {
    const sb = novoMock();

    await enviarTextoCloud({ phone: '5511999998888', texto: 'oi' }, { motivo: 'atendimento' });

    expect(urls.some((u) => u.includes('/111/messages'))).toBe(true);
    const tel = sb.escritas.find((e) => e.tabela === 'notification_deliveries');
    expect(tel?.payload.from_phone_id).toBe('111');
  });

  it('template da cadência também pode fixar o número', async () => {
    process.env.WHATSAPP_NUMEROS_EXTRA = JSON.stringify([{ id: '222', rotulo: 'x' }]);
    const sb = novoMock();

    await enviarTemplateCloud(
      { phone: '5511999998888', template: 'registro_desafio', params: ['Ana', '5', 'u'] },
      { motivo: 'desafio', numeroId: '222' },
    );

    expect(urls.some((u) => u.includes('/222/messages'))).toBe(true);
    const cont = sb.escritas.find((e) => e.tabela === 'whatsapp_mensagens_enviadas');
    expect(cont?.payload.from_phone_id).toBe('222');
  });
});

describe('rotuloDoNumero — o que a tela mostra', () => {
  it('NULL é o número inicial, não erro', () => {
    expect(rotuloDoNumero(null)).toBe('número inicial');
  });

  it('id conhecido vira rótulo com nome', () => {
    const cat = [{ id: '222', rotulo: '+55 11 90000-0002', nome: 'Atendimento', inicial: false }];
    expect(rotuloDoNumero('222', cat)).toBe('+55 11 90000-0002 (Atendimento)');
  });

  it('id desconhecido não inventa rótulo', () => {
    expect(rotuloDoNumero('999', [])).toMatch(/^número 999/);
  });
});

describe('thread e caixa carregam o número (sem partir a conversa)', () => {
  it('recebida leva o to_phone_id, enviada leva o from_phone_id', async () => {
    const { montarThread } = await import('@/lib/inbox/thread');
    const itens = montarThread({
      recebidas: [{ id: 'r1', texto: 'oi', tipo: 'text', recebida_em: '2026-09-14T10:00:00Z', numero_id: '222' }],
      enviadas: [{
        id: 's1', texto: 'olá', tipo: 'text', template_nome: null, autor_email: 'e@v.ai',
        origem: 'inbox', erro: null, enviada_em: '2026-09-14T10:01:00Z', wa_message_id: null, numero_id: '222',
      }],
      entregas: [],
    });

    expect(itens.map((i) => i.numeroId)).toEqual(['222', '222']);
  });

  it('histórico sem número vira NULL (número inicial), não lixo', async () => {
    const { montarThread } = await import('@/lib/inbox/thread');
    const itens = montarThread({
      recebidas: [{ id: 'r1', texto: 'oi', tipo: 'text', recebida_em: '2026-09-14T10:00:00Z' }],
      enviadas: [],
      entregas: [{ id: 'e1', kind: 'pilula', sent_at: '2026-09-14T09:00:00Z', provider_status: 'delivered', delivered_at: null, opened_at: null, error: null, provider_message_id: null }],
    });

    expect(itens[0].numeroId).toBeUndefined();
    expect(itens[1].numeroId).toBeNull();
  });

  it('ultimo_numero_id e numeros_ids chegam à tela', async () => {
    const { montarConversas } = await import('@/lib/inbox/caixa');
    const [c] = montarConversas([{
      empresa_id: 'e1',
      from_phone: '5511999998888',
      ultima_em: '2026-09-14T10:01:00Z',
      ultima_recebida_em: '2026-09-14T10:00:00Z',
      total: 1,
      enviadas: 1,
      nao_lidas: 0,
      ultimo_texto: 'olá',
      ultimo_tipo: 'text',
      ultimo_lado: 'equipe',
      colaborador_id: null,
      ambiguidade: null,
      ultimo_numero_id: '222',
      numeros_ids: ['111', '222'],
    }], new Map());

    expect(c.numeroId).toBe('222');
    expect(c.numerosIds).toEqual(['111', '222']);
  });

  it('linha antiga (sem colunas) vira NULL + array vazio, sem explodir', async () => {
    const { montarConversas } = await import('@/lib/inbox/caixa');
    const [c] = montarConversas([{
      empresa_id: 'e1',
      from_phone: '5511999998888',
      ultima_em: '2026-09-14T10:01:00Z',
      total: 1,
      nao_lidas: 0,
      ultimo_texto: 'oi',
      ultimo_tipo: 'text',
      colaborador_id: null,
      ambiguidade: null,
    }], new Map());

    expect(c.numeroId).toBeNull();
    expect(c.numerosIds).toEqual([]);
  });
});
