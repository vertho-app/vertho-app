/**
 * O MP3 do podcast sai MONO, leve e com a duração declarada.
 *
 * 🔴 O defeito (medido em 02/09/2026): uma pílula de 3min32 pesava 5,08 MB e o
 * player exibia "0:00 / 0:00". Três causas somadas, todas no encoder:
 *
 *  1. o sinal é MONO e era gravado em DOIS canais idênticos;
 *  2. voz falada a 192 kbps;
 *  3. o lamejs não escreve o quadro Xing/Info, e sem ele o player só descobre a
 *     duração depois de varrer o arquivo inteiro — daí o "0:00 / 0:00" enquanto
 *     os 5 MB chegavam.
 *
 * Este guard lê os BYTES gerados, não a configuração: uma constante corrigida e
 * um encoder que continua em estéreo passariam por qualquer teste de config.
 */
import { describe, it, expect } from 'vitest';
import { exportPodcastMp3FromPcm } from '@/lib/tts/audio-dsp';

const TAXA_ENTRADA = 24000;
const SEGUNDOS = 6;

/** PCM 16-bit mono com envelope — silêncio puro seria aparado na masterização. */
function tomPcm(segundos: number, taxa: number): Buffer {
  const total = segundos * taxa;
  const buf = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const env = 0.4 + 0.3 * Math.sin((2 * Math.PI * i) / (taxa * 2));
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / taxa) * 12000 * env), i * 2);
  }
  return buf;
}

/** Lê o primeiro frame MPEG de verdade e devolve seus parâmetros. */
function primeiroFrame(mp3: Buffer) {
  for (let i = 0; i < mp3.length - 4; i++) {
    if (mp3[i] !== 0xff || (mp3[i + 1] & 0xe0) !== 0xe0) continue;
    const versao = (mp3[i + 1] >> 3) & 0x03;
    const camada = (mp3[i + 1] >> 1) & 0x03;
    if (versao === 1 || camada === 0) continue;
    const modo = (mp3[i + 3] >> 6) & 0x03; // 3 = mono
    return { offset: i, mono: modo === 3 };
  }
  return null;
}

describe('MP3 do podcast', () => {
  const mp3 = exportPodcastMp3FromPcm(tomPcm(SEGUNDOS, TAXA_ENTRADA), TAXA_ENTRADA);

  it('produz bytes de MP3 (o guard não mede o nada)', () => {
    expect(mp3.length).toBeGreaterThan(1000);
    expect(primeiroFrame(mp3)).not.toBeNull();
  });

  it('declara a duração no quadro Xing/Info', () => {
    // Sem este quadro o player mostra "0:00 / 0:00" até baixar o arquivo todo.
    const inicio = mp3.subarray(0, 4096).toString('latin1');
    expect(inicio.includes('Info') || inicio.includes('Xing')).toBe(true);
  });

  it('grava voz em UM canal', () => {
    // Estéreo com dois canais idênticos dobra o arquivo sem nada em troca.
    expect(primeiroFrame(mp3)!.mono).toBe(true);
  });

  it('cabe num peso razoável para voz', () => {
    // 96 kbps = 12 KB/s. O teto abaixo pega uma volta a 192 kbps ou ao estéreo,
    // que é como o defeito se manifestaria de novo.
    const kbPorSegundo = mp3.length / SEGUNDOS / 1024;
    expect(kbPorSegundo).toBeLessThan(16);
  });
});
