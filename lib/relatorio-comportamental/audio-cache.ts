export type AudioArtifactState = {
  path: unknown;
  audioAt: unknown;
  reportAt: unknown;
  reportIsFresh: boolean;
};

/**
 * Decide se a tela pode apenas assinar/tocar o MP3 existente. Separar esta
 * decisão da action evita que “mostrar imediatamente” vire “gerar em segundo
 * plano”: sem relatório atual, carimbo posterior e idade válida, a UI mantém o
 * fluxo explícito do botão.
 */
export function isAudioArtifactReady(
  state: AudioArtifactState,
  now = Date.now(),
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
): boolean {
  if (!state.path || !state.reportIsFresh) return false;
  const audioAt = new Date(String(state.audioAt || '')).getTime();
  const reportAt = new Date(String(state.reportAt || '')).getTime();
  if (!Number.isFinite(audioAt) || !Number.isFinite(reportAt) || audioAt < reportAt) return false;
  return now - audioAt >= 0 && now - audioAt < maxAgeMs;
}
