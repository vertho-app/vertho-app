/**
 * DSP de áudio para o pipeline de TTS (puro, sem I/O de rede): conversão WAV↔PCM,
 * fades, mix de silêncio, masterização (loudness + true-peak) e encode MP3.
 * Extraído de `lib/gemini-tts.ts` (M1) para isolar a manipulação de áudio do
 * orquestrador de TTS.
 */
import * as lamejsNs from '@breezystack/lamejs';
import { createRequire } from 'node:module';

// Interop CJS/ESM: no bundle do Next (ESM) o namespace expõe Mp3Encoder direto.
// Sob tsx os scripts compilam p/ CJS e o require do pacote cai no build IIFE
// (module.exports VAZIO — a condição "require" do exports aponta pro iife).
// Fallback: carrega o build ESM por caminho — Node ≥22 suporta require(esm).
function resolveLamejs(): typeof lamejsNs {
  const cand: any = (lamejsNs as any).default ?? lamejsNs;
  if (typeof cand?.Mp3Encoder === 'function') return cand;
  const base = typeof __filename !== 'undefined' ? __filename : (import.meta as any).url;
  const req = createRequire(base);
  const esm: any = req(req.resolve('@breezystack/lamejs').replace(/lamejs\.iife\.js$/, 'lamejs.js'));
  return typeof esm.Mp3Encoder === 'function' ? esm : esm.default;
}
const lamejs = resolveLamejs();

const MP3_SAMPLE_RATE = 44100;
/**
 * 96 kbps MONO para voz.
 *
 * `Medido: 02/09/2026` — a pílula de 3min32 saía com 5,08 MB: o encoder recebia
 * um sinal MONO e o gravava em DOIS canais idênticos, a 192 kbps. Para uma
 * narração falada isso é o dobro do dobro, e o preço é pago no play: enquanto o
 * arquivo carrega, o player mostra "0:00 / 0:00". Mesma narração a 96 kbps mono
 * fica em 2,54 MB, sem diferença audível em voz.
 */
const MP3_BITRATE_KBPS = 96;
const MP3_CANAIS = 1;
const TARGET_LUFS = -14;
const TRUE_PEAK_DB = -1.5;

/** Silêncio (PCM 16-bit mono) de `seconds` no sample-rate dado. */
export function silencePcm(seconds: number, sampleRate: number): Buffer {
  return Buffer.alloc(Math.max(0, Math.round(seconds * sampleRate)) * 2);
}

/** Aplica fade-in/out linear (em segundos) sobre PCM 16-bit mono. */
export function fadePcm16(pcm: Buffer, sampleRate: number, fadeInSeconds: number, fadeOutSeconds: number): Buffer {
  const out = Buffer.from(pcm);
  const frames = Math.floor(out.length / 2);
  const fadeInFrames = Math.min(frames, Math.max(0, Math.round(fadeInSeconds * sampleRate)));
  const fadeOutFrames = Math.min(frames, Math.max(0, Math.round(fadeOutSeconds * sampleRate)));

  for (let i = 0; i < fadeInFrames; i++) {
    const gain = i / Math.max(1, fadeInFrames);
    out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * gain), i * 2);
  }

  for (let i = 0; i < fadeOutFrames; i++) {
    const frame = frames - fadeOutFrames + i;
    const gain = 1 - (i / Math.max(1, fadeOutFrames));
    out.writeInt16LE(Math.round(out.readInt16LE(frame * 2) * gain), frame * 2);
  }

  return out;
}

function parsePcm16Wav(wav: Buffer): { channels: number; sampleRate: number; pcm: Buffer } {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Vinheta WAV inválida');
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let pcm: Buffer | null = null;

  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;

    if (id === 'fmt ') {
      audioFormat = wav.readUInt16LE(start);
      channels = wav.readUInt16LE(start + 2);
      sampleRate = wav.readUInt32LE(start + 4);
      bitsPerSample = wav.readUInt16LE(start + 14);
    } else if (id === 'data') {
      pcm = wav.subarray(start, end);
    }

    offset = end + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || !channels || !sampleRate || !pcm) {
    throw new Error('Vinheta WAV precisa ser PCM 16-bit');
  }

  return { channels, sampleRate, pcm };
}

