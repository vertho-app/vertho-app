// Mídia recebida pelo WhatsApp: a cópia no nosso Storage (17/09/2026).
//
// A Meta apaga a mídia recebida em poucos dias. Medido: 19 de 23 mídias davam
// `400 (#100/33)`, a mais nova com 7 dias e meio. A caixa guardava só o id e mostrava imagem
// quebrada e áudio "0:00" sem explicação. Estes testes guardam as três partes
// do conserto: o webhook copia quando a mensagem chega, a rota serve a cópia
// antes de ir à Meta, e o que não existe mais vira frase (410), não ícone
// quebrado. E a legenda, que ficava só no `raw`, chega à tela.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const SEGREDO = 'segredo-de-teste';

const h = vi.hoisted(() => ({
  sb: null as any,
  degradacoes: [] as any[],
  autorizado: true,
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.sb }));
vi.mock('@/lib/authz-plataforma', () => ({
  checarAcessoPlataforma: async () =>
    h.autorizado ? { authorized: true, email: 'equipe@vertho.ai' } : { authorized: false, reason: 'unauthorized' },
}));
vi.mock('@/lib/notifications/delivery-log', () => ({ registrarEntrega: async () => {} }));
vi.mock('@/lib/notifications/inbox-push', () => ({ fanoutInboxPush: async () => {} }));
// `after()` roda na hora: o teste quer o EFEITO, não o adiamento.
vi.mock('next/server', async (orig) => ({
  ...(await orig<any>()),
  after: (fn: any) => { if (typeof fn === 'function') return fn(); },
}));
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<any>()),
  registrarDegradacao: async (d: any) => { h.degradacoes.push(d); },
}));

const { guardarMidiaRecebida, caminhoDaMidia, BUCKET_MIDIA_RECEBIDA, MENSAGEM_MIDIA_EXPIRADA } =
  await import('@/lib/inbox/midia-recebida');
const { urlDaMidia } = await import('@/lib/whatsapp/cloud-api');
const { GET: GET_MIDIA } = await import('@/app/api/inbox/midia/[mediaId]/route');
const { POST: POST_WEBHOOK } = await import('@/app/api/webhooks/whatsapp-cloud/route');
const { montarThread } = await import('@/lib/inbox/thread');

// ── Fakes ────────────────────────────────────────────────────────────────────

