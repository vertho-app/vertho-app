import { CONVERGENCIA, CORTE_CONFIRMADA, CORTE_PARCIAL, type Convergencia } from '@/lib/season-engine/convergencia';

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
 * 🔴 AS FRASES DESCREVEM A RÉGUA DE HOJE (R-33, 04/10/2026): o veredito é só o
 * AVANÇO entre o cenário inicial e o final. Até esta data a tela dizia "Aplicou
 * sem ser induzido e sustentou sob restrição nova" e "ainda apoiado na estrutura
 * da conversa", que eram os critérios QUALITATIVOS removidos em 17/09/2026
 * (`classificarConvergencia`). Os cortes vêm das constantes da régua, não de
 * número escrito aqui: mudar `CORTE_PARCIAL` muda a frase junto.
 *
 * O rótulo continua em `rotuloConvergencia` e a cor em `convergencia-cores`.
 */
const casa = (n: number) => n.toFixed(1).replace('.', ',');
/** O último avanço exibido ANTES do corte (o avanço aparece com uma casa). */
const ate = (corte: number) => casa(Math.round((corte - 0.1) * 10) / 10);

export const DICA_VEREDITO: Record<Convergencia, string> = {
  [CONVERGENCIA.CONFIRMADA]: `Avanço de ${casa(CORTE_CONFIRMADA)} ou mais entre o início e o fechamento.`,
  [CONVERGENCIA.PARCIAL]: `Avanço de ${casa(CORTE_PARCIAL)} a ${ate(CORTE_CONFIRMADA)} entre o início e o fechamento.`,
  [CONVERGENCIA.ESTAVEL]: `Avanço de até ${ate(CORTE_PARCIAL)}: manteve o patamar de partida.`,
};
