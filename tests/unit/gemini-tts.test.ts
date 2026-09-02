import { describe, expect, it } from 'vitest';
import {
  addPodcastBrandSting,
  buildPersonalizedPodcastNarration,
  ensurePodcastBrandNarration,
  exportPodcastMp3FromPcm,
  extractNarration,
} from '@/lib/gemini-tts';

function maxAbsSample(pcm: Buffer): number {
  let max = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    max = Math.max(max, Math.abs(pcm.readInt16LE(offset)));
  }
  return max;
}

function firstMp3Frame(mp3: Buffer): { bitrateKbps: number; sampleRate: number; channels: number } {
  for (let i = 0; i + 4 < mp3.length; i++) {
    if (mp3[i] !== 0xff || (mp3[i + 1] & 0xe0) !== 0xe0) continue;

    const bitrateIndex = (mp3[i + 2] >> 4) & 0x0f;
    const sampleRateIndex = (mp3[i + 2] >> 2) & 0x03;
    const channelMode = (mp3[i + 3] >> 6) & 0x03;
    const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const sampleRates = [44100, 48000, 32000];

    return {
      bitrateKbps: bitrates[bitrateIndex],
      sampleRate: sampleRates[sampleRateIndex],
      channels: channelMode === 3 ? 1 : 2,
    };
  }

  throw new Error('MP3 frame não encontrado');
}

