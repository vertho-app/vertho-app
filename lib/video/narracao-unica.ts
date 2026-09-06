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
/** Respiro antes da 1ª palavra do take e depois da última (segundos). */
const CAUDA_S = 0.4;
/** Janela do PCM que procura o ponto mais silencioso da pausa entre cenas. */
const JANELA_SILENCIO_S = 0.1;

/**
 * Casa as cenas com a transcrição e devolve as fatias. `null` = alinhamento
 * insuficiente em alguma cena (a task deve cair no caminho por cena).
 */
export function alinharCenas(wordsBrutas: WordTime[], cenas: CenaNarrada[], duracaoTotalS?: number, pcm?: Buffer, sampleRate?: number): FatiaCena[] | null {
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
  // Com o PCM na mão, o corte vai para o ponto mais SILENCIOSO dessa pausa, não para
  // o meio dela: o Whisper marca o início da palavra ATRASADO (medido 06/09 em 5 de 8
  // cenas: energia de fala já 120 ms antes do `start`), então uma cabeça fixa antes
  // do `start` cortava o ataque da 1ª palavra, e o meio geométrico da pausa pode
  // estar mais perto da fala do que parece. As fatias são CONTÍGUAS (o fim de uma é
  // o início da outra): nada da pausa se perde, nada da fala se corta.
  const fronteira = (i: number) => {
    const a = marcas[i - 1].ultimo, b = marcas[i].primeiro;
    let melhor = a, gap = -1;
    for (let k = a; k < b; k++) {
      const g = words[k + 1].start - words[k].end;
      if (g > gap) { gap = g; melhor = k; }
    }
    const meio = (words[melhor].end + words[melhor + 1].start) / 2;
    if (!pcm || !sampleRate) return meio;
    const de = Math.max(0, words[melhor].end - 0.1);
    const ate = Math.max(de + JANELA_SILENCIO_S, words[melhor + 1].start - 0.05);
    const cand: { t: number; r: number }[] = [];
    for (let t = de; t + JANELA_SILENCIO_S <= ate + 1e-9; t += 0.01) cand.push({ t: t + JANELA_SILENCIO_S / 2, r: rms(pcm, sampleRate, t, t + JANELA_SILENCIO_S) });
    if (!cand.length) return meio;
    const minimo = Math.min(...cand.map((c) => c.r));
    // entre as janelas a até 3 dB do mínimo, a mais perto do meio (não encosta em nenhuma das palavras)
    const quietas = cand.filter((c) => c.r <= minimo * Math.pow(10, 3 / 20));
    return quietas.reduce((q, c) => (Math.abs(c.t - meio) < Math.abs(q.t - meio) ? c : q)).t;
  };
  const fronteiras: number[] = [];
  for (let i = 1; i < marcas.length; i++) fronteiras[i] = fronteira(i);
  const fatias: FatiaCena[] = [];
  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i];
    const inicio = i === 0 ? Math.max(0, ini(0) - CAUDA_S) : fronteiras[i];
    const fronteiraDepois = i === marcas.length - 1 ? Math.min(total, fim(i) + CAUDA_S) : fronteiras[i + 1];
    const fimFatia = Math.max(inicio + 0.2, fronteiraDepois);
    const ws = words
      .filter((w) => w.start >= inicio - 1e-6 && w.start < fimFatia)
      .map((w) => ({ word: w.word, start: Math.max(0, w.start - inicio), end: Math.max(0, w.end - inicio) }));
    fatias.push({ id: m.id, inicio, fim: fimFatia, words: ws, casadas: m.casadas, total: m.total });
  }
  return fatias;
}

export interface AvisoFronteira { id: string; motivo: string }

/** Quantos tokens de borda da cena vizinha se procura na fatia (vazamento). */
const BORDA = 3;
/** Janela de energia ao redor do corte e quanto abaixo da fala ela precisa ficar. */
const JANELA_CORTE_S = 0.05;
const SILENCIO_MIN_DB = 10;

function rms(pcm: Buffer, sampleRate: number, deS: number, ateS: number): number {
  const a = Math.max(0, Math.floor(deS * sampleRate)), b = Math.min(pcm.length / 2, Math.ceil(ateS * sampleRate));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) { const v = pcm.readInt16LE(i * 2) / 32768; s += v * v; }
  return Math.sqrt(s / (b - a));
}

/**
 * QA das fatias, ancorado no ROTEIRO e no ÁUDIO (não no ASR que fez o corte):
 *  (a) vazamento: a fatia não pode terminar com uma palavra das primeiras da cena
 *      seguinte, nem começar com uma das últimas da cena anterior. Foi assim que
 *      "Segunda" (1ª palavra da cena 2) apareceu no fim da cena 1 em 06/09; WER e
 *      régua de deriva não veem isso, só as palavras de borda.
 *  (b) silêncio no corte: a energia ±50 ms ao redor de cada fronteira tem que ficar
 *      SILENCIO_MIN_DB abaixo do nível mediano de fala da fatia. Corte no meio de
 *      palavra não tem pausa. Só roda quando o PCM é passado.
 * Devolve avisos (vazio = passou). Quem chama decide: a task cai no caminho por cena.
 */
