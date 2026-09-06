/**
 * NARRAÇÃO ÚNICA do vídeo: um take para todas as cenas, cortado por alinhamento.
 *
 * Por que existe (06/09/2026). A narração era uma chamada de TTS POR CENA, e cada
 * chamada é um sorteio de registro, andamento e cor: `Medido` no vídeo de teste
 * 10e50d4a — abertura 2,1 st abaixo do miolo, 4,4 dB de diferença de nível entre
 * cenas (cada uma masterizada sozinha), articulação saltando 15-30 % entre cenas
 * vizinhas, timbre entre vizinhas até 0,32σ. O Rodrigo ouviu e chamou de
 * "continuidade ruim". Com o roteiro inteiro numa chamada só (como o podcast),
 * masterizado uma vez e cortado nas fronteiras das cenas, todas as cenas saem do
 * MESMO take: mesmo registro, mesmo ritmo, mesmo volume por construção.
 *
 * As fronteiras vêm do Whisper (timing por palavra), que o pipeline já roda para as
 * legendas: casa-se a sequência de palavras de cada cena com a transcrição, em ordem
 * monotônica, tolerando palavras que o ASR erra. Se uma cena casar mal, devolve
 * `null` e a task cai no caminho por cena (o de sempre), avisando.
 *
 * Puro: sem rede, sem ffmpeg. A síntese, o Whisper e o corte em PCM ficam na task.
 */
import type { WordTime } from './whisper-align';

export interface CenaNarrada { id: string; narration: string }

export interface FatiaCena {
  id: string;
  /** Início e fim do corte no áudio inteiro (segundos). */
  inicio: number;
  fim: number;
  /** Palavras da cena com timestamps RELATIVOS ao início da fatia. */
  words: WordTime[];
  /** Quantas palavras do roteiro da cena o ASR casou (diagnóstico). */
  casadas: number;
  total: number;
}

/** Separador entre cenas no texto único: parágrafo duplo = pausa natural do TTS na fronteira. */
export function montarTextoUnico(cenas: CenaNarrada[]): string {
  return cenas.map((c) => c.narration.trim()).filter(Boolean).join('\n\n');
}

