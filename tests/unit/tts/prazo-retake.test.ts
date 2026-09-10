/**
 * O retake do portão de TTS é SÉRIE + PRAZO, não "K takes sempre".
 *
 * `Medido 10/09/2026` (`ia_usage_log` + `tts_qa_log`, 83 sínteses de 08-09/09): o take
 * leva p50 99 s / p90 141 s / máx 174 s, a reprovação é de 7,4% por take, e **27 de 27**
 * episódios saíram na tentativa 1. Com `retakeParalelo` as três saíam sempre: US$ 0,17
 * por episódio, dos quais US$ 0,11 eram takes descartados. Em série, o custo esperado é
 * de US$ 0,06 — e o preço a pagar é a latência do retake, que só cabe se houver tempo.
 *
 * Os três comportamentos que este arquivo tranca:
 *   1. take aprovado de primeira NÃO sintetiza de novo (o desperdício que motivou tudo);
 *   2. reprovado COM prazo suficiente refaz;
 *   3. reprovado SEM prazo suficiente encerra os retakes SEM publicar o reprovado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ELENCO } from '@/lib/tts/elenco';

type EntradaDegradacao = { fluxo: string; tipo: string; chave: string; severidade?: string; detalhe?: Record<string, unknown> | null };
const registrarDegradacao = vi.fn(async (_input: EntradaDegradacao) => {});
vi.mock('@/lib/degradacao', async (original) => {
  const real = await original<typeof import('@/lib/degradacao')>();
  return { ...real, registrarDegradacao };
});
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn(async () => true) }));

type LinhaVeredito = { tentativa: number; totalTentativas: number; publicado: boolean; ok: boolean };
const vereditos = vi.fn(async (_linhas: LinhaVeredito[]) => true);
vi.mock('@/lib/tts/qa-log', () => ({ gravarVereditosTts: vereditos }));

/** PCM 16-bit 24 kHz com fala sintética no F0 pedido (208 Hz = alvo da mentora). */
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

const TEXTO = 'Texto de teste para a narração do portão de deriva.';

describe('portão de TTS: retake em série, limitado pelo prazo', () => {
  beforeEach(() => {
    registrarDegradacao.mockClear();
    vereditos.mockClear();
    process.env.GEMINI_API_KEY = 'fake';
    process.env.TTS_BACKEND = 'aistudio';
    process.env.TTS_QA_TENTATIVAS = '3';
  });

  it('aprovado na 1ª: UMA chamada ao TTS, mesmo com teto de 3 tentativas', async () => {
    const fetchSpy = vi.fn(async () => respostaTts(25, 208)); // no alvo da mentora
    vi.stubGlobal('fetch', fetchSpy);
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio(TEXTO, { voice: ELENCO.mentora.voz, segmentar: false, tentativas: 3 });
    expect(audio.qa?.ok).toBe(true);
    // É ESTE número que sangrava dinheiro: com retakeParalelo eram 3 chamadas aqui.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('reprovado com prazo de sobra: refaz até o teto', async () => {
    const fetchSpy = vi.fn(async () => respostaTts(25, 208)); // grave demais para o Beto
    vi.stubGlobal('fetch', fetchSpy);
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    await expect(generateNarrationAudio(TEXTO, {
      voice: ELENCO.beto.voz, segmentar: false, tentativas: 3,
      prazoAteMs: Date.now() + 10 * 60_000, // 10 min: cabe qualquer retake
    })).rejects.toThrow('áudio não publicado');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('reprovado sem prazo para refazer: não inicia outro take nem publica o reprovado', async () => {
    const fetchSpy = vi.fn(async () => respostaTts(25, 208));
    vi.stubGlobal('fetch', fetchSpy);
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    await expect(generateNarrationAudio(TEXTO, {
      voice: ELENCO.beto.voz, segmentar: false, tentativas: 3,
      prazoAteMs: Date.now() + 1_000, // já esgotado quando a 1ª tentativa volta
    })).rejects.toThrow('áudio não publicado');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('o veredito persistido conta as tentativas REAIS quando o prazo corta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, 208)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    await expect(generateNarrationAudio(TEXTO, {
      voice: ELENCO.beto.voz, segmentar: false, tentativas: 3, prazoAteMs: Date.now() + 1_000,
    })).rejects.toThrow('áudio não publicado');
    const linhas = vereditos.mock.calls[0][0];
    expect(linhas).toHaveLength(1);
    expect(linhas[0].totalTentativas).toBe(1);
    expect(linhas[0].publicado).toBe(false);
  });
});
