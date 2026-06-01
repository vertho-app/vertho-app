import { describe, expect, it } from 'vitest';
import { addPodcastBrandSting, ensurePodcastBrandNarration, extractNarration } from '@/lib/gemini-tts';

function maxAbsSample(pcm: Buffer): number {
  let max = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    max = Math.max(max, Math.abs(pcm.readInt16LE(offset)));
  }
  return max;
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

  it('garante locução padrão de abertura e fechamento mesmo em roteiros antigos', () => {
    const texto = ensurePodcastBrandNarration('Dar retorno difícil exige clareza.');

    expect(texto).toContain('Este é o MentorIA na prática');
    expect(texto).toContain('Dar retorno difícil exige clareza.');
    expect(texto).toContain('Na Vertho, desenvolvimento profissional não é conceito solto.');
  });

  it('não duplica locução padrão quando o roteiro já contém marca', () => {
    const texto = ensurePodcastBrandNarration(
      'Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.\n\nConteúdo.\n\nNa Vertho, desenvolvimento profissional não é conceito solto. É prática observável, uma semana de cada vez.',
    );

    expect(texto.match(/Este é o MentorIA na prática/g)).toHaveLength(1);
    expect(texto.match(/Na Vertho, desenvolvimento profissional não é conceito solto/g)).toHaveLength(1);
  });

  it('usa a voz do Mentor para locução padrão em roteiro multi-speaker', () => {
    const texto = ensurePodcastBrandNarration('Campo: Isso acontece na reunião.\nMentor: O ponto é separar fato e interpretação.');

    expect(texto).toMatch(/^Mentor: Este é o MentorIA na prática/);
    expect(texto).toMatch(/Mentor: Na Vertho, desenvolvimento profissional não é conceito solto\./);
  });
});
