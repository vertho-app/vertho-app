import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Cache + retry do `embedText`. Nasceu de um estado medido em 28/07: 198 de 216
 * módulos-base publicados SEM embedding, porque a conta Voyage estava a 3 RPM e um
 * único 429 fazia o consumidor cair em token-matching — sem erro, sem log, sem
 * telemetria. O cache importa porque o mesmo descritor é consultado muitas vezes no
 * mesmo lote (3 formatos × N DISC do mesmo tema).
 */
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('EMBEDDING_PROVIDER', 'voyage');
  vi.stubEnv('VOYAGE_API_KEY', 'k');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const okResp = () => ({ ok: true, json: async () => ({ data: [{ embedding: Array(1024).fill(0.1) }] }) });
const rate = () => ({ ok: false, status: 429, text: async () => 'rate limit' });
const morto = () => ({ ok: false, status: 401, text: async () => 'unauthorized' });

describe('embedText — cache e retry', () => {
  it('mesmo texto NÃO chama a API duas vezes (o lote repete o descritor)', async () => {
    const { embedText } = await import('@/lib/embeddings');
    fetchMock.mockResolvedValue(okResp());

    const a = await embedText('Regulação sob pressão');
    const b = await embedText('Regulação sob pressão');

    expect(a?.vector).toHaveLength(1024);
    expect(b?.vector).toHaveLength(1024);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('texto diferente chama de novo (cache não pode servir vetor errado)', async () => {
    const { embedText } = await import('@/lib/embeddings');
    fetchMock.mockResolvedValue(okResp());
    await embedText('Regulação sob pressão');
    await embedText('Consciência de limites');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 é reesperado e a chamada seguinte funciona', async () => {
    const { embedText } = await import('@/lib/embeddings');
    fetchMock.mockResolvedValueOnce(rate()).mockResolvedValueOnce(okResp());

    const r = await embedText('Limites profissionais');

    expect(r?.vector).toHaveLength(1024);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 20_000);

  it('erro NÃO transitório (401) não gasta retentativa', async () => {
    const { embedText, estatisticasEmbedding } = await import('@/lib/embeddings');
    fetchMock.mockResolvedValue(morto());

    const r = await embedText('Busca de apoio e rede');

    expect(r).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(estatisticasEmbedding().falhas).toBe(1);   // contabilizado, não silencioso
  });

  it('falha esgotada conta e devolve null (consumidor cai em tokens)', async () => {
    const { embedText, estatisticasEmbedding } = await import('@/lib/embeddings');
    fetchMock.mockResolvedValue(rate());

    const r = await embedText('Sustentabilidade pessoal');

    expect(r).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);        // 1 + 2 retentativas
    expect(estatisticasEmbedding().falhas).toBeGreaterThan(0);
  }, 20_000);

  it('provider=none não chama rede nem conta falha', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'none');
    const { embedText, estatisticasEmbedding } = await import('@/lib/embeddings');
    expect(await embedText('x')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(estatisticasEmbedding().falhas).toBe(0);
  });
});
