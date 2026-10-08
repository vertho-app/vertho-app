import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';
import { criarStorageFalso } from '../../helpers/storage-falso';

/**
 * Continuação do R-74 (03/10/2026): o podcast PERSONALIZADO ("Olá, {nome}")
 * morava no bucket PÚBLICO `conteudos`. A rota `/api/conteudo/[id]/podcast`
 * autorizava quem pedia e então redirecionava para a URL pública e PERMANENTE:
 * a decisão valia para o clique, o link valia para sempre e para qualquer um.
 *
 * Estes testes provam, pelo bucket e pelo método de cada chamada de storage:
 *  · a rota entrega link ASSINADO, nunca `getPublicUrl`, nos dois formatos;
 *  · o áudio gerado vai para o bucket PRIVADO, na pasta da empresa da PESSOA;
 *  · quem não passa no gate não chega ao Storage;
 *  · Storage fora não vira "gerar de novo" (TTS pago às cegas);
 *  · a pré-geração interna grava no mesmo lugar que a rota lê.
 */
const estado = vi.hoisted(() => ({ ctx: null as any, negarColab: false }));

const EMP_A = '11111111-1111-4111-8111-111111111111';
const EMP_B = '22222222-2222-4222-8222-222222222222';
const CONT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONT_GLOBAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANA = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', nome_completo: 'Ana Souza', empresa_id: EMP_A };
const BIA = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', nome_completo: 'Bia Lima', empresa_id: EMP_A };

const CONTEUDOS: Record<string, any> = {
  [CONT_A]: { id: CONT_A, formato: 'audio', empresa_id: EMP_A, url: 'https://cdn/base-A.mp3', conteudo_inline: 'Narração '.repeat(10) },
  [CONT_GLOBAL]: { id: CONT_GLOBAL, formato: 'audio', empresa_id: null, url: 'https://cdn/base-G.mp3', conteudo_inline: 'Narração '.repeat(10) },
};
const COLABS: Record<string, any> = { [ANA.id]: ANA, [BIA.id]: BIA };

const filtro = (cadeia: Chamada[], col: string) => cadeia.find((c) => c.metodo === 'eq' && c.args[0] === col)?.args[1];

const sb = criarSupabaseMock({
  resolver: (tabela, _cols, cadeia) => {
    if (tabela === 'micro_conteudos') return CONTEUDOS[filtro(cadeia, 'id')] ?? null;
    if (tabela === 'colaboradores') {
      const c = COLABS[filtro(cadeia, 'id')];
      const emp = filtro(cadeia, 'empresa_id');
      if (!c || (emp !== undefined && c.empresa_id !== emp)) return null;
      return c;
    }
    return null;
  },
});
const st = criarStorageFalso();
sb.client.storage = st.storage;
const cliente = sb.client;

const { ttsMock, downloadMock } = vi.hoisted(() => ({
  ttsMock: vi.fn(async (_n: string, _nome: string) => ({ buffer: Buffer.from('mp3-novo'), contentType: 'audio/mpeg' })),
  downloadMock: vi.fn(async (url: string) => new Response(`baixado:${url}`, { status: 200 })),
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => cliente }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => estado.ctx ?? new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401 }),
  assertColabAccess: async () => (estado.negarColab ? new Response(JSON.stringify({ error: 'sem acesso' }), { status: 403 }) : null),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/lib/conteudo/download', () => ({ servirComoDownload: downloadMock }));
vi.mock('@/lib/gemini-tts', () => ({
  extractNarration: (t: string) => t,
  generatePersonalizedPodcastAudio: ttsMock,
}));
vi.mock('@/lib/repositories/conteudos-repo', () => ({ escopoTenantDaLinha: (q: any) => q }));

import { GET } from '@/app/api/conteudo/[id]/podcast/route';
import { POST as PREGERAR } from '@/app/api/internal/pregerar-podcast/route';
import { TTL_LINK_AUDIO_SEGUNDOS } from '@/lib/conteudo/audio-personalizado';

const novo = (emp: string, cont: string, colab: string) => `${emp}/audio-personalizado/${cont}/${colab}.mp3`;
const antigo = (cont: string, colab: string) => `final/audio-personalizado/${cont}/${colab}.mp3`;

