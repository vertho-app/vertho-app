// Contrato do alinhamento por ASR (lib/video/whisper-align.ts).
//
// O que está sob teste não é a OpenAI: é a REGRA DO PROJETO de que fallback
// pode existir, mas nunca invisível. `fetch` é stubado — se este arquivo bater
// na API de verdade, está errado.
//
// Por que existe: entre 25/06 e 14/07/2026 o projeto OpenAI perdeu acesso a
// modelos de áudio e **139 vídeos** foram gerados sem timing por palavra. As
// legendas caíram na heurística e `speechStartFrame/EndFrame` ficaram
// undefined (7 templates de cena dependem desses cues) — e o único rastro era
// um console.warn perdido no log do Trigger. Agora cada queda vira linha em
// `degradacao_log`, que a R10 do health lê.
//
// Invariantes (uma por `it`):
//   1. Erro HTTP → null E registra, com o status na chave de dedup.
//   2. 200 com palavras → devolve as palavras e NÃO registra nada.
//   3. 200 sem palavras (falha silenciosa) → null E registra.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registrarDegradacao = vi.fn();
vi.mock('@/lib/degradacao', () => ({
  registrarDegradacao: (...args: unknown[]) => registrarDegradacao(...args),
  DEGRADACAO: { ALINHAMENTO_ASR_AUSENTE: 'alinhamento-asr-ausente' },
}));

const MP3 = Buffer.from('fake-mp3');

async function carregar() {
  vi.resetModules();
  process.env.OPENAI_API_KEY = 'sk-test';
  return await import('@/lib/video/whisper-align');
}

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe('transcribeWords — degradação declarada', () => {
  beforeEach(() => {
    registrarDegradacao.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('erro HTTP persistente: re-tenta, devolve null e registra UMA vez, com o status na chave', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'does not have access to model',
    });
    const { transcribeWords } = await carregar();

    // O backoff é REAL (`1500 * 2 ** tentativa` em whisper-align): 1,5s + 3s =
    // 4,5s de espera contra o teto de 5s do vitest. Não era "timeout apertado" —
    // o teste passava com 500ms de folga e virava vermelho intermitente sempre
    // que a suíte disputava CPU. Timer falso tira a espera do relógio real: o
    // teste vira determinístico em vez de só ganhar um teto maior.
    vi.useFakeTimers();
    try {
      const p = transcribeWords(MP3);
      await vi.advanceTimersByTimeAsync(10_000); // cobre 1500 + 3000 com folga
      var r = await p;
    } finally {
      vi.useRealTimers();
    }

    expect(r).toBeNull();
    expect((globalThis.fetch as any).mock.calls).toHaveLength(3); // 1 + 2 retries
    expect(registrarDegradacao).toHaveBeenCalledTimes(1); // uma linha, não uma por tentativa
    const arg = registrarDegradacao.mock.calls[0][0] as any;
    expect(arg.fluxo).toBe('video');
    expect(arg.tipo).toBe('alinhamento-asr-ausente');
    expect(arg.chave).toContain('http-403'); // dedup por motivo: 403 ≠ timeout
  });

  it('403 transitório: a 2ª tentativa vence e NÃO registra degradação', async () => {
    // Foi o que aconteceu em 04/08: a liberação do modelo levou minutos para
    // valer em todas as chamadas, e 2 de 9 cenas perderam o alinhamento.
    (globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'ainda propagando' })
      .mockResolvedValueOnce(respostaOk({ words: [{ word: 'oi', start: 0, end: 0.3 }] }));
    const { transcribeWords } = await carregar();

    const r = await transcribeWords(MP3);

    expect(r).toHaveLength(1);
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('sucesso: devolve as palavras e NÃO registra degradação', async () => {
    (globalThis.fetch as any).mockResolvedValue(
      respostaOk({ words: [{ word: 'olá', start: 0.1, end: 0.4 }, { word: 'mundo', start: 0.4, end: 0.9 }] }),
    );
    const { transcribeWords } = await carregar();

    const r = await transcribeWords(MP3);

    expect(r).toHaveLength(2);
    expect(r?.[0]).toEqual({ word: 'olá', start: 0.1, end: 0.4 });
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('200 sem palavras é falha silenciosa: null e registra', async () => {
    (globalThis.fetch as any).mockResolvedValue(respostaOk({ words: [] }));
    const { transcribeWords } = await carregar();

    const r = await transcribeWords(MP3);

    expect(r).toBeNull();
    expect(registrarDegradacao).toHaveBeenCalledTimes(1);
    expect((registrarDegradacao.mock.calls[0][0] as any).chave).toContain('sem-palavras');
  });
});
