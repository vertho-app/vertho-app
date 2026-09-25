import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Contrato da HeyGen v3 (`lib/video/heygen.ts`).
 *
 * Por que existe: a HeyGen retira a v1/v2 em 31/10/2026, e a v3 tem duas armadilhas
 * MEDIDAS em 24/09/2026 que não dão erro nenhum na hora:
 *   1. sem `engine` explícito o v3 usa Avatar IV, que custou 2,2× o `avatar_iii` no
 *      mesmo clipe — o vídeo sai igual e a conta dobra calada;
 *   2. `engine` como string devolve 400 (é objeto `{ type }`).
 * E dois buracos antigos que este arquivo fecha: o polling ignorava `r.ok` (um 401
 * virava 20 minutos de espera até o timeout) e o custo do avatar, a maior linha do
 * vídeo, não entrava no ledger.
 *
 * As respostas copiam a FORMA das chamadas reais de 24/09 (criação devolve
 * `data.video_id`; consulta devolve `status`, `duration`, `video_url`). `fetch` é
 * stubado; nada sai daqui.
 */

const gravadas: any[] = [];
vi.mock('@/lib/ia-ledger', () => ({
  gravarLinhaLedger: async (linha: any) => { gravadas.push(linha); return true; },
}));

import { gerarClipHeyGen, aguardarClipHeyGen, aguardarClipeHeyGen } from '@/lib/video/heygen';

const FOTO = 'd160ea51f4124514b94aa1cf8e56eb42';
const ID = '83145fa54c2d57b12a082b33942edc85';
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });
const concluido = (extra: Record<string, unknown> = {}) => json(200, {
  data: { id: ID, status: 'completed', duration: 7.57658, video_url: 'https://files2.heygen.ai/x.mp4', created_at: 1790292202, completed_at: 1790292378, ...extra },
});

let chamadas: Array<{ url: string; init: any }>;
function stubFetch(respostas: Array<() => Response>) {
  chamadas = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    chamadas.push({ url: String(url), init });
    const r = respostas[Math.min(i, respostas.length - 1)];
    i++;
    return r();
  }));
}

