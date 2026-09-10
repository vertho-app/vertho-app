import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/video/render-helpers', () => ({ SUPA: 'https://example.invalid', KEY: 'test' }));
import { ensureRenderWorker } from '@/lib/video/ensure-render-worker';

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
