import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { schoolOfflineData } from '@/lib/demo/offline/data';
import { offlineAdapters } from '@/lib/demo/offline/build-adapters';

const data = schoolOfflineData();
let runtime: typeof import('@/lib/demo/offline/runtime');
let network: ReturnType<typeof vi.fn>;
let browser: any;
beforeEach(async () => {
  network = vi.fn(async () => new Response('asset'));
  browser = Object.assign(new EventTarget(), {
    location: { hash: '#/participant/dashboard', href: 'https://demo.example/apresentacao-offline/index.html', origin: 'https://demo.example' },
    fetch: network, scrollTo: vi.fn(), history: { replaceState: vi.fn() },
  });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('__DEMO_DATA__', data);
  vi.stubGlobal('__OFFLINE_MEDIA__', ['https://media.example/saved.mp4']);
  runtime = await import('@/lib/demo/offline/runtime');
});
afterEach(() => vi.unstubAllGlobals());

describe('Interface compartilhada sem acesso a serviços online', () => {
  it('mantém identidade e navegação locais ao trocar a visão', () => {
    expect(runtime.currentPerson().name).toBe('Marina Rocha');
    runtime.switchRole('manager');
    expect(runtime.currentLocation()).toMatchObject({ role: 'manager', pathname: '/dashboard/gestor' });
    expect(runtime.currentPerson().name).toBe('Renata Coelho');
    runtime.switchRole('organization');
    expect(runtime.currentPerson().name).toBe('Cláudia Amorim');
    expect(runtime.currentPerson('marina').name).toBe('Marina Rocha');
    const notice = vi.fn();
    browser.addEventListener('demo:online-only', notice);
    const before = browser.location.hash;
    runtime.navigate('/dashboard/simulador-vendas');
    expect(browser.location.hash).toBe(before);
    expect(notice).toHaveBeenCalledOnce();
  });
  it('resolve a sessão fictícia e permite só arquivos GET/HEAD do pacote', async () => {
    runtime.installLocalTransport();
    const me = await (await browser.fetch('/api/me')).json();
    expect(me.nome_completo).toBe('Marina Rocha');
    expect(me.access_token).toBeUndefined();
    for (const path of ['/api/chat', '/api/conteudo/123/pdf', 'https://example.com/tracking']) {
      expect((await browser.fetch(path)).status).toBe(503);
    }
    expect((await browser.fetch('/apresentacao-offline/index.html', { method: 'POST' })).status).toBe(503);
    expect(network).not.toHaveBeenCalled();
    await browser.fetch('/apresentacao-offline/documents/pdi.pdf');
    await browser.fetch('https://media.example/saved.mp4');
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('reutiliza leituras sem empacotar autenticação, banco ou implementações de server actions', async () => {
    const result = await build({
      stdin: { contents: `export { loadHomeData } from './app/dashboard/home-actions'; export { marcarConteudoConsumido, loadTemporada } from './actions/temporadas';`, resolveDir: process.cwd() },
      bundle: true, platform: 'browser', write: false, metafile: true,
      plugins: [offlineAdapters()],
      define: { __DEMO_DATA__: JSON.stringify(data), __OFFLINE_MEDIA__: '[]' },
    });
    const modules = Object.keys(result.metafile!.inputs).join('\n');
    expect(modules).toContain('lib/demo/offline/local-actions.ts');
    expect(modules).not.toMatch(/tenant-db|supabase-js|action-context|ai-client/);
    const actions = await import('@/lib/demo/offline/local-actions');
    const before = JSON.stringify(data.tracks);
    await actions.marcarConteudoConsumido();
    expect(JSON.stringify(data.tracks)).toBe(before);
    const notice = vi.fn();
    browser.addEventListener('demo:online-only', notice);
    expect(await actions.unavailable()).toMatchObject({ ok: false, success: false });
    expect(notice).toHaveBeenCalledOnce();
  });
});
