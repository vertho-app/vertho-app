import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { criarStorageFalso } from '../helpers/storage-falso';

/**
 * Devolutiva do perfil em voz (`gerarDevolutivaEmAudioCore`): TTS que falha vira linha em
 * `degradacao_log`, e o erro continua subindo para quem chamou.
 *
 * Os dois chamadores só logam: a pré-geração do DISC com `console.warn`, o botão devolvendo
 * `{ error }`. Com a credencial do Google ilegível na Vercel (17-20/10/2026), cada DISC novo
 * teria saído sem voz e nada no health diria. Ninguém real fez o DISC naqueles dias; a
 * próxima vez não pode depender disso.
 */

const h = vi.hoisted(() => ({
  tts: vi.fn(async (..._a: any[]): Promise<any> => ({ buffer: Buffer.from('mp3'), contentType: 'audio/mpeg', qa: { ok: true, motivos: [] } })),
  degradacao: vi.fn(async (..._a: any[]) => {}),
}));

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => 'Roteiro do Beto para a devolutiva. '.repeat(4)) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'modelo-teste') }));
vi.mock('@/lib/disc-arquetipos', () => ({ derivarArquetipo: () => ({ nome: 'Analista' }) }));
vi.mock('@/lib/prompts/devolutiva-comportamental', () => ({ promptDevolutivaComportamental: () => ({ system: 's', user: 'u' }) }));
vi.mock('@/lib/gemini-tts', () => ({ extractNarration: (t: string) => t, generateNarrationAudio: h.tts }));
vi.mock('@/lib/degradacao', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: h.degradacao,
}));

import { gerarDevolutivaEmAudioCore } from '@/lib/relatorio-comportamental/devolutiva-audio';

const colab = { id: 'colab-1', empresa_id: 'emp-1', nome_completo: 'Marina Souza', cargo: 'Analista', perfil_dominante: 'DC' };
const sb = criarSupabaseMock({ resolver: () => null });
const st = criarStorageFalso();
sb.client.storage = st.storage;

beforeEach(() => {
  sb.reset();
  st.reset();
  h.tts.mockClear();
  h.degradacao.mockClear();
});

describe('devolutiva em voz: TTS que falha não fica só no log', () => {
  it('🔴 registra devolutiva-audio-falhou (com o sb do chamador) e o erro continua subindo', async () => {
    h.tts.mockRejectedValueOnce(new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido (não é JSON nem base64-JSON)'));
    await expect(gerarDevolutivaEmAudioCore({ colab, raw: {}, texts: {}, sb: sb.client, sobDemanda: true }))
      .rejects.toThrow('GOOGLE_SERVICE_ACCOUNT_JSON inválido');
    expect(h.degradacao).toHaveBeenCalledTimes(1);
    const [input, client] = h.degradacao.mock.calls[0];
    expect(input).toEqual({
      fluxo: 'build',
      tipo: 'devolutiva-audio-falhou',
      chave: 'colab-1',
      empresaId: 'emp-1',
      colaboradorId: 'colab-1',
      detalhe: { erro: 'GOOGLE_SERVICE_ACCOUNT_JSON inválido (não é JSON nem base64-JSON)', sobDemanda: true },
    });
    // o client injetado, não um admin novo (a allowlist de service-role só encolhe)
    expect(client).toBe(sb.client);
    expect(st.chamadas.filter((c) => c.metodo === 'upload')).toHaveLength(0);
  });

  it('com o TTS bom, grava o áudio e não registra nada', async () => {
    const r = await gerarDevolutivaEmAudioCore({ colab, raw: {}, texts: {}, sb: sb.client });
    expect(r).toMatchObject({ success: true });
    expect(h.degradacao).not.toHaveBeenCalled();
    expect(st.chamadas.filter((c) => c.metodo === 'upload')).toHaveLength(1);
  });
});