function sampleAt(pcm: Buffer, frame: number, channel: number, channels: number): number {
  const offset = (frame * channels + channel) * 2;
  return offset + 1 < pcm.length ? pcm.readInt16LE(offset) : 0;
}

/** Lê um WAV PCM 16-bit e devolve PCM mono reamostrado p/ `targetRate`. */
export function wavToMonoPcm16AtRate(wav: Buffer, targetRate: number): Buffer {
  const source = parsePcm16Wav(wav);
  const sourceFrames = Math.floor(source.pcm.length / (source.channels * 2));
  const targetFrames = Math.max(1, Math.round(sourceFrames * targetRate / source.sampleRate));
  const out = Buffer.alloc(targetFrames * 2);

  for (let i = 0; i < targetFrames; i++) {
    const sourcePos = i * source.sampleRate / targetRate;
    const leftFrame = Math.min(sourceFrames - 1, Math.floor(sourcePos));
    const rightFrame = Math.min(sourceFrames - 1, leftFrame + 1);
    const ratio = sourcePos - leftFrame;
    let mixed = 0;

    for (let ch = 0; ch < source.channels; ch++) {
      const left = sampleAt(source.pcm, leftFrame, ch, source.channels);
      const right = sampleAt(source.pcm, rightFrame, ch, source.channels);
      mixed += left + (right - left) * ratio;
    }

    const mono = Math.max(-32768, Math.min(32767, Math.round(mixed / source.channels)));
    out.writeInt16LE(mono, i * 2);
  }

  return out;
}

function pcm16Peak(pcm: Buffer): number {
  let peak = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)) / 32768);
  }
  return peak;
}

function pcm16Rms(pcm: Buffer): number {
  let sumSquares = 0;
  let count = 0;
  const gate = 10 ** (-70 / 20);

  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset) / 32768;
    if (Math.abs(sample) < gate) continue;
    sumSquares += sample * sample;
    count++;
  }

  return count ? Math.sqrt(sumSquares / count) : 0;
}

function masterPodcastPcm(pcm: Buffer): Buffer {
  const peak = pcm16Peak(pcm);
  const rms = pcm16Rms(pcm);
  if (!peak || !rms) return pcm;

  const currentLufsApprox = 20 * Math.log10(rms);
  const loudnessGain = 10 ** ((TARGET_LUFS - currentLufsApprox) / 20);
  const peakCeiling = 10 ** (TRUE_PEAK_DB / 20);
  const peakGain = peakCeiling / peak;
  const gain = Math.min(loudnessGain, peakGain);
  const out = Buffer.alloc(pcm.length);

  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = Math.round(pcm.readInt16LE(offset) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), offset);
  }

  return out;
}

function resampleMonoPcm16(pcm: Buffer, sourceRate: number, targetRate: number): Int16Array {
  const sourceFrames = Math.floor(pcm.length / 2);
  const targetFrames = Math.max(1, Math.round(sourceFrames * targetRate / sourceRate));
  const out = new Int16Array(targetFrames);

  for (let i = 0; i < targetFrames; i++) {
    const sourcePos = i * sourceRate / targetRate;
    const leftFrame = Math.min(sourceFrames - 1, Math.floor(sourcePos));
    const rightFrame = Math.min(sourceFrames - 1, leftFrame + 1);
    const ratio = sourcePos - leftFrame;
    const left = pcm.readInt16LE(leftFrame * 2);
    const right = pcm.readInt16LE(rightFrame * 2);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(left + (right - left) * ratio)));
  }

  return out;
}

