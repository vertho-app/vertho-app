/**
 * Assinaturas de TIMBRE de referência das vozes do elenco (MFCC 1-12: média e σ nos
 * frames de fala), calculadas em 06/09/2026 pelo scripts/_gerar-assinaturas-voz.ts
 * a partir dos takes aprovados no bake-off (2.5 Flash, 12 takes por voz: finalistas
 * de 4 min + robustez R2/R3/R4). Servem ao portão (distância de cada take à sua voz:
 * identidade da locutora) e ao canário semanal (o modelo GA mudou por baixo?).
 * Recalcular ao trocar de voz ou de modelo.
 */
import type { AssinaturaTimbre } from './deriva';

export const ASSINATURAS_VOZ: Record<string, AssinaturaTimbre> = {
  Aoede: { media: [-13.4130, -1.5604, -4.4188, -5.2149, -5.4771, -3.6887, -3.6928, -3.5882, -2.1311, -2.1917, -2.5812, -0.0526], sigma: [11.3393, 6.4434, 6.1640, 5.8702, 4.3747, 2.9983, 3.3953, 2.7112, 2.4756, 2.5315, 2.3113, 1.9229], frames: 51808 },
  Iapetus: { media: [-8.7485, -0.0390, -1.5106, 0.9669, -3.5133, -1.7357, -3.6235, -4.9328, -0.5524, -0.8212, -0.6978, -1.1664], sigma: [13.4282, 6.2736, 6.6839, 4.8165, 4.1397, 4.0191, 2.8091, 3.4911, 3.0685, 2.0599, 2.2530, 1.8882], frames: 56015 },
};