/** Storage em memória: o que foi gravado fica, e assinar o que não existe falha. */
function storageFake(opts: { uploadErro?: { message: string; statusCode?: string } } = {}) {
  const objetos = new Map<string, { contentType: string }>();
  const uploads: Array<{ bucket: string; path: string; opts: any }> = [];
  const assinaturas: string[] = [];
  const storage = {
    from: (bucket: string) => ({
      upload: vi.fn(async (path: string, _body: any, o: any) => {
        uploads.push({ bucket, path, opts: o });
        if (opts.uploadErro) return { data: null, error: opts.uploadErro };
        if (objetos.has(`${bucket}/${path}`)) {
          return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
        }
        objetos.set(`${bucket}/${path}`, { contentType: o?.contentType });
        return { data: { path }, error: null };
      }),
      createSignedUrl: vi.fn(async (path: string) => {
        assinaturas.push(`${bucket}/${path}`);
        return objetos.has(`${bucket}/${path}`)
          ? { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t` }, error: null }
          : { data: null, error: { message: 'Object not found' } };
      }),
    }),
  };
  return { storage, objetos, uploads, assinaturas };
}

type Graph = 'ok' | 'expirada' | 'erro-5xx';
const chamadasGraph: string[] = [];

/** A Graph como ela responde: metadados com `url`, e o download com o binário. */
function stubarMeta(estado: Graph, mime = 'audio/ogg; codecs=opus') {
  global.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    chamadasGraph.push(u);
    if (u.startsWith('https://lookaside.test/')) {
      return {
        ok: true, status: 200,
        headers: new Headers({ 'content-type': 'audio/ogg' }),
        arrayBuffer: async () => new ArrayBuffer(16),
        json: async () => null,
      } as any;
    }
    if (estado === 'expirada') {
      return {
        ok: false, status: 400,
        json: async () => ({ error: { message: "Unsupported get request. Object with ID '1054665414083892' does not exist", code: 100, error_subcode: 33 } }),
      } as any;
    }
    if (estado === 'erro-5xx') return { ok: false, status: 503, json: async () => null } as any;
    return { ok: true, status: 200, json: async () => ({ url: 'https://lookaside.test/arquivo', mime_type: mime }) } as any;
  }) as any;
}

const ID = '1054665414083892';
const ctx = (mediaId: string) => ({ params: Promise.resolve({ mediaId }) });

beforeEach(() => {
  chamadasGraph.length = 0;
  h.degradacoes.length = 0;
  h.autorizado = true;
  process.env.META_WHATSAPPBUSINESS_API = 'token-de-teste';
  process.env.PHONE_NUMBER_ID = '123456';
  process.env.META_APP_SECRET = SEGREDO;
});

// ── Graph: expirada é um estado, não um erro qualquer ───────────────────────

describe('urlDaMidia distingue mídia apagada de falha passageira', () => {
  it('🔴 400 #100/33 (a resposta medida em 17/09) é EXPIRADA, e não tenta de novo', async () => {
    stubarMeta('expirada');
    const r = await urlDaMidia(ID);
    expect(r.ok).toBe(false);
    expect(r.expirada).toBe(true);
    expect(chamadasGraph).toHaveLength(1);
  });

  it('5xx não é expirada: pode voltar, e a tela não pode dizer que o arquivo sumiu', async () => {
    stubarMeta('erro-5xx');
    const r = await urlDaMidia(ID);
    expect(r.ok).toBe(false);
    expect(r.expirada).toBeFalsy();
  }, 15_000);
});

// ── Guardar ─────────────────────────────────────────────────────────────────

describe('guardarMidiaRecebida', () => {
  it('grava no bucket próprio, pelo caminho do id, com o mime da Graph e SEM sobrescrever', async () => {
    stubarMeta('ok');
    const s = storageFake();
    const r = await guardarMidiaRecebida(ID, s);

    expect(r.estado).toBe('guardada');
    expect(s.uploads).toHaveLength(1);
    expect(s.uploads[0]!.bucket).toBe('inbox-midia-recebida');
    expect(s.uploads[0]!.path).toBe(`meta/${ID}`);
    expect(s.uploads[0]!.opts).toMatchObject({ contentType: 'audio/ogg; codecs=opus', upsert: false });
  });

  it('reentrega da Meta (objeto já existe) é sucesso, não falha', async () => {
    stubarMeta('ok');
    const s = storageFake();
    await guardarMidiaRecebida(ID, s);
    const r = await guardarMidiaRecebida(ID, s);
    expect(r.estado).toBe('ja-guardada');
  });

  it('mídia já apagada na Meta não tenta subir nada', async () => {
    stubarMeta('expirada');
    const s = storageFake();
    const r = await guardarMidiaRecebida(ID, s);
    expect(r.estado).toBe('expirada');
    expect(s.uploads).toHaveLength(0);
  });

  it('Storage falhando devolve o binário junto, para a rota ainda mostrar o arquivo', async () => {
    stubarMeta('ok');
    const s = storageFake({ uploadErro: { message: 'bucket not found', statusCode: '404' } });
    const r = await guardarMidiaRecebida(ID, s);
    expect(r.estado).toBe('falhou');
    expect(r.body).toBeInstanceOf(ArrayBuffer);
    expect(r.reason).toContain('bucket not found');
  });

  it('id que não é número não chega à Graph nem ao Storage', async () => {
    stubarMeta('ok');
    const s = storageFake();
    const r = await guardarMidiaRecebida('../../outro-bucket/x', s);
    expect(r.estado).toBe('falhou');
    expect(chamadasGraph).toHaveLength(0);
    expect(s.uploads).toHaveLength(0);
  });
});

// ── A rota ──────────────────────────────────────────────────────────────────

describe('GET /api/inbox/midia/[mediaId]', () => {
  it('🔴 com cópia, redireciona para ela e NÃO pergunta à Meta', async () => {
    stubarMeta('expirada'); // a Meta já apagou: só a cópia salva
    const s = storageFake();
    s.objetos.set(`${BUCKET_MIDIA_RECEBIDA}/${caminhoDaMidia(ID)}`, { contentType: 'audio/ogg' });
    h.sb = s;

    const res = await GET_MIDIA(new Request('https://x.test'), ctx(ID));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain(`inbox-midia-recebida/meta/${ID}`);
    expect(chamadasGraph).toHaveLength(0);
  });

  it('sem cópia e com a Meta ainda guardando: copia e redireciona para a cópia', async () => {
    stubarMeta('ok');
    const s = storageFake();
    h.sb = s;

    const res = await GET_MIDIA(new Request('https://x.test'), ctx(ID));
    expect(res.status).toBe(307);
    expect(s.uploads).toHaveLength(1);
    expect(h.degradacoes).toHaveLength(0);
  });

  it('🔴 sem cópia e apagada na Meta: 410 com a frase para a tela, não 404 mudo', async () => {
    stubarMeta('expirada');
    h.sb = storageFake();

    const res = await GET_MIDIA(new Request('https://x.test'), ctx(ID));
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toBe(MENSAGEM_MIDIA_EXPIRADA);
    expect(json.expirada).toBe(true);
  });

  it('Storage fora: serve o binário E registra que a cópia não foi feita', async () => {
    stubarMeta('ok');
    h.sb = storageFake({ uploadErro: { message: 'storage fora', statusCode: '500' } });

    const res = await GET_MIDIA(new Request('https://x.test'), ctx(ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/ogg; codecs=opus');
    expect(res.headers.get('cache-control')).toContain('private');
    const d = h.degradacoes.find((x) => x.tipo === 'whatsapp-midia-nao-guardada');
    expect(d?.chave).toBe('proxy');
  });

  it('sem acesso de plataforma, não toca Storage nem Meta', async () => {
    stubarMeta('ok');
    const s = storageFake();
    h.sb = s;
    h.autorizado = false;

    const res = await GET_MIDIA(new Request('https://x.test'), ctx(ID));
    expect(res.status).toBe(401);
    expect(s.assinaturas).toHaveLength(0);
    expect(chamadasGraph).toHaveLength(0);
  });
});

// ── O webhook copia quando a mensagem chega ─────────────────────────────────

function requisicao(body: unknown): Request {
  const raw = JSON.stringify(body);
  const assinatura = 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(raw, 'utf8').digest('hex');
  return new Request('https://vertho.ai/api/webhooks/whatsapp-cloud', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura },
  });
}

const payloadAudio = (mediaId = ID) => ({
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: '123' },
        messages: [{
          id: 'wamid.AUD1', from: '5511999998888', type: 'audio', timestamp: '1786000000',
          audio: { id: mediaId, mime_type: 'audio/ogg; codecs=opus', voice: true },
        }],
      },
    }],
  }],
});

describe('webhook guarda a mídia no instante em que ela chega', () => {
  function mockWebhook() {
    const m = criarSupabaseMock({ lista: (t) => (t === 'colaboradores' ? [{ id: 'c1', empresa_id: 'e1' }] : []) });
    const s = storageFake();
    m.client.storage = s.storage;
    h.sb = m.client;
    return { m, s };
  }

  it('🔴 áudio recebido é copiado para o bucket', async () => {
    stubarMeta('ok');
    const { s } = mockWebhook();

    const res = await POST_WEBHOOK(requisicao(payloadAudio()));
    expect(res.status).toBe(200);
    // O `after()` não é aguardado pela rota (é pós-resposta de propósito).
    await vi.waitFor(() => expect(s.uploads).toHaveLength(1));
    expect(s.uploads.map((u) => `${u.bucket}/${u.path}`)).toEqual([`inbox-midia-recebida/meta/${ID}`]);
    expect(h.degradacoes.filter((d) => d.tipo === 'whatsapp-inbound-perdido')).toHaveLength(0);
    expect(h.degradacoes.filter((d) => d.tipo === 'whatsapp-midia-nao-guardada')).toHaveLength(0);
  });

  it('cópia que falha vira degradação, e o webhook responde 200 mesmo assim', async () => {
    stubarMeta('erro-5xx');
    mockWebhook();

    const res = await POST_WEBHOOK(requisicao(payloadAudio()));
    expect(res.status).toBe(200);
    await vi.waitFor(
      () => expect(h.degradacoes.some((x) => x.tipo === 'whatsapp-midia-nao-guardada')).toBe(true),
      { timeout: 5_000 },
    );
    const d = h.degradacoes.find((x) => x.tipo === 'whatsapp-midia-nao-guardada');
    expect(d?.chave).toBe('webhook');
    expect(d?.detalhe.wamid).toBe('wamid.AUD1');
  }, 15_000);
});

// ── Legenda e mensagens sem conteúdo ────────────────────────────────────────

describe('thread: o que a pessoa escreveu junto e o que ela fez sem escrever', () => {
  const recebida = (over: any) => ({ id: 'r1', texto: null, tipo: 'image', recebida_em: '2026-08-25T11:33:57Z', raw: null, ...over });

  it('🔴 legenda da foto chega à tela (ficava só no raw)', () => {
    const [item] = montarThread({
      recebidas: [recebida({ raw: { image: { id: '1582248843584993', caption: 'Ta concluída no sistema' } } })],
      enviadas: [], entregas: [],
    });
    expect(item!.texto).toBe('Ta concluída no sistema');
    expect(item!.midiaId).toBe('1582248843584993');
  });

  it('texto gravado vence a legenda', () => {
    const [item] = montarThread({
      recebidas: [recebida({ tipo: 'text', texto: 'oi', raw: { text: { body: 'oi' } } })],
      enviadas: [], entregas: [],
    });
    expect(item!.texto).toBe('oi');
  });

  it('reação vira "reagiu com", não "(sem conteúdo)"', () => {
    const [item] = montarThread({
      recebidas: [recebida({ tipo: 'reaction', raw: { reaction: { emoji: '👍🏾', message_id: 'wamid.X' } } })],
      enviadas: [], entregas: [],
    });
    expect(item!.nota).toBe('reagiu com 👍🏾');
  });

  it('tipo não suportado (131051) diz o que fazer, sem chutar o formato', () => {
    const [item] = montarThread({
      recebidas: [recebida({ tipo: 'unsupported', raw: { errors: [{ code: 131051 }] } })],
      enviadas: [], entregas: [],
    });
    expect(item!.nota).toMatch(/não repassa/);
    expect(item!.nota).toMatch(/reenviar/);
  });
});
