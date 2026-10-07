import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/video/render-helpers', () => ({ SUPA: 'https://example.invalid', KEY: 'test' }));
import { ensureRenderWorker, reapSemSinalMin } from '@/lib/video/ensure-render-worker';
import { reapSemSinalMin as reapDoWorker } from '@/worker-hetzner/fila.mjs';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function ambiente() {
  for (const key of ['HCLOUD_TOKEN', 'RENDER_SNAPSHOT_ID', 'DATABASE_URL']) vi.stubEnv(key, 'test');
  vi.stubEnv('MAX_RENDER_BOXES', '1');
}
describe('provisionamento não duplica box em manutenção nem em falha de leitura', () => {
  it('box desligada ocupa o teto, mas NÃO é declarada viva', async () => {
    ambiente();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ servers: [{ id: 1, status: 'off' }] })))
      .mockResolvedValueOnce(new Response('[]', { headers: { 'content-range': '0-0/4' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await ensureRenderWorker();
    expect(r.alive).toBe(0);
    expect(r.provisioned).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'POST')).toBe(false);
  });
  it('falha na listagem não se converte em autorização para criar máquina', async () => {
    ambiente();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await ensureRenderWorker();
    expect(r.provisioned).toBe(false);
    expect(r.reason).toContain('recusado');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('box nova recebe um reaper compatível com o watchdog e a pull zone', () => {
  function provisiona(respostasPost: Response[]) {
    const posts: any[] = [];
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (opts?.method === 'POST') { posts.push(JSON.parse(opts.body)); return respostasPost.shift()!; }
      if (String(url).includes('/servers?')) return new Response(JSON.stringify({ servers: [] }));
      return new Response('[]', { headers: { 'content-range': '0-0/1' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return posts;
  }
  const criada = () => new Response(JSON.stringify({ server: { id: 42 } }), { status: 201 });
  const semEstoque = () => new Response(JSON.stringify({ error: { code: 'resource_unavailable', message: 'error during placement' } }), { status: 412 });

  it('REAP_AFTER_MIN = watchdog + 15 min (40 fixo devolvia render saudável à fila)', async () => {
    ambiente();
    vi.stubEnv('MAX_RENDER_MS', '5400000');
    vi.stubEnv('BUNNY_PULL_ZONE', 'cdn.exemplo');
    const posts = provisiona([criada()]);
    const r = await ensureRenderWorker();
    expect(r.provisioned).toBe(true);
    const env = String(posts[0].user_data);
    expect(env).toContain('MAX_RENDER_MS=5400000');
    expect(env).toContain('REAP_AFTER_MIN=105');
    expect(env).toContain('BUNNY_PULL_ZONE=cdn.exemplo');
    expect(env).toMatch(/BUNNY_REFERER=https:\/\/www\.[a-z.]+\//);
  });

  it('a box NÃO recebe chave de TTS: a saudação é sintetizada pelo app e a box só a lê do Storage', async () => {
    // O worker antigo sintetizava no AI Studio e precisava de GEMINI_API_KEY, VIDEO_TTS_VOICE e GEMINI_TTS_MODEL. Saíram quando o
    // snapshot novo entrou. Box descartável com segredo que ninguém usa é superfície; e o que ela PRECISA (versão do elenco
    // para a chave do áudio e credencial do Storage para lê-lo) tem de continuar chegando: sem isso a personalização é pulada.
    ambiente();
    vi.stubEnv('GEMINI_API_KEY', 'segredo-gemini-que-nao-pode-ir');
    vi.stubEnv('VIDEO_TTS_VOICE', 'Aoede');
    vi.stubEnv('GEMINI_TTS_MODEL', 'gemini-x');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-teste');
    vi.stubEnv('SUPABASE_URL', 'https://sb.exemplo');
    const posts = provisiona([criada()]);
    await ensureRenderWorker();
    const env = String(posts[0].user_data);
    expect(env).not.toContain('segredo-gemini-que-nao-pode-ir');
    expect(env).not.toMatch(/GEMINI_API_KEY|GEMINI_TTS_MODEL|VIDEO_TTS_VOICE/);
    // controles positivos: o que a box lê para montar o nominal
    expect(env).toMatch(/VOZ_VERSAO=\d{4}-\d{2}-\d{2}/);
    expect(env).toContain('SUPABASE_SERVICE_ROLE_KEY=service-role-teste');
    expect(env).toContain('SUPABASE_URL=https://sb.exemplo');
  });

  it('a fórmula do orquestrador é a mesma do worker', () => {
    for (const ms of [600_000, 2_400_000, 5_400_000, 7_200_000]) {
      expect(reapSemSinalMin(ms)).toBe(reapDoWorker({ MAX_RENDER_MS: String(ms) }));
    }
  });

  it('o log do sucesso diz POR QUE os degraus anteriores falharam', async () => {
    ambiente();
    vi.stubEnv('RENDER_SERVER_TYPES', 'cx43,cx33');
    vi.stubEnv('RENDER_LOCATIONS', 'nbg1');
    provisiona([semEstoque(), criada()]);
    const r = await ensureRenderWorker();
    expect(r.reason).toContain('via cx33@nbg1');
    expect(r.reason).toContain('tentativas: 1 (cx43@nbg1: 412 resource_unavailable)');
  });
});
