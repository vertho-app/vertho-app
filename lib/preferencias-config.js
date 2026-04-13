// Constantes das preferências de aprendizagem (compartilhadas entre server actions
// e componentes client). Fica FORA dos arquivos 'use server' porque o Next 16
// exige que server action files exportem apenas funções async.

export const PREFS = [
  { key: 'pref_video_curto', label: 'Vídeos curtos', icon: 'Video' },
  { key: 'pref_video_longo', label: 'Vídeos longos / aulas', icon: 'Film' },
  { key: 'pref_texto', label: 'Texto / artigos', icon: 'FileText' },
  { key: 'pref_audio', label: 'Áudios / podcasts', icon: 'Headphones' },
  { key: 'pref_infografico', label: 'Infográficos', icon: 'BarChart3' },
  { key: 'pref_exercicio', label: 'Exercícios práticos', icon: 'Dumbbell' },
  { key: 'pref_mentor', label: 'Mentoria 1:1', icon: 'Users' },
  { key: 'pref_estudo_caso', label: 'Estudo de caso', icon: 'BookOpen' },
];

export const COLS = PREFS.map(p => p.key).join(', ');

export function calcularRanking(rows) {
  const totais = Object.fromEntries(PREFS.map(p => [p.key, { soma: 0, n: 0 }]));
  for (const r of rows) {
    for (const p of PREFS) {
      const v = Number(r[p.key]);
      if (Number.isFinite(v) && v > 0) {
        totais[p.key].soma += v;
        totais[p.key].n += 1;
      }
    }
  }
  const ranking = PREFS.map(p => {
    const t = totais[p.key];
    const media = t.n > 0 ? Math.round((t.soma / t.n) * 100) / 100 : 0;
    return { ...p, media, respondentes: t.n };
  });
  ranking.sort((a, b) => b.media - a.media);
  return ranking;
}
