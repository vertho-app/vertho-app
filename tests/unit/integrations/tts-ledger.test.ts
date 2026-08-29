import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Contrato do ledger de TTS (`lib/gemini-tts` → `ia_usage_log`).
 *
 * Por que existe: até 29/08/2026 o TTS não gravava NADA no ledger — zero linha
 * com `model ilike '%tts%'` em 90 dias, contra 210 vídeos e 227 podcasts pagos
 * no período. O custo do TTS era estimativa de catálogo, não medição.
 *
 * O que este teste protege, e que não é óbvio:
 *   1. o custo não pode sair `null` — `costFromTokens` faz lookup EXATO e o id
 *      real tem sufixo `-preview`;
 *   2. `source` tem que carregar o BACKEND, porque `TTS_BACKEND` é *Sensitive*
 *      na Vercel e o runtime é a única testemunha de qual backend produção usa;
 *   3. resposta 200 SEM áudio também é paga, e também precisa aparecer.
 *
 * `fetch` é stubado; nenhuma chamada real de API sai daqui.
 */

const gravadas: any[] = [];
vi.mock('@/lib/ia-ledger', () => ({
  gravarLinhaLedger: async (linha: any) => { gravadas.push(linha); return true; },
}));

/** Resposta 200 com PCM 16-bit 24kHz mono (silêncio) + usageMetadata real. */
function respostaComAudio(opts: { inTok?: number; outTok?: number; segundos?: number } = {}) {
  const segundos = opts.segundos ?? 0.2;
  const pcm = Buffer.alloc(Math.round(24000 * segundos) * 2);
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      candidates: [{
        content: { parts: [{ inlineData: { mimeType: 'audio/l16; rate=24000; channels=1', data: pcm.toString('base64') } }] },
        finishReason: 'STOP',
      }],
      usageMetadata: {
        promptTokenCount: opts.inTok ?? 23,
        candidatesTokenCount: opts.outTok ?? 93,
        candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: opts.outTok ?? 93 }],
      },
    }),
  } as any;
}

/** Resposta 200 SEM áudio (recusa do modelo) — o caso que some do custo. */
function respostaSemAudio(finishReason = 'SAFETY') {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason }],
      usageMetadata: { promptTokenCount: 31, candidatesTokenCount: 0 },
    }),
  } as any;
}

async function carregarTts(backend: 'aistudio' | 'vertex') {
  vi.resetModules();
  vi.stubEnv('TTS_BACKEND', backend);
  vi.stubEnv('GEMINI_API_KEY', 'chave-de-teste');
  vi.stubEnv('GEMINI_TTS_MODEL', 'gemini-3.1-flash-tts-preview');
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '');
  return import('@/lib/gemini-tts');
}

describe('ledger do TTS', () => {
  beforeEach(() => { gravadas.length = 0; });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('grava uma linha por síntese, com custo REAL a partir dos tokens de áudio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaComAudio({ inTok: 23, outTok: 93 })));
    const { generateNarrationAudio } = await carregarTts('aistudio');

    await generateNarrationAudio('Uma frase curta e única para o ledger.', {
      ledger: { feature: 'tts_devolutiva', empresaId: 'emp-1', colaboradorId: 'colab-1' },
    });

    expect(gravadas).toHaveLength(1);
    const linha = gravadas[0];
    expect(linha.feature).toBe('tts_devolutiva');
    expect(linha.empresa_id).toBe('emp-1');
    expect(linha.colaborador_id).toBe('colab-1');
    expect(linha.provider).toBe('gemini');
    expect(linha.model).toBe('gemini-3.1-flash-tts-preview');
    expect(linha.input_tokens).toBe(23);
    expect(linha.output_tokens).toBe(93);
    expect(linha.status).toBe('ok');

    // O custo é o ponto: sem a entrada `-preview` no catálogo isto seria null, e
    // "instrumentar o TTS" teria produzido 100% de linhas sem custo.
    // 23×$1/1M + 93×$20/1M = $0,000023 + $0,00186
    expect(linha.cost_usd).toBeCloseTo((23 * 1 + 93 * 20) / 1_000_000, 12);
    expect(linha.cost_usd).toBeGreaterThan(0);
  });

  it('carrega o BACKEND em `source` — é a única testemunha de uma env Sensitive', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaComAudio()));
    const aiStudio = await carregarTts('aistudio');
    await aiStudio.generateNarrationAudio('Frase de teste do backend.', { ledger: { feature: 'tts_video_cena' } });
    expect(gravadas.at(-1).source).toBe('tts:aistudio');

    // No Vertex o endpoint exige OAuth; stubamos o token para não sair da máquina.
    vi.doMock('@/lib/tts/google-token', () => ({
      getGoogleAccessToken: async () => 'token-de-teste',
      vertexProjectId: () => 'projeto-de-teste',
    }));
    const vertex = await carregarTts('vertex');
    await vertex.generateNarrationAudio('Frase de teste do backend.', { ledger: { feature: 'tts_video_cena' } });
    expect(gravadas.at(-1).source).toBe('tts:vertex');
    vi.doUnmock('@/lib/tts/google-token');
  });

  it('registra a resposta 200 SEM áudio (paga, e hoje invisível) com o motivo', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaSemAudio('SAFETY'))
      .mockResolvedValue(respostaComAudio());
    vi.stubGlobal('fetch', fetchMock);
    const { generateNarrationAudio } = await carregarTts('aistudio');

    const promessa = generateNarrationAudio('Uma frase que o modelo recusa na primeira.', {
      ledger: { feature: 'tts_podcast' },
    });
    await vi.advanceTimersByTimeAsync(3_000); // backoff da 1ª tentativa (2s)
    await promessa;

    expect(gravadas).toHaveLength(2);
    expect(gravadas[0].status).toBe('sem-audio:SAFETY');
    expect(gravadas[0].output_tokens).toBe(0);
    expect(gravadas[0].input_tokens).toBe(31); // o input FOI processado e cobrado
    expect(gravadas[1].status).toBe('ok');
  });

  it('usa etiqueta própria por default — nunca `untagged` mudo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaComAudio()));
    const { generateNarrationAudio } = await carregarTts('aistudio');
    await generateNarrationAudio('Sem ledger declarado pelo call-site.');
    expect(gravadas.at(-1).feature).toBe('tts_narracao');
  });
});