export function validarFatias(fatias: FatiaCena[], cenas: CenaNarrada[], pcm?: Buffer, sampleRate?: number): AvisoFronteira[] {
  const avisos: AvisoFronteira[] = [];
  const alvos = cenas.map((c) => tokens(c.narration));
  for (let i = 0; i < fatias.length; i++) {
    const f = fatias[i];
    const ws = f.words.map((w) => normalizarToken(w.word)).filter(Boolean);
    if (!ws.length) { avisos.push({ id: f.id, motivo: 'fatia sem palavras' }); continue; }
    const ultima = ws[ws.length - 1], primeira = ws[0];
    const proximaCena = alvos[i + 1], cenaAnterior = alvos[i - 1];
    if (proximaCena && !alvos[i].includes(ultima) && proximaCena.slice(0, BORDA).includes(ultima)) {
      avisos.push({ id: f.id, motivo: `termina com "${f.words[f.words.length - 1].word}", que abre a cena seguinte` });
    }
    if (cenaAnterior && !alvos[i].includes(primeira) && cenaAnterior.slice(-BORDA).includes(primeira)) {
      avisos.push({ id: f.id, motivo: `começa com "${f.words[0].word}", que fecha a cena anterior` });
    }
    if (pcm && sampleRate && i > 0) {
      // Mede na FRONTEIRA (fim da fatia anterior = meio da maior pausa), não em
      // `f.inicio`: a cabeça fica 120 ms antes da 1ª palavra segundo o Whisper, e o
      // Whisper marca o início atrasado — medido 06/09, todas as 8 fronteiras de um
      // take limpo acusavam "4-7 dB abaixo da fala" ali, enquanto o meio da pausa
      // está no piso de ruído.
      const fronteira = fatias[i - 1].fim;
      const corte = rms(pcm, sampleRate, fronteira - JANELA_CORTE_S, fronteira + JANELA_CORTE_S);
      // nível de fala da fatia = mediana das janelas de 50 ms (robusta às pausas)
      const niveis: number[] = [];
      for (let t = f.inicio; t + JANELA_CORTE_S <= f.fim; t += JANELA_CORTE_S) niveis.push(rms(pcm, sampleRate, t, t + JANELA_CORTE_S));
      niveis.sort((a, b) => a - b);
      const fala = niveis[Math.floor(niveis.length / 2)] || 0;
      if (fala > 0 && corte > fala * Math.pow(10, -SILENCIO_MIN_DB / 20)) {
        avisos.push({ id: f.id, motivo: `corte em ${fronteira.toFixed(2)}s sem pausa (${(20 * Math.log10(corte / fala)).toFixed(0)} dB abaixo da fala; mínimo ${SILENCIO_MIN_DB})` });
      }
    }
  }
  return avisos;
}

/** `ok` com `fatias`, ou recusa com `motivo`. (Não é união discriminada de propósito:
 *  com `strict: false` o TypeScript não estreita por booleano.) */
export interface PlanoNarracao { ok: boolean; fatias?: FatiaCena[]; motivo?: string }

/**
 * Decisão completa da narração única: alinha e valida. `ok: false` = a task cai no
 * caminho por cena com o motivo no log (fail-open declarado, nunca corte no chute).
 * Puro, para o roteamento de recusa ter teste sem subir a task.
 */
export function planejarNarracaoUnica(words: WordTime[], cenas: CenaNarrada[], duracaoTotalS?: number, pcm?: Buffer, sampleRate?: number): PlanoNarracao {
  const fatias = alinharCenas(words, cenas, duracaoTotalS, pcm, sampleRate);
  if (!fatias) return { ok: false, motivo: 'alinhamento cena × transcrição insuficiente' };
  const avisos = validarFatias(fatias, cenas, pcm, sampleRate);
  if (avisos.length) return { ok: false, motivo: `fronteira suspeita: ${avisos.map((a) => `${a.id} ${a.motivo}`).join(' · ')}` };
  return { ok: true, fatias };
}

/** Cabeça de silêncio que a composição exige: `trimBefore={1}` pula os primeiros 33 ms
 *  do áudio de cada cena (compensação do offset do Remotion), então a fala não pode
 *  começar antes disso. Mede os primeiros `minS` contra o nível mediano de fala e, se
 *  já houver voz ali, prefixa `padS` de silêncio. Devolve o deslocamento aplicado (0 se
 *  nada mudou) para quem tem timestamps relativos (palavras) corrigir. */
export const CABECA_SILENCIO_MIN_S = 0.1;
export const CABECA_SILENCIO_PAD_S = 0.15;

export function garantirCabecaSilenciosa(pcm: Buffer, sampleRate: number, minS = CABECA_SILENCIO_MIN_S, padS = CABECA_SILENCIO_PAD_S): { pcm: Buffer; deslocamentoS: number } {
  const durS = pcm.length / 2 / sampleRate;
  if (durS <= minS) return { pcm, deslocamentoS: 0 };
  const cabeca = rms(pcm, sampleRate, 0, minS);
  const niveis: number[] = [];
  for (let t = 0; t + JANELA_CORTE_S <= durS; t += JANELA_CORTE_S) niveis.push(rms(pcm, sampleRate, t, t + JANELA_CORTE_S));
  niveis.sort((a, b) => a - b);
  const fala = niveis[Math.floor(niveis.length / 2)] || 0;
  if (!(fala > 0) || cabeca <= fala * Math.pow(10, -SILENCIO_MIN_DB / 20)) return { pcm, deslocamentoS: 0 };
  const pad = Buffer.alloc(Math.round(padS * sampleRate) * 2);
  return { pcm: Buffer.concat([pad, pcm]), deslocamentoS: padS };
}

/** Recorta PCM 16-bit mono entre dois instantes (segundos). */
export function fatiarPcm16(pcm: Buffer, sampleRate: number, inicioS: number, fimS: number): Buffer {
  const a = Math.max(0, Math.floor(inicioS * sampleRate)) * 2;
  const b = Math.min(pcm.length, Math.ceil(fimS * sampleRate) * 2);
  return pcm.subarray(a, Math.max(a, b));
}