beforeEach(() => {
  gravadas.length = 0;
  vi.stubEnv('HEYGEN_API_KEY', 'hk-test');
  vi.stubEnv('HEYGEN_TALKING_PHOTO_ID', '');
  vi.stubEnv('HEYGEN_ENGINE', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('HeyGen v3 · criação do clipe', () => {
  it('usa /v3/videos com a foto, o motor avatar_iii EXPLÍCITO em objeto e 1080p', async () => {
    stubFetch([() => json(200, { data: { video_id: ID, status: 'waiting', output_format: 'mp4' } })]);
    const id = await gerarClipHeyGen('https://x/scene-1.mp3', { width: 1920, height: 1080 });

    expect(id).toBe(ID);
    expect(chamadas[0].url).toBe('https://api.heygen.com/v3/videos');
    expect(chamadas[0].init.method).toBe('POST');
    expect(chamadas[0].init.headers['X-Api-Key']).toBe('hk-test');
    expect(JSON.parse(chamadas[0].init.body)).toEqual({
      type: 'avatar', avatar_id: FOTO, engine: { type: 'avatar_iii' },
      audio_url: 'https://x/scene-1.mp3', resolution: '1080p', aspect_ratio: '16:9',
    });
  });

  it('a env troca o motor na HORA da chamada (não no carregamento do módulo)', async () => {
    vi.stubEnv('HEYGEN_ENGINE', 'avatar_iv');
    stubFetch([() => json(200, { data: { video_id: ID } })]);
    await gerarClipHeyGen('https://x/a.mp3');
    expect(JSON.parse(chamadas[0].init.body).engine).toEqual({ type: 'avatar_iv' });
  });

  it('resposta não-ok falha com o status, sem inventar id', async () => {
    stubFetch([() => json(400, { error: { code: 'invalid_parameter', param: 'engine' } })]);
    await expect(gerarClipHeyGen('https://x/a.mp3')).rejects.toThrow(/HeyGen generate falhou: 400/);
  });

  it('sem chave não chama a API', async () => {
    vi.stubEnv('HEYGEN_API_KEY', '');
    stubFetch([() => json(200, {})]);
    await expect(gerarClipHeyGen('https://x/a.mp3')).rejects.toThrow(/HEYGEN_API_KEY ausente/);
    expect(chamadas).toHaveLength(0);
  });
});

describe('HeyGen v3 · polling', () => {
  it('5xx e 429 são transitórios: continua até concluir e devolve a URL', async () => {
    stubFetch([
      () => json(503, {}),
      () => json(429, {}),
      () => json(200, { data: { id: ID, status: 'processing' } }),
      () => concluido(),
    ]);
    const url = await aguardarClipHeyGen(ID, { intervaloMs: 0 });
    expect(url).toBe('https://files2.heygen.ai/x.mp4');
    expect(chamadas.map((c) => c.url)).toEqual(Array(4).fill(`https://api.heygen.com/v3/videos/${ID}`));
  });

  it('4xx não transitório é fatal na hora (antes virava 20 min de espera)', async () => {
    stubFetch([() => json(404, { error: { code: 'not_found' } })]);
    await expect(aguardarClipHeyGen(ID, { intervaloMs: 0 })).rejects.toThrow(/HeyGen status 404/);
    expect(chamadas).toHaveLength(1);
  });

  it('status failed vira erro com o motivo', async () => {
    stubFetch([() => json(200, { data: { id: ID, status: 'failed', failure_message: 'audio inválido' } })]);
    await expect(aguardarClipHeyGen(ID, { intervaloMs: 0 })).rejects.toThrow(/HeyGen falhou: .*audio inválido/);
  });

  it('completou sem video_url é erro', async () => {
    stubFetch([() => concluido({ video_url: undefined })]);
    await expect(aguardarClipHeyGen(ID, { intervaloMs: 0 })).rejects.toThrow(/sem video_url/);
  });

  it('esgotou as tentativas: a mensagem de timeout é a MESMA que o health e a FMEA leem', async () => {
    stubFetch([() => json(200, { data: { id: ID, status: 'processing' } })]);
    await expect(aguardarClipHeyGen(ID, { intervaloMs: 0, tentativas: 2 }))
      .rejects.toThrow(`HeyGen timeout aguardando video_id ${ID}`);
  });
});

describe('HeyGen v3 · custo no ledger', () => {
  it('clipe concluído grava uma linha com o custo = segundos (para cima) × preço do motor', async () => {
    stubFetch([() => concluido()]);
    const r = await aguardarClipeHeyGen(ID, { intervaloMs: 0, ledger: { feature: 'heygen_avatar', empresaId: 'emp-1' } });

    expect(r.duracaoS).toBeCloseTo(7.57658, 5);
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]).toMatchObject({
      feature: 'heygen_avatar', empresa_id: 'emp-1', provider: 'heygen', model: 'heygen-avatar_iii',
      input_tokens: 0, output_tokens: 0, status: 'ok', source: 'heygen:v3',
    });
    // 7,58s → 8s × US$ 0,99/min (tabela oficial 16/09; bate com o delta de US$ 0,13 medido).
    expect(gravadas[0].cost_usd).toBeCloseTo(8 * (0.99 / 60), 10);
    expect(gravadas[0].correlation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('o mesmo clipe observado duas vezes (re-run) grava com o MESMO correlation_id', async () => {
    stubFetch([() => concluido()]);
    await aguardarClipHeyGen(ID, { intervaloMs: 0, ledger: { feature: 'heygen_avatar', empresaId: 'emp-1' } });
    await aguardarClipHeyGen(ID, { intervaloMs: 0, ledger: { feature: 'heygen_avatar', empresaId: 'emp-1' } });
    expect(gravadas[0].correlation_id).toBe(gravadas[1].correlation_id);
  });

  it('motor fora da tabela de preço grava a linha com custo nulo (a lacuna aparece, não some)', async () => {
    vi.stubEnv('HEYGEN_ENGINE', 'avatar_v');
    stubFetch([() => concluido()]);
    await aguardarClipHeyGen(ID, { intervaloMs: 0, ledger: { feature: 'heygen_avatar', empresaId: null } });
    expect(gravadas[0]).toMatchObject({ model: 'heygen-avatar_v', cost_usd: null });
  });

  it('sem `ledger` (uso de script) não grava nada', async () => {
    stubFetch([() => concluido()]);
    await aguardarClipHeyGen(ID, { intervaloMs: 0 });
    expect(gravadas).toHaveLength(0);
  });
});
