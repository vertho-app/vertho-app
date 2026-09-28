/**
 * `semPortao` (27/09/2026): UMA síntese, sem o portão da narração da marca.
 *
 * Nasceu para a fala curta da pessoa simulada do simulador de atendimento, que não é
 * voz da marca. O mesmo take que o portão reprova (e, sem prazo, recusa publicar depois
 * de pagar três) sai direto com a opção; sem ela, o comportamento de sempre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ELENCO } from '@/lib/tts/elenco';

const registrarDegradacao = vi.fn(async () => {});
vi.mock('@/lib/degradacao', async (original) => ({ ...(await original<typeof import('@/lib/degradacao')>()), registrarDegradacao }));
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn(async () => true) }));
const vereditos = vi.fn(async () => true);
vi.mock('@/lib/tts/qa-log', () => ({ gravarVereditosTts: vereditos }));

/** PCM 16-bit 24 kHz com F0 fixo (208 Hz: longe do alvo do Beto, então o portão reprova). */
function respostaTts(segundos: number, f0: number) {
  const sr = 24000;
  const pcm = Buffer.alloc(Math.floor(segundos * sr) * 2);
  let fase = 0;
  for (let i = 0; i < pcm.length / 2; i++) {
    fase += (2 * Math.PI * f0) / sr;
    const silaba = 0.55 + 0.45 * Math.max(0, Math.sin((2 * Math.PI * 4 * i) / sr));
    let s = 0;
    for (let h = 0; h < 6; h++) s += [1, 0.6, 0.4, 0.3, 0.2, 0.15][h] * Math.sin(fase * (h + 1));
    pcm.writeInt16LE(Math.round((0.25 * silaba * s) / 2.65 * 32767), i * 2);
  }
  return {
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] } }] }),
    text: async () => '',
  };
}

describe('generateNarrationAudio com `semPortao`', () => {
  beforeEach(() => {
    registrarDegradacao.mockClear();
    vereditos.mockClear();
    process.env.GEMINI_API_KEY = 'fake';
    process.env.TTS_BACKEND = 'aistudio';
    process.env.TTS_QA_TENTATIVAS = '3';
  });

  it('um take que o portão reprovaria sai numa síntese só, sem veredito nem degradação', async () => {
    const fetchSpy = vi.fn(async () => respostaTts(6, 208));
    vi.stubGlobal('fetch', fetchSpy);
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio('Não aceito espera.', { voice: ELENCO.beto.voz, segmentar: false, semPortao: true });
    expect(audio.contentType).toBe('audio/mpeg');
    expect(audio.buffer.length).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vereditos).not.toHaveBeenCalled();
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('sem a opção, o mesmo take passa pelo portão de sempre (refaz e recusa)', async () => {
    const fetchSpy = vi.fn(async () => respostaTts(6, 208));
    vi.stubGlobal('fetch', fetchSpy);
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    await expect(
      generateNarrationAudio('Não aceito espera.', { voice: ELENCO.beto.voz, segmentar: false, tentativas: 3, prazoAteMs: Date.now() + 600_000 }),
    ).rejects.toThrow('áudio não publicado');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