function encodeMp3(mono: Int16Array): Buffer {
  const encoder = new lamejs.Mp3Encoder(MP3_CANAIS, MP3_SAMPLE_RATE, MP3_BITRATE_KBPS);
  const chunks: Buffer[] = [];
  const blockSize = 1152;

  for (let i = 0; i < mono.length; i += blockSize) {
    const bloco = mono.subarray(i, i + blockSize);
    // Mono: o lamejs ignora o 2º argumento quando o encoder tem 1 canal.
    const encoded = encoder.encodeBuffer(bloco, bloco);
    if (encoded.length) chunks.push(Buffer.from(encoded));
  }

  const end = encoder.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

/**
 * Escreve o quadro Xing/Info na frente do MP3.
 *
 * O lamejs não gera esse quadro, e sem ele o player não sabe a DURAÇÃO nem
 * consegue posicionar a barra até ter varrido o arquivo inteiro: é o
 * "0:00 / 0:00" que a pílula de 5 MB exibia enquanto carregava. O quadro tem o
 * tamanho de um frame normal (por isso é silencioso na reprodução) e carrega a
 * contagem de frames e de bytes — o suficiente para a duração aparecer na hora.
 *
 * Em CBR o identificador é "Info" (o "Xing" é o do VBR). O offset do
 * identificador dentro do frame depende de versão e canais: MPEG1 mono = 21,
 * MPEG1 estéreo = 36.
 */
export function prependXingHeader(mp3: Buffer, canais: number, sampleRate: number, bitrateKbps: number): Buffer {
  if (mp3.length < 4) return mp3;
  // O quadro copia o cabeçalho do PRIMEIRO frame real: assim versão, taxa e
  // sample rate declarados batem exatamente com o resto do arquivo.
  const cabecalho = mp3.subarray(0, 4);
  const tamanhoFrame = Math.floor((1152 / 8) * bitrateKbps * 1000 / sampleRate);
  const quadro = Buffer.alloc(tamanhoFrame, 0);
  cabecalho.copy(quadro, 0);

  const offsetTag = canais === 1 ? 21 : 36;
  if (offsetTag + 16 > tamanhoFrame) return mp3;
  quadro.write('Info', offsetTag, 'ascii');
  // flags: bit0 = frames, bit1 = bytes
  quadro.writeUInt32BE(0x00000003, offsetTag + 4);
  const totalFrames = Math.max(1, Math.round(mp3.length / tamanhoFrame));
  quadro.writeUInt32BE(totalFrames, offsetTag + 8);
  quadro.writeUInt32BE(mp3.length + tamanhoFrame, offsetTag + 12);
  return Buffer.concat([quadro, mp3]);
}

/**
 * Masteriza (loudness/true-peak) + reamostra p/ 44.1k + encoda MP3 MONO, com o
 * quadro Xing/Info na frente para o player saber a duração antes de baixar tudo.
 */
export function exportPodcastMp3FromPcm(pcm: Buffer, sampleRate: number): Buffer {
  const mastered = masterPodcastPcm(pcm);
  const mono441 = resampleMonoPcm16(mastered, sampleRate, MP3_SAMPLE_RATE);
  return prependXingHeader(encodeMp3(mono441), MP3_CANAIS, MP3_SAMPLE_RATE, MP3_BITRATE_KBPS);
}

/**
 * MP3 SEM masterização — para fatias de um áudio que JÁ foi masterizado inteiro.
 *
 * `Medido 06/09/2026`: as 9 cenas de um vídeo, cada uma masterizada sozinha, saíam
 * com 4,4 dB de diferença de nível entre si (o ganho é limitado pelo pico DA CENA).
 * Masterizar a narração inteira uma vez e só então cortar preserva o mesmo ganho
 * em todas as cenas por construção — daí este export sem `masterPodcastPcm`.
 */
export function pcmToMp3SemMaster(pcm: Buffer, sampleRate: number): Buffer {
  const mono441 = resampleMonoPcm16(pcm, sampleRate, MP3_SAMPLE_RATE);
  return prependXingHeader(encodeMp3(mono441), MP3_CANAIS, MP3_SAMPLE_RATE, MP3_BITRATE_KBPS);
}