const sessao = (colab: any, extra: Record<string, any> = {}) => ({
  email: 'x@y.com', colaborador: colab, role: 'colaborador', empresaId: colab?.empresa_id ?? null, isPlatformAdmin: false, ...extra,
});
const pedir = (cont: string, q = '') =>
  GET(new Request(`https://acme.vertho.ai/api/conteudo/${cont}/podcast${q}`), { params: Promise.resolve({ id: cont }) });

const publicas = () => st.chamadas.filter((c) => c.metodo === 'getPublicUrl');
const uploads = () => st.chamadas.filter((c) => c.metodo === 'upload');

beforeEach(() => {
  sb.reset();
  st.reset();
  estado.ctx = null;
  estado.negarColab = false;
  ttsMock.mockClear();
  downloadMock.mockClear();
});

describe('leitura do podcast personalizado: só link assinado', () => {
  it('🔴 cache no bucket privado: 302 para link ASSINADO, sem cache do redirect, sem URL pública', async () => {
    st.semear('relatorios-pdf', novo(EMP_A, CONT_A, ANA.id));
    estado.ctx = sessao(ANA);
    const res = await pedir(CONT_A);
    expect(res.status).toBe(302);
    const destino = res.headers.get('location')!;
    expect(destino).toContain(`assinado.exemplo/relatorios-pdf/${novo(EMP_A, CONT_A, ANA.id)}`);
    expect(destino).not.toContain('/object/public/');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(publicas()).toHaveLength(0);
    // a existência é conferida pela assinatura: a rota não baixa mais o MP3 inteiro a cada play
    expect(st.chamadas.filter((c) => c.metodo === 'download')).toHaveLength(0);
    expect(ttsMock).not.toHaveBeenCalled();
    const [assinatura] = st.chamadas.filter((c) => c.metodo === 'createSignedUrl');
    expect(assinatura.args[1]).toBe(TTL_LINK_AUDIO_SEGUNDOS);
  });

  it('🔴 cache só no formato ANTIGO: assina no bucket antigo, não entrega a URL pública', async () => {
    st.semear('conteudos', antigo(CONT_A, ANA.id));
    estado.ctx = sessao(ANA);
    const res = await pedir(CONT_A);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(`assinado.exemplo/conteudos/${antigo(CONT_A, ANA.id)}`);
    expect(publicas()).toHaveLength(0);
    expect(ttsMock).not.toHaveBeenCalled();
  });

  it('download: o arquivo baixado sai do link assinado, não da URL pública', async () => {
    st.semear('relatorios-pdf', novo(EMP_A, CONT_A, ANA.id));
    estado.ctx = sessao(ANA);
    await pedir(CONT_A, '?download=1&name=podcast');
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(downloadMock.mock.calls[0][0]).toContain('assinado.exemplo/relatorios-pdf/');
  });
});

describe('geração sob demanda: grava no bucket privado', () => {
  it('🔴 sem cache: gera com o nome e grava no PRIVADO, na pasta da empresa da pessoa', async () => {
    estado.ctx = sessao(ANA);
    const res = await pedir(CONT_A);
    expect(ttsMock).toHaveBeenCalledTimes(1);
    expect(ttsMock.mock.calls[0][1]).toBe('Ana Souza');
    expect(uploads().map((u) => [u.bucket, u.args[0]])).toEqual([['relatorios-pdf', novo(EMP_A, CONT_A, ANA.id)]]);
    expect(st.caminhos('conteudos')).toEqual([]);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(`assinado.exemplo/relatorios-pdf/${novo(EMP_A, CONT_A, ANA.id)}`);
    expect(publicas()).toHaveLength(0);
  });

  it('conteúdo do catálogo GLOBAL: o arquivo fica na empresa da PESSOA (o dado é dela)', async () => {
    estado.ctx = sessao(ANA);
    await pedir(CONT_GLOBAL);
    expect(uploads().map((u) => [u.bucket, u.args[0]])).toEqual([['relatorios-pdf', novo(EMP_A, CONT_GLOBAL, ANA.id)]]);
  });

  it('🔴 Storage fora: 503 e NENHUM TTS (não paga para gerar o que provavelmente existe)', async () => {
    st.falhar('relatorios-pdf', 'createSignedUrl', 'fetch failed: ECONNRESET');
    estado.ctx = sessao(ANA);
    const res = await pedir(CONT_A);
    expect(res.status).toBe(503);
    expect(ttsMock).not.toHaveBeenCalled();
    expect(uploads()).toHaveLength(0);
  });

  it('upload que falha não vira link: cai no áudio-base, sem nome', async () => {
    const fetchBase = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    try {
      st.falhar('relatorios-pdf', 'upload', 'quota');
      estado.ctx = sessao(ANA);
      const res = await pedir(CONT_A);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('audio/mpeg');
      expect(fetchBase).toHaveBeenCalledWith('https://cdn/base-A.mp3');
      expect(publicas()).toHaveLength(0);
    } finally {
      fetchBase.mockRestore();
    }
  });
});

