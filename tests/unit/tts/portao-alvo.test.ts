/**
 * `OpcoesPortao.alvo`: o alvo de F0 de UMA síntese, no lugar do alvo do elenco.
 *
 * Existe para o vídeo que reaproveita o avatar de outra célula do grupo: o miolo novo
 * tem de soar na altura do take que gerou aquele avatar. O risco que este arquivo
 * tranca é o de sempre com opção nova de portão: `generateNarrationAudio` repassa as
 * opções num objeto EXPLÍCITO, e uma opção que não for listada ali some calada —
 * a síntese sai "aprovada" contra o alvo errado, sem erro nenhum.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ELENCO } from '@/lib/tts/elenco';

vi.mock('@/lib/degradacao', async (original) => {
  const real = await original<typeof import('@/lib/degradacao')>();
  return { ...real, registrarDegradacao: vi.fn(async () => {}) };
});
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn(async () => true) }));
vi.mock('@/lib/tts/qa-log', () => ({ gravarVereditosTts: vi.fn(async () => true) }));

/** PCM 16-bit 24 kHz com fala sintética no F0 pedido (mesmo gerador de prazo-retake). */
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
    ok: true, status: 200, headers: new Map(), text: async () => '',
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] } }] }),
  };
}

const TEXTO = 'Texto de teste para a narração do portão com alvo por chamada.';
const MENTORA = ELENCO.mentora.voz;

describe('portão de TTS: alvo por chamada', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'fake';
    process.env.TTS_BACKEND = 'aistudio';
  });

  it('sem `alvo`, vale o do elenco: 208 Hz passa para a mentora', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, 208)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio(TEXTO, { voice: MENTORA, segmentar: false, tentativas: 1 });
    expect(audio.qa?.ok).toBe(true);
  });

  it('com `alvo` de outro take (180 Hz), o MESMO áudio de 208 Hz é recusado — a opção chegou ao portão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, 208)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    await expect(generateNarrationAudio(TEXTO, {
      voice: MENTORA, segmentar: false, tentativas: 1, alvo: { f0Hz: 180, tolSt: ELENCO.mentora.tolSt },
    })).rejects.toThrow('áudio não publicado');
  });

  it('com `alvo` casando o take (180 Hz), um áudio de 180 Hz passa — fora do alvo do elenco', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, 180)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio(TEXTO, {
      voice: MENTORA, segmentar: false, tentativas: 1, alvo: { f0Hz: 180, tolSt: ELENCO.mentora.tolSt },
    });
    expect(audio.qa?.ok).toBe(true);
  });

  it('`alvo: null` desliga a checagem de registro (e só ela)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaTts(25, 150)));
    const { generateNarrationAudio } = await import('@/lib/gemini-tts');
    const audio = await generateNarrationAudio(TEXTO, { voice: MENTORA, segmentar: false, tentativas: 1, alvo: null });
    expect(audio.qa?.ok).toBe(true);
  });
});