/** Token comparável: sem acento, minúsculo, só letras e dígitos. */
export function normalizarToken(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Palavras do roteiro. Hífen, barra e travessão separam tokens: o Whisper devolve
 *  "Segunda-feira" como "Segunda" + "feira" (medido 06/09 no vídeo 10e50d4a — o token
 *  colado "segundafeira" não casava, e a fronteira caiu no meio da palavra). */
const SEPARADOR = /[\s\-‐-―\/]+/;
const tokens = (texto: string) => texto.split(SEPARADOR).map(normalizarToken).filter(Boolean);

/** O ASR também pode devolver "Segunda-feira" colado. Divide no hífen repartindo o
 *  tempo pelo tamanho das partes, para os dois lados falarem a mesma língua. */
export function expandirHifens(words: WordTime[]): WordTime[] {
  const out: WordTime[] = [];
  for (const w of words) {
    const partes = w.word.split(SEPARADOR).filter(Boolean);
    if (partes.length <= 1) { out.push(w); continue; }
    const total = partes.reduce((a, b) => a + b.length, 0) || 1;
    let t = w.start;
    for (const parte of partes) {
      const dur = (w.end - w.start) * (parte.length / total);
      out.push({ word: parte, start: t, end: t + dur });
      t += dur;
    }
  }
  return out;
}

/** Mínimo de palavras da cena que precisam casar com a transcrição. O Whisper erra
 *  nomes, siglas e números; 60 % em ordem já fixa a fronteira sem ambiguidade. */
const MIN_CASAMENTO = 0.6;
/** Janela de busca à frente por palavra (absorve inserções/erros do ASR). */
const JANELA = 8;
/** Respiro antes da 1ª palavra e depois da última (segundos). */
const CABECA_S = 0.12;
const CAUDA_S = 0.4;

/**
 * Casa as cenas com a transcrição e devolve as fatias. `null` = alinhamento
 * insuficiente em alguma cena (a task deve cair no caminho por cena).
 */
export function alinharCenas(wordsBrutas: WordTime[], cenas: CenaNarrada[], duracaoTotalS?: number): FatiaCena[] | null {
  if (!wordsBrutas?.length || !cenas.length) return null;
  const words = expandirHifens(wordsBrutas);
  const trans = words.map((w) => normalizarToken(w.word));
  let p = 0;
  const marcas: { id: string; primeiro: number; ultimo: number; primeiraCasou: boolean; casadas: number; total: number }[] = [];

  for (const cena of cenas) {
    const alvo = tokens(cena.narration);
    if (!alvo.length) return null;
    let primeiro = -1, ultimo = -1, casadas = 0;
    let primeiraCasou = false;
    for (let k = 0; k < alvo.length; k++) {
      const t = alvo[k];
      let achou = -1;
      for (let q = p; q < Math.min(words.length, p + JANELA); q++) {
        if (trans[q] === t) { achou = q; break; }
      }
      if (achou < 0) continue;
      if (primeiro < 0) { primeiro = achou; primeiraCasou = k === 0; }
      ultimo = achou;
      casadas++;
      p = achou + 1;
    }
    if (primeiro < 0 || casadas / alvo.length < MIN_CASAMENTO) return null;
    marcas.push({ id: cena.id, primeiro, ultimo, primeiraCasou, casadas, total: alvo.length });
  }

  // Fronteiras monotônicas: cada cena termina antes de a próxima começar.
  for (let i = 1; i < marcas.length; i++) {
    if (marcas[i].primeiro <= marcas[i - 1].ultimo) return null;
  }

  const fim = (i: number) => words[marcas[i].ultimo].end;
  const ini = (i: number) => words[marcas[i].primeiro].start;
  const total = duracaoTotalS ?? (words[words.length - 1].end + CAUDA_S);
  // Fronteira entre a cena i−1 e a cena i: o meio da MAIOR pausa entre a última
  // palavra casada de uma e a primeira casada da outra. Quando o ASR não casa
  // justamente uma palavra de borda (a 1ª da cena seguinte, a última da anterior),
  // sobram palavras "de ninguém" nesse trecho; o meio da pausa entre as duas casadas
  // cortava DENTRO delas (medido 06/09: "Segunda" ficou no fim da cena 1 e "feira"
  // abriu a cena 2). A maior pausa é onde o TTS respirou entre os parágrafos.
  const fronteira = (i: number) => {
    const a = marcas[i - 1].ultimo, b = marcas[i].primeiro;
    let melhor = a, gap = -1;
    for (let k = a; k < b; k++) {
      const g = words[k + 1].start - words[k].end;
      if (g > gap) { gap = g; melhor = k; }
    }
    return (words[melhor].end + words[melhor + 1].start) / 2;
  };
  const fatias: FatiaCena[] = [];
  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i];
    // A cabeça só encosta na 1ª palavra quando ela CASOU; se o ASR errou justamente
    // a 1ª palavra, a fatia começa na fronteira, para não cortar a palavra que ele
    // não ouviu.
    const fronteiraAntes = i === 0 ? Math.max(0, ini(0) - CAUDA_S) : fronteira(i);
    const inicio = m.primeiraCasou ? Math.max(fronteiraAntes, ini(i) - CABECA_S) : fronteiraAntes;
    const fronteiraDepois = i === marcas.length - 1 ? Math.min(total, fim(i) + CAUDA_S) : fronteira(i + 1);
    const fimFatia = Math.max(inicio + 0.2, fronteiraDepois);
    const ws = words
      .filter((w) => w.start >= inicio - 1e-6 && w.start < fimFatia)
      .map((w) => ({ word: w.word, start: Math.max(0, w.start - inicio), end: Math.max(0, w.end - inicio) }));
    fatias.push({ id: m.id, inicio, fim: fimFatia, words: ws, casadas: m.casadas, total: m.total });
  }
  return fatias;
}

/** Recorta PCM 16-bit mono entre dois instantes (segundos). */
export function fatiarPcm16(pcm: Buffer, sampleRate: number, inicioS: number, fimS: number): Buffer {
  const a = Math.max(0, Math.floor(inicioS * sampleRate)) * 2;
  const b = Math.min(pcm.length, Math.ceil(fimS * sampleRate) * 2);
  return pcm.subarray(a, Math.max(a, b));
}
