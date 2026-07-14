/**
 * Núcleo compartilhado de derivação do formato preferido do colaborador.
 *
 * Ranqueia os formatos de conteúdo (video/texto/audio/case) pelas colunas
 * `pref_*` (likert 1-5) do colaborador. É consumido tanto pela montagem da
 * TRILHA (actions/temporadas.ts) quanto pela PÍLULA semanal do cron
 * (actions/cron-jobs.ts) — por isso vive em lib/, fora de qualquer `'use server'`.
 *
 * Retorna o array ordenado do mais preferido ([0]) ao menos preferido.
 */
export function derivarPrioridadeFormatos(colab: any): string[] {
  // Mapeia colunas pref_* (1-5 likert) → ordem dos formatos do motor
  const scores = [
    { f: 'video', s: Math.max(Number(colab.pref_video_curto || 0), Number(colab.pref_video_longo || 0)) },
    { f: 'texto', s: Number(colab.pref_texto || 0) },
    { f: 'audio', s: Number(colab.pref_audio || 0) },
    { f: 'case',  s: Number(colab.pref_estudo_caso || 0) },
  ];
  const ordenado = scores.sort((a, b) => b.s - a.s).map(x => x.f);
  // Se tudo for 0 (sem preferência declarada), default sensato
  if (scores.every(s => s.s === 0)) return ['video', 'texto', 'audio', 'case'];
  return ordenado;
}
