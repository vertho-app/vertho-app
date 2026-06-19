/**
 * Timing por PALAVRA (M4) via OpenAI Whisper (ASR) — só para sincronizar legendas
 * e animações. NÃO gera voz (a voz continua sendo o Gemini TTS); o Whisper apenas
 * ESCUTA o mp3 já gerado e devolve quando cada palavra é falada.
 *
 * Degrada com graça: sem OPENAI_API_KEY ou em qualquer erro, retorna null e o
 * montar-inputprops cai na heurística proporcional (comportamento atual). Custo
 * ~US$0,006/min — irrelevante perto do avatar HeyGen.
 */
export interface WordTime { word: string; start: number; end: number }

/** Transcreve o áudio e devolve as palavras com timestamps (ou null no fallback). */
export async function transcribeWords(mp3: Buffer, opts: { language?: string } = {}): Promise<WordTime[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const form = new FormData();
    form.append('file', new Blob([mp3 as any], { type: 'audio/mpeg' }), 'narration.mp3');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', opts.language || 'pt');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.warn(`whisper ${res.status}: ${(await res.text()).slice(0, 160)} — fallback p/ heurística`);
      return null;
    }
    const data = await res.json();
    const words = Array.isArray(data?.words) ? data.words : [];
    const out: WordTime[] = words
      .filter((w: any) => typeof w?.start === 'number' && typeof w?.end === 'number')
      .map((w: any) => ({ word: String(w.word ?? ''), start: w.start, end: w.end }));
    return out.length ? out : null;
  } catch (e) {
    console.warn('whisper falhou, fallback p/ heurística:', (e as Error)?.message);
    return null;
  }
}
