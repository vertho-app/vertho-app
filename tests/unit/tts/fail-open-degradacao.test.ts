/**
 * O fail-open do portão de TTS não pode ser SILENCIOSO.
 *
 * `Medido 07/09/2026`: os 19 podcasts dos professores de Macaé saíram com 19 de 19
 * reprovados pelo portão (backend errado: voz 3 semitons abaixo do alvo, timbre a
 * 0,3-0,7σ da assinatura) e publicados assim mesmo. `degradacao_log` tinha ZERO
 * linhas — o aviso morava só no `console.warn`, que ninguém lê depois. A regra da
 * casa: fallback pode existir, invisível não.
 *
 * O teste exercita `generateNarrationAudio` com um TTS falso que devolve SILÊNCIO
 * (reprova por "sem fala" e por registro), e exige a linha de degradação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type EntradaDegradacao = { fluxo: string; tipo: string; chave: string; severidade?: string; detalhe?: Record<string, unknown> | null };
const registrarDegradacao = vi.fn(async (_input: EntradaDegradacao) => {});
vi.mock('@/lib/degradacao', async (original) => {
  const real = await original<typeof import('@/lib/degradacao')>();
  return { ...real, registrarDegradacao };
});
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn(async () => true) }));
vi.mock('@/lib/tts/qa-log', () => ({ gravarVereditosTts: vi.fn(async () => true) }));

/** Resposta do TTS: PCM 16-bit 24 kHz de N segundos, silêncio ou tom de voz. */
function respostaTts(segundos: number, comVoz: boolean) {
  const sr = 24000;
  const pcm = Buffer.alloc(Math.floor(segundos * sr) * 2);
  if (comVoz) {
    let fase = 0;
    for (let i = 0; i < pcm.length / 2; i++) {
      fase += (2 * Math.PI * 208) / sr; // 208 Hz = alvo da Aoede
      const silaba = 0.55 + 0.45 * Math.max(0, Math.sin((2 * Math.PI * 4 * i) / sr));
      let s = 0;
      for (let h = 0; h < 6; h++) s += [1, 0.6, 0.4, 0.3, 0.2, 0.15][h] * Math.sin(fase * (h + 1));
      pcm.writeInt16LE(Math.round((0.25 * silaba * s) / 2.65 * 32767), i * 2);
    }
  }
  return {
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] } }] }),
    text: async () => '',
  };
}

describe('fail-open do portão de TTS registra degradação', () => {
  beforeEach(() => {
    registrarDegradacao.mockClear();
    process.env.GEMINI_API_KEY = 'fake';
    process.env.TTS_BACKEND = 'aistudio';
    process.env.TTS_QA_TENTATIVAS = '2';
  });

  it('take SEM FALA nas duas tentativas: a síntese FALHA (não publica silêncio)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, false)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    await expect(generateNarrationAudio('Texto de teste para a narração do portão.', { segmentar: false }))
      .rejects.toThrow(/nenhuma das \d+ tentativa\(s\) tem fala/);
    expect(registrarDegradacao).not.toHaveBeenCalled(); // falhou alto: não é fail-open
  });

  it('take COM FALA mas reprovado (registro fora do alvo) é publicado E registra degradação', async () => {
    // 208 Hz é o alvo da Aoede; pedindo a voz do Beto (alvo 144), o mesmo áudio reprova
    // por registro — take com fala, reprovado, publicado: o caso do fail-open.
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, true)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio('Texto de teste para a narração do portão.', { voice: 'Iapetus', segmentar: false });
    expect(audio.qa?.ok).toBe(false);
    expect(registrarDegradacao).toHaveBeenCalledTimes(1);
    const arg = registrarDegradacao.mock.calls[0][0];
    expect(arg.tipo).toBe('tts-qa-reprovado-publicado');
    expect(arg.fluxo).toBe('build');
    expect(String(arg.detalhe?.backend)).toBe('aistudio');
    expect(Number(arg.detalhe?.f0MedHz)).toBeGreaterThan(150);
  });

  it('o ramo PARALELO (sob demanda: podcast personalizado, devolutiva) também registra', async () => {
    // Dois ramos, dois call-sites do fail-open: o sequencial (fundo) e o paralelo
    // (a pessoa esperando). Testar um só deixava o outro publicar em silêncio.
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, true)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio('Texto de teste para a narração do portão.', { voice: 'Iapetus', segmentar: false, retakeParalelo: true });
    expect(audio.qa?.ok).toBe(false);
    expect(registrarDegradacao).toHaveBeenCalledTimes(1);
    expect(registrarDegradacao.mock.calls[0][0].tipo).toBe('tts-qa-reprovado-publicado');
  });

  it('take aprovado não registra degradação nenhuma', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, true)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio('Texto de teste para a narração do portão.', { voice: 'Aoede', segmentar: false });
    expect(audio.qa?.ok).toBe(true);
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });
});