describe('extractNarration', () => {
  it('preserva speakers do roteiro mentor + campo para TTS multi-speaker', () => {
    const roteiro = `TÍTULO: Conversa difícil

OBJETIVO PEDAGÓGICO: Praticar uma conversa direta.

=== ROTEIRO COM FALAS ===
VOZ 2: Eu travei na hora de dar o retorno.
VOZ 1: O ponto é separar fato, impacto e pedido.

=== TTS MULTI-SPEAKER (LIMPO) ===
Campo: Eu travei na hora de dar o retorno.
Mentor: O ponto é separar fato, impacto e pedido.`;

    expect(extractNarration(roteiro)).toBe(
      'Campo: Eu travei na hora de dar o retorno.\nMentor: O ponto é separar fato, impacto e pedido.',
    );
  });

  it('mantém compatibilidade com o bloco de narração solo', () => {
    const roteiro = `TÍTULO: Conversa difícil

=== NARRAÇÃO (TEXTO LIMPO) ===
Dar retorno difícil exige clareza... e cuidado.

=== NARRAÇÃO (COM MARCAÇÕES) ===
Dar retorno difícil exige *clareza* <break time="0.5s" /> e cuidado.`;

    expect(extractNarration(roteiro)).toBe('Dar retorno difícil exige clareza... e cuidado.');
  });

  it('remove rubricas de vinheta antes de enviar o texto ao TTS', () => {
    const roteiro = `TÍTULO: Conversa difícil

=== NARRAÇÃO (TEXTO LIMPO) ===
[VINHETA DE ABERTURA: 2 segundos, fade out]
Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.
Dar retorno difícil exige clareza.
[VINHETA DE FECHAMENTO: 2 segundos, mesmo tema]

=== NARRAÇÃO (COM MARCAÇÕES) ===
Este é o MentorIA na prática.`;

    expect(extractNarration(roteiro)).toBe(
      'Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.\nDar retorno difícil exige clareza.',
    );
  });

  it('insere vinheta sonora no PCM final do podcast', () => {
    const sampleRate = 24000;
    const oneSecondPcm = Buffer.alloc(sampleRate * 2);
    const withSting = addPodcastBrandSting(oneSecondPcm, sampleRate);

    expect(withSting.length).toBeGreaterThan(oneSecondPcm.length + sampleRate * 2 * 10);
    expect(withSting.subarray(0, sampleRate * 2).some((byte) => byte !== 0)).toBe(true);
    expect(withSting.subarray(-sampleRate * 2).some((byte) => byte !== 0)).toBe(true);
    expect(maxAbsSample(withSting.subarray(0, sampleRate * 2))).toBeGreaterThan(3000);
    expect(maxAbsSample(withSting.subarray(-(sampleRate * 2 * 2)))).toBeGreaterThan(3000);
  });

  it('exporta o podcast final como MP3 real 44.1kHz mono 96kbps', () => {
    const sampleRate = 24000;
    const pcm = Buffer.alloc(sampleRate * 2);
    for (let i = 0; i < sampleRate; i++) {
      pcm.writeInt16LE(Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 3000), i * 2);
    }

    const mp3 = exportPodcastMp3FromPcm(pcm, sampleRate);
    const frame = firstMp3Frame(mp3);

    expect(mp3.toString('ascii', 0, 4)).not.toBe('RIFF');
    expect(frame.sampleRate).toBe(44100);
    // Voz falada é MONO a 96 kbps desde 02/09/2026: o encoder gravava o mesmo
    // sinal em dois canais a 192 kbps, e uma pílula de 3min32 pesava 5,08 MB —
    // o player exibia "0:00 / 0:00" enquanto o arquivo chegava.
    expect(frame.channels).toBe(1);
    expect(frame.bitrateKbps).toBe(96);
  });

  it('garante locução padrão de fechamento sem reinserir a abertura falada', () => {
    const texto = ensurePodcastBrandNarration('Dar retorno difícil exige clareza.');

    expect(texto).not.toContain('Este é o MentorIA na prática');
    expect(texto).toContain('Dar retorno difícil exige clareza.');
    expect(texto).toContain('Na Vertho, desenvolvimento profissional não é conceito solto.');
  });

  it('remove a abertura falada quando o roteiro já contém marca', () => {
    const texto = ensurePodcastBrandNarration(
      'Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.\n\nConteúdo.\n\nNa Vertho, desenvolvimento profissional não é conceito solto. É prática observável, uma semana de cada vez.',
    );

    expect(texto).not.toContain('Este é o MentorIA na prática');
    expect(texto).toContain('Conteúdo.');
    expect(texto.match(/Na Vertho, desenvolvimento profissional não é conceito solto/g)).toHaveLength(1);
  });

  it('remove fechamento de marca do roteiro antes de reinserir o fechamento padrão uma única vez', () => {
    const texto = ensurePodcastBrandNarration(
      'Campo: Então qual seria a ação pra essa semana?\n\nMentor: Escolha um processo e formule uma pergunta propositiva. Esse é o ponto de partida. Na Vertho, desenvolvimento profissional não é conceito solto. É prática observável, uma semana de cada vez.',
    );

    expect(texto).toContain('Campo: Então qual seria a ação pra essa semana?');
    expect(texto).toContain('Escolha um processo e formule uma pergunta propositiva. Esse é o ponto de partida.');
    expect(texto).toContain('Mentor: Na Vertho, desenvolvimento profissional não é conceito solto.');
    expect(texto.match(/uma semana de cada vez/g)).toHaveLength(1);
    expect(texto).not.toContain('Esse é o ponto de partida. Na Vertho');
  });

  it('remove a abertura falada mesmo quando aparece após a primeira fala do Campo', () => {
    const texto = ensurePodcastBrandNarration(
      'Campo: A semana começa com urgências de todos os lados.\n\nMentor: Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.\n\nMentor: O ponto é transformar rotina em pergunta.',
    );

    expect(texto).toContain('Campo: A semana começa com urgências de todos os lados.');
    expect(texto).toContain('Mentor: O ponto é transformar rotina em pergunta.');
    expect(texto).not.toContain('Este é o MentorIA na prática');
  });

  it('usa a voz do Mentor apenas para a locução padrão de fechamento em roteiro multi-speaker', () => {
    const texto = ensurePodcastBrandNarration('Campo: Isso acontece na reunião.\nMentor: O ponto é separar fato e interpretação.');

    expect(texto).toMatch(/^Campo: Isso acontece na reunião\./);
    expect(texto).not.toContain('Este é o MentorIA na prática');
    expect(texto).toMatch(/Mentor: Na Vertho, desenvolvimento profissional não é conceito solto\./);
  });

  it('adiciona saudação nominal no podcast solo sem reinserir abertura falada', () => {
    const texto = buildPersonalizedPodcastNarration('Dar retorno difícil exige clareza.', 'MARIA DA SILVA');

    expect(texto).toMatch(/^Olá, Maria\. Que bom ter você aqui\./);
    expect(texto).toContain('Dar retorno difícil exige clareza.');
    expect(texto).not.toContain('Este é o MentorIA na prática');
    expect(texto).toContain('Na Vertho, desenvolvimento profissional não é conceito solto.');
  });

  it('adiciona saudação nominal como Mentor no podcast multi-speaker', () => {
    const texto = buildPersonalizedPodcastNarration(
      'Campo: Isso acontece na reunião.\nMentor: O ponto é separar fato e interpretação.',
      'joão pereira',
    );

    expect(texto).toMatch(/^Mentor: Olá, João\. Que bom ter você aqui\./);
    expect(texto).toContain('Campo: Isso acontece na reunião.');
    expect(texto).toContain('Mentor: O ponto é separar fato e interpretação.');
    expect(texto).toContain('Mentor: Na Vertho, desenvolvimento profissional não é conceito solto.');
  });
});
