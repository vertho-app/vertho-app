/**
 * Timing por PALAVRA (M4) via ASR da OpenAI — só para sincronizar legendas
 * e animações. NÃO gera voz (a voz continua sendo o Gemini TTS); o ASR apenas
 * ESCUTA o mp3 já gerado e devolve quando cada palavra é falada.
 *
 * Degrada com graça: sem OPENAI_API_KEY ou em qualquer erro, retorna null e o
 * montar-inputprops cai na heurística proporcional. Custo ~US$0,006/min —
 * irrelevante perto do avatar HeyGen.
 *
 * ⚠️ DEGRADAR NÃO É DE GRAÇA, e por isso agora ela é REGISTRADA. Sem `words`:
 * as legendas perdem o timing real E `speechStartFrame/EndFrame` ficam
 * undefined — 7 templates de cena (ConceptReveal, StepsFlow, IconStory,
 * DataDiagram, MythTruth, ComparisonMotion, MaturityLadder) usam esses cues
 * para entrar junto com a fala. Medido em 03/08: o projeto OpenAI ficou sem
 * acesso a modelo de áudio entre 25/06 e 14/07 e **139 vídeos** saíram assim,
 * sem ninguém ver, porque o único rastro era um console.warn no log do Trigger.
 * O modelo é configurável por env (`ASR_MODEL`) justamente para trocar sem
 * deploy quando o acesso mudar de nome (whisper-1 → gpt-4o-transcribe…).
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

export interface WordTime { word: string; start: number; end: number }

const MODELO = process.env.ASR_MODEL || 'whisper-1';

/** Uma linha por (modelo, motivo) por dia — o contador mostra o volume real. */
function registrar(motivo: string, detalhe: Record<string, unknown>) {
  // Sem await: a telemetria não pode atrasar (nem derrubar) o pipeline de vídeo.
  void registrarDegradacao({
    fluxo: 'video',
    tipo: DEGRADACAO.ALINHAMENTO_ASR_AUSENTE,
    chave: `${MODELO}:${motivo}`,
    severidade: 'aviso',
    detalhe: { modelo: MODELO, motivo, ...detalhe },
  });
}

/**
 * Transcreve o áudio e devolve as palavras com timestamps (ou null no fallback).
 *
 * `tentativa` é interna (retry). Medido em 04/08: minutos depois de o acesso ao
 * modelo ser liberado, 2 de 9 cenas ainda levaram 403 enquanto as outras 7
 * passavam — janela de propagação do lado da OpenAI, não permissão de verdade
 * (10/10 logo em seguida). Sem retry, uma cena perde o cue de fala para sempre:
 * o vídeo já foi renderizado. Por isso até 403 é re-tentado — aqui ele não
 * significa "nunca vai funcionar", significa "ainda não".
 */
export async function transcribeWords(
  mp3: Buffer,
  opts: { language?: string } = {},
  tentativa = 0,
): Promise<WordTime[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn('[asr] sem OPENAI_API_KEY — fallback p/ heurística');
    registrar('sem-api-key', {});
    return null;
  }
  const MAX_TENTATIVAS = 3;
  const retentavel = (status: number) => status === 403 || status === 429 || status >= 500;
  try {
    const form = new FormData();
    form.append('file', new Blob([mp3 as any], { type: 'audio/mpeg' }), 'narration.mp3');
    form.append('model', MODELO);
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
      const corpo = (await res.text()).slice(0, 160);
      if (retentavel(res.status) && tentativa + 1 < MAX_TENTATIVAS) {
        const espera = 1500 * 2 ** tentativa;
        console.warn(`[asr] ${MODELO} ${res.status} — re-tentando em ${espera}ms (${tentativa + 2}/${MAX_TENTATIVAS})`);
        await new Promise((r) => setTimeout(r, espera));
        return transcribeWords(mp3, opts, tentativa + 1);
      }
      console.warn(`[asr] ${MODELO} ${res.status}: ${corpo} — fallback p/ heurística`);
      registrar(`http-${res.status}`, { corpo, tentativas: tentativa + 1 });
      return null;
    }
    const data = await res.json();
    const words = Array.isArray(data?.words) ? data.words : [];
    const out: WordTime[] = words
      .filter((w: any) => typeof w?.start === 'number' && typeof w?.end === 'number')
      .map((w: any) => ({ word: String(w.word ?? ''), start: w.start, end: w.end }));
    // 200 OK com corpo sem palavras é falha silenciosa — conta como degradação.
    if (!out.length) {
      console.warn(`[asr] ${MODELO} respondeu sem palavras — fallback p/ heurística`);
      registrar('sem-palavras', { recebidas: words.length });
      return null;
    }
    return out;
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.warn('[asr] falhou, fallback p/ heurística:', msg);
    registrar(msg.includes('abort') ? 'timeout' : 'excecao', { erro: msg.slice(0, 160) });
    return null;
  }
}
