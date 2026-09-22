import { CONVERGENCIA, type Convergencia } from '@/lib/season-engine/convergencia';

/**
 * O que cada veredito QUER DIZER, numa frase, para quem lê o resultado.
 *
 * Fonte única do relatório de evolução (PDF) e da tela Evolução da equipe. Até
 * 17/09/2026 as frases moravam só no PDF, e a tela mostrava "Confirmadas 1 ·
 * Parciais 1 · Estável 2" sem dizer o que separa uma coisa da outra. O dono
 * pediu a MESMA descrição nos dois lugares; uma cópia em cada arquivo divergiria
 * na primeira revisão de texto.
 *
 * Desde 21/09/2026 o PDF de evolução compara só o cenário inicial com o final e
 * não classifica por veredito; quem lê estas frases hoje é a tela.
 *
 * O rótulo continua em `rotuloConvergencia` e a cor em `convergencia-cores`.
 */
export const DICA_VEREDITO: Record<Convergencia, string> = {
  [CONVERGENCIA.CONFIRMADA]: 'Aplicou sem ser induzido e sustentou sob restrição nova.',
  [CONVERGENCIA.PARCIAL]: 'Avançou, ainda apoiado na estrutura da conversa.',
  [CONVERGENCIA.ESTAVEL]: 'Reconhece o caminho; o fechamento não trouxe um caso real.',
};
