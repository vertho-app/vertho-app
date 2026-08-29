/**
 * Gera o MESMO beat com direções de estilo diferentes, para escolher o tom por
 * escuta em vez de por adjetivo. Voz sempre Achird (identidade do Beto) — o que
 * varia é só a instrução de interpretação.
 *
 *   npx tsx video-spike/tutorial/_teste-voz.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..');
const OUT = path.join(APP_ROOT, 'outputs', 'voz-teste');

for (const line of readFileSync(path.join(APP_ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}

// Duas falas: a abertura (onde o tom se estabelece) e o fecho (onde ele precisa
// levantar). Um take só de abertura engana — o problema aparece no fim.
const FALAS = {
  abertura: 'Oi! Aqui é o Beto, seu Gestor de Aprendizagem no projeto Educação Integral. Em um minuto eu te mostro como entrar e começar a sua primeira atividade.',
  fecho: 'Conclua até doze de agosto. A nossa jornada começa pela competência Autocuidado, e eu vou estar com você em cada semana. Até já!',
};

const ESTILOS: Record<string, string> = {
  // o que está no vídeo hoje — referência para comparar
  '0-atual': 'Narre em português do Brasil com voz masculina, grave e firme, tom de mentor experiente, seguro e sereno, dicção clara e ritmo constante, sem variação de gênero',

  'A-caloroso': 'Narre em português do Brasil com voz masculina, calorosa e sorridente, como quem recebe bem alguém que está chegando. Ritmo leve e natural, energia positiva, entonação variada — nunca solene nem monótono. Sem variação de gênero.',

  'B-animado': 'Narre em português do Brasil com voz masculina, animada e próxima, tom de colega entusiasmado explicando algo bom para um amigo. Ritmo ágil, frases com impulso para a frente, sorriso audível. Sem soar formal, sem tom de locutor. Sem variação de gênero.',

  'C-inspiracional': 'Narre em português do Brasil com voz masculina, inspiradora e convidativa, tom de treinador que acredita em quem ouve. Comece acolhedor e ganhe energia ao longo da frase, terminando com convicção e otimismo. Dicção clara, sem dureza. Sem variação de gênero.',
};

const dur = (f: string) => parseFloat(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', f], { encoding: 'utf8' }).trim());

async function main() {
  const { generateNarrationAudio } = await import('../../lib/gemini-tts');
  mkdirSync(OUT, { recursive: true });
  for (const [nome, style] of Object.entries(ESTILOS)) {
    for (const [beat, texto] of Object.entries(FALAS)) {
      const f = path.join(OUT, `${nome}--${beat}.mp3`);
      const audio = await generateNarrationAudio(texto, { voice: 'Achird', style });
      writeFileSync(f, audio.buffer);
      console.log(`✓ ${nome.padEnd(16)} ${beat.padEnd(9)} ${dur(f).toFixed(1)}s → ${path.relative(APP_ROOT, f)}`);
    }
  }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