describe('quem pede pelo outro (auditoria do RH/gestor)', () => {
  it('lê o áudio DA PESSOA pedida, na pasta da empresa dela', async () => {
    st.semear('relatorios-pdf', novo(EMP_A, CONT_A, BIA.id));
    estado.ctx = sessao({ id: 'rh-1', nome_completo: 'RH', empresa_id: EMP_A }, { role: 'rh' });
    const res = await pedir(CONT_A, `?colaboradorId=${BIA.id}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(novo(EMP_A, CONT_A, BIA.id));
  });

  it('🔴 sem acesso à pessoa: 403 antes de tocar o Storage', async () => {
    st.semear('relatorios-pdf', novo(EMP_A, CONT_A, BIA.id));
    estado.negarColab = true;
    estado.ctx = sessao(ANA);
    const res = await pedir(CONT_A, `?colaboradorId=${BIA.id}`);
    expect(res.status).toBe(403);
    expect(st.chamadas).toHaveLength(0);
  });

  it('🔴 conteúdo de outro tenant: 403 antes de tocar o Storage', async () => {
    estado.ctx = sessao({ ...ANA, empresa_id: EMP_B });
    const res = await pedir(CONT_A);
    expect(res.status).toBe(403);
    expect(st.chamadas).toHaveLength(0);
  });

  it('falha ao ler a pessoa pedida: 503, não "não encontrado"', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'pool esgotado' });
    estado.ctx = sessao({ id: 'rh-1', nome_completo: 'RH', empresa_id: EMP_A }, { role: 'rh' });
    const res = await pedir(CONT_A, `?colaboradorId=${BIA.id}`);
    expect(res.status).toBe(503);
    expect(st.chamadas).toHaveLength(0);
  });
});

describe('pré-geração interna (`/api/internal/pregerar-podcast`)', () => {
  const pregerar = (body: any) => PREGERAR(new Request('https://app.vertho.ai/api/internal/pregerar-podcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': 'segredo-teste' },
    body: JSON.stringify(body),
  }));

  beforeEach(() => { process.env.INTERNAL_API_KEY = 'segredo-teste'; });

  it('🔴 grava no MESMO lugar que a rota lê: bucket privado, empresa da pessoa', async () => {
    const res = await pregerar({ id: CONT_A, colaboradorId: ANA.id });
    expect(res.status).toBe(200);
    expect(uploads().map((u) => [u.bucket, u.args[0]])).toEqual([['relatorios-pdf', novo(EMP_A, CONT_A, ANA.id)]]);
    expect(st.caminhos('conteudos')).toEqual([]);

    // e a rota de leitura acha esse arquivo sem gerar de novo
    estado.ctx = sessao(ANA);
    const leitura = await pedir(CONT_A);
    expect(leitura.status).toBe(302);
    expect(ttsMock).toHaveBeenCalledTimes(1);
  });

  it('pessoa que não existe: 404 SEM pagar TTS', async () => {
    const res = await pregerar({ id: CONT_A, colaboradorId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    expect(res.status).toBe(404);
    expect(ttsMock).not.toHaveBeenCalled();
    expect(uploads()).toHaveLength(0);
  });

  it('falha ao ler a pessoa: 500, sem TTS', async () => {
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'pool esgotado' });
    const res = await pregerar({ id: CONT_A, colaboradorId: ANA.id });
    expect(res.status).toBe(500);
    expect(ttsMock).not.toHaveBeenCalled();
  });
});
