import { describe, expect, it } from 'vitest';
import { extractNarration } from '@/lib/gemini-tts';

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
});
