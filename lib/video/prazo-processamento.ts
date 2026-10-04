/**
 * Quanto tempo um vídeo pode ficar "em processamento" antes de a TELA parar de
 * prometer que ele vem (R-93, 04/10/2026).
 *
 * 🔴 O DEFEITO. A tela da semana mostrava "estamos preparando seu vídeo" para qualquer
 * célula em `processing`, `render_queued` ou `rendering`, sem olhar há quanto tempo. Um
 * vídeo preso (worker parado, job perdido) dizia "volte em alguns minutos" para sempre,
 * e o link da cadência, que anuncia o vídeo, levava a uma promessa que nunca cumpria.
 *
 * O prazo é o MESMO do health estrutural (`video-stale`: "sem atualização há mais de
 * 2h", e a idade é a do último progresso, não a da criação): uma régua só entre o que
 * o operador vê no painel e o que a pessoa vê na tela. Duas cópias do número seriam a
 * divergência de sempre.
 */

/** Os estados em que o vídeo ainda está a caminho. */
export const STATUS_VIDEO_EM_PROCESSAMENTO = ['processing', 'render_queued', 'rendering'] as const;

/** Sem progresso há mais que isto, o vídeo é dado por preso. */
export const PRAZO_VIDEO_EM_PROCESSAMENTO_MS = 2 * 3600_000;

/**
 * O vídeo está preso? Só vale para quem está em processamento, e só com a data do
 * último progresso LIDA: sem ela não se afirma nada (preso é uma afirmação, e a falta
 * do dado não a sustenta).
 */
export function videoPreso(
  status: string | null | undefined,
  atualizadoEm: string | null | undefined,
  agora: number = Date.now(),
): boolean {
  if (!(STATUS_VIDEO_EM_PROCESSAMENTO as readonly string[]).includes(String(status))) return false;
  const quando = atualizadoEm ? Date.parse(atualizadoEm) : NaN;
  if (!Number.isFinite(quando)) return false;
  return agora - quando > PRAZO_VIDEO_EM_PROCESSAMENTO_MS;
}
