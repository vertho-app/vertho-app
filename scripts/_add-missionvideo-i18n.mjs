/**
 * Insere `SeasonWeek.missionVideo` nos QUATRO locales de uma vez.
 *
 * Feito por script e não à mão porque o guard `i18n-paridade` do CI falha quando a
 * chave existe em 3 de 4 — e, pior que o CI, em runtime o locale que ficou de fora
 * quebra a tela. Editar quatro JSONs à mão é exatamente onde se esquece um.
 *
 * Idempotente: se a chave já existir, não mexe.
 *
 *   node scripts/_add-missionvideo-i18n.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TEXTOS = {
  'pt-BR': { title: 'Semana de missão', watch: 'Como funciona esta semana' },
  'pt-PT': { title: 'Semana de missão', watch: 'Como funciona esta semana' },
  'es-ES': { title: 'Semana de misión', watch: 'Cómo funciona esta semana' },
  'en-US': { title: 'Mission week', watch: 'How this week works' },
};

for (const [locale, textos] of Object.entries(TEXTOS)) {
  const caminho = `messages/${locale}.json`;
  const raw = readFileSync(caminho, 'utf8');
  const data = JSON.parse(raw);

  if (!data.SeasonWeek) throw new Error(`${locale}: namespace SeasonWeek não existe`);
  if (data.SeasonWeek.missionVideo) { console.log(`= ${locale} já tinha missionVideo`); continue; }

  data.SeasonWeek.missionVideo = textos;
  // 2 espaços + newline final: o formato dos arquivos existentes (evita diff gigante).
  writeFileSync(caminho, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✓ ${locale}: missionVideo.title="${textos.title}" watch="${textos.watch}"`);
}
