import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Deduplicação na fila (QStash), opt-in: o lembrete automático da entrada passa o id (a chave leva o
 * dia), para uma 2ª execução do cron no mesmo dia não mandar em dobro. Os lotes manuais NÃO passam:
 * o reenvio deles é livre por decisão do dono, e um id fixo por pessoa faria a fila descartar o reenvio.
 */

vi.mock('@/lib/whatsapp/cloud-api', () => ({ cloudApiConfigurada: () => true }));

const { publicarTemplateCloudCis } = await import('@/lib/qstash-publish');

let chamadas: Array<{ url: string; headers: Record<string, string> }> = [];
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamadas = [];
  process.env.QSTASH_TOKEN = 'token-de-teste';
  globalThis.fetch = (async (url: any, init: any) => {
    chamadas.push({ url: String(url), headers: { ...(init?.headers || {}) } });
    return new Response('{}', { status: 200 });
  }) as any;
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

describe('publicarTemplateCloudCis', () => {
  it('com dedupId, manda o cabeçalho de deduplicação da fila', async () => {
    await publicarTemplateCloudCis({ telefone: '5511999990001', template: 'avaliacao_pendente' }, 5, { dedupId: 'lembrete_entrada:avaliacao_pendente:p1:2026-11-05' });
    expect(chamadas[0].headers['Upstash-Deduplication-Id']).toBe('lembrete_entrada:avaliacao_pendente:p1:2026-11-05');
    expect(chamadas[0].headers['Upstash-Delay']).toBe('5s');
  });

  it('sem dedupId (lotes manuais), não manda o cabeçalho: o reenvio continua livre', async () => {
    await publicarTemplateCloudCis({ telefone: '5511999990001', template: 'avaliacao_pendente' }, 0);
    expect('Upstash-Deduplication-Id' in chamadas[0].headers).toBe(false);
  });
});
