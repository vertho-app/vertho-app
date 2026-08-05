/**
 * CONARH 52 — gera o PODCAST da terceira pessoa do espelho (etapa 4), com o
 * pipeline de TTS do produto (`lib/gemini-tts`, vozes Mentor/Campo da marca).
 *
 *   npx --yes tsx scripts/_conarh-podcast.ts
 *   → public/conarh/media/pilula-audio-rogerio-combinado.mp3
 *
 * POR QUE GERAR, e não reaproveitar um áudio do acervo: os MP3 que já estão em
 * `/conarh/media` são de OUTRO assunto (método, abertura, pilares). Dar play
 * num deles no estande entrega uma peça que não fala do combinado observável —
 * a mesma armadilha do vídeo de kit ancorado no módulo errado. O texto abaixo é
 * do descritor que a etapa 4 mostra (LID-D04), no perfil da pessoa (I).
 *
 * O arquivo é versionado: a demo roda em modo avião.
 */
import fs from 'node:fs';
import path from 'node:path';

const LINHAS_ENV = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/) : [];
for (const linha of LINHAS_ENV) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

export const DESTINO = 'public/conarh/media/pilula-audio-rogerio-combinado.mp3';

/**
 * Diálogo de duas vozes (o formato multi-speaker do pipeline): Mentor conduz,
 * Campo é a voz da operação. ~2 minutos.
 */
const ROTEIRO = `Mentor: Rogério, quantas vezes esta semana alguém te disse "pode deixar, vou dar um jeito"?
Campo: Umas cinco. E é sincero — o pessoal quer resolver mesmo.
Mentor: É sincero, sim. O problema não é a intenção: é que intenção não tem data. Na sexta, nenhum dos dois consegue dizer se aconteceu.
Campo: Aí a conversa boa vira semana igual.
Mentor: Exatamente. E para quem é bom de conversa, isso é ainda mais traiçoeiro: todo mundo sai animado da sala e nada muda na operação.
Campo: Então o que eu faço diferente?
Mentor: Três coisas, e elas cabem em três linhas. A ação: o que a pessoa faz de diferente. A medida: como vocês dois vão enxergar isso. E a data: o dia em que sentam para olhar juntos.
Campo: Ação, medida, data.
Mentor: Se não couber em três linhas, não era combinado — era intenção com entusiasmo.
Campo: E se a pessoa travar na hora de dizer o que muda?
Mentor: Melhor travar na conversa do que na sexta. Se travou, falta clareza ou falta recurso. Nos dois casos, você acabou de descobrir o problema de verdade.
Campo: E o registro? Tem que ser formal?
Mentor: Não. Três linhas numa mensagem, enviadas na hora, com o nome do que muda. Sem "vamos alinhar", sem "conto com você".
Campo: E na semana que vem?
Mentor: Na semana que vem você tem o que olhar. É essa a diferença entre cobrar e desenvolver.`;

async function main() {
  const { generatePodcastAudio } = await import('@/lib/gemini-tts');
  const audio = await generatePodcastAudio(ROTEIRO);
  const destino = path.join(process.cwd(), DESTINO);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, audio.buffer);
  const kb = (audio.buffer.length / 1024) | 0;
  console.log(`OK ${DESTINO} — ${kb} KB`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
