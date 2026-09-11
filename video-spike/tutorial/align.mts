/** Split ONE approved continuous take at verified transcript boundaries. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS } from './storyboard';
import { alignSteps, tokens, norm } from './alignment';
import { chaveNarracao, sha256, validarClipsTutorial, type TutorialNarration, type TutorialAudioManifest } from './narration-config';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.env.TUTORIAL_OUT_DIR || path.join(HERE, 'out'));
const PUBLIC = path.resolve(process.env.TUTORIAL_PUBLIC_DIR || path.join(HERE, '../../public/video-spike'));
const flow = FLOWS[process.argv[2]];
if (!flow) throw new Error('Tutorial desconhecido');
const source: TutorialNarration = JSON.parse(readFileSync(path.join(OUT, `${flow.id}.narration.json`), 'utf8'));
const audio = path.join(PUBLIC, source.audio);
if (!source.qa?.ok || source.key !== chaveNarracao(flow.id, 'continuous', flow.steps.map(s => s.narration).join('\n\n'))
  || sha256(readFileSync(audio)) !== source.sha256) throw new Error('Take alterado/desatualizado ou sem aprovação');
const transcript = JSON.parse(readFileSync(audio.replace(/\.mp3$/, '.words.json'), 'utf8'));
/**
 * Tolerância de duração PROPORCIONAL, não fixa.
 *
 * Quem garante a IDENTIDADE do take é o `sourceSha256` — exato, byte a byte. A duração
 * serve para pegar transcrição TRUNCADA, e para isso um limiar fixo de 0,15 s estava
 * errado: `Medido 10/09/2026` nos quatro tutoriais, o `ffprobe` (que o narrate usa) e o
 * decodificador do Whisper divergem por ~0,15 % da duração — pdi 63 s → 0,104 s;
 * macae 74 s → 0,104; jornada 98 s → 0,157; disc 124 s → 0,183. É padding do encoder,
 * cresce com o tempo, e com 0,15 s fixo TODO take longo reprovava com a transcrição
 * correta na mão. Uma truncagem de verdade erra por segundos, não por milésimos.
 */
const tolDuracaoS = Math.max(0.25, source.seconds * 0.005);
if (transcript.sourceSha256 !== source.sha256) throw new Error('Transcrição não pertence ao take aprovado (sha256 difere)');
if (Math.abs(transcript.duration - source.seconds) > tolDuracaoS) {
  throw new Error(`Transcrição truncada: ${transcript.duration.toFixed(2)}s contra ${source.seconds.toFixed(2)}s do take (tolerância ${tolDuracaoS.toFixed(2)}s)`);
}
// Corte editorial explícito e auditável, por exemplo uma frase duplicada após
// o fim do roteiro. Nunca reutilizar a decisão em outro take por nome de flow.
const reviewPath = path.join(OUT, `${flow.id}.review.json`);
const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : null;
if (review && (review.sourceSha256 !== source.sha256 || !(review.audioEnd > 0 && review.audioEnd <= source.seconds)
  || !review.reason || !review.reviewedAt)) throw new Error('Revisão editorial inválida ou referente a outro take');
const audioEnd = review?.audioEnd ?? source.seconds;
const words = transcript.words.filter((w: { end: number }) => w.end <= audioEnd + 0.01);
const aligned = alignSteps(flow.steps, words, audioEnd);

/*
 * O TAKE DIZ O QUE ESTÁ ESCRITO? (fidelidade texto × fala)
 *
 * 🔴 Dois defeitos do dono, 11/09/2026, com a mesma raiz: o TTS não leu o
 * roteiro, PARAFRASEOU.
 *   · boas-vindas genérico, 1:13 — roteiro "o material chega do seu jeito",
 *     áudio "do jeito certo". A legenda vem do roteiro, então a tela dizia uma
 *     frase e a voz dizia outra. O mesmo erro está no `macae`, já publicado.
 *   · boas-vindas genérico, fim — depois do "Até já!" o modelo acrescentou
 *     "Tchau, tchau! Tchau, tchau!", que não existe em lugar nenhum. Aquelas
 *     palavras não têm legenda de onde vir: o final saiu mudo de lettering.
 *
 * Nada no pipeline comparava as duas pontas, tendo as duas na mão. O portão de
 * TTS mede VOZ (registro, inclinação, timbre) e a transcrição do Whisper só
 * servia para CORTAR as fatias. `alignSteps` chega perto mas olha um lado só —
 * a COBERTURA do roteiro ("quanto do que escrevi foi dito"), com limiar de 96%;
 * num roteiro de 205 palavras isso tolera 8 palavras trocadas, e o "seu" que
 * virou "certo" custou 1. A pergunta que faltava é a inversa: sobrou fala?
 *
 * ⚠️ E ela NÃO pode ser feita ao relógio. A primeira versão desta trava comparou
 * `start` da palavra com o fim do roteiro e passou verde justamente no take que
 * a motivou: o Whisper amassou os quatro "tchau" em 60 ms (77,76 → 77,82)
 * enquanto o áudio segue até 78,08. Timestamp que o ASR não entendeu é lixo; o
 * que ele acerta é QUAIS palavras ouviu. Logo, contagem — não tempo.
 *
 * A saída é a que já existia e é auditável: `<flow>.review.json` com `audioEnd`,
 * `reason` e `reviewedAt`. A trava não proíbe o corte; obriga que um humano o
 * declare, em vez de o improviso virar vídeo em silêncio.
 */
const fimDoRoteiro = aligned.at(-1)!.end;
{
  const doRoteiro = tokens(flow.steps.map((s) => s.narration).join(' ')).map(norm);
  const falados = transcript.words.flatMap((w: { word: string }) => tokens(w.word)).map(norm);
  // Avanço monotônico com janela curta, nos dois sentidos: o cursor marca a
  // última palavra falada que o roteiro explica; o que sobra depois é improviso,
  // e o que o cursor não encontrou é palavra escrita que ninguém disse.
  let cursor = 0;
  const naoDitas: { palavra: string; contexto: string }[] = [];
  for (let k = 0; k < doRoteiro.length; k++) {
    let achou = -1;
    for (let q = cursor; q < Math.min(falados.length, cursor + 8); q++) if (falados[q] === doRoteiro[k]) { achou = q; break; }
    if (achou < 0) naoDitas.push({ palavra: doRoteiro[k], contexto: doRoteiro.slice(Math.max(0, k - 4), k + 4).join(' ') });
    else cursor = achou + 1;
  }
  const sobra = falados.slice(cursor);
  /*
   * PALAVRA NÃO DITA é REPORTADA, não fatal — e isso é uma escolha, não descuido.
   * Medido nos 5 flows em 11/09: disc 0, pdi 0, jornada 1, macae 2,
   * boas-vindas genérico 2. Parece um limiar em 2, mas não é: das 2 do `macae`
   * uma é "pro" (o modelo disse "para o", mesma palavra) e a outra é o "seu" que
   * o dono ouviu. O sinal real é 1 palavra nos dois casos, igual ao ruído do
   * `jornada` ("a"). Cravar 2 aqui seria pôr a fronteira no valor modal com n=5
   * — a armadilha que esta base já pagou antes. Então imprime-se a palavra COM O
   * CONTEXTO: lido, "…material chega do [seu] jeito" não se confunde com "a".
   */
  for (const d of naoDitas) console.log(`  !! NAO FALOU "${d.palavra}"  em: ...${d.contexto}...`);
  if (naoDitas.length) console.log(`  ${flow.id}: ${naoDitas.length} de ${doRoteiro.length} palavras do roteiro nao foram faladas`);
  if (sobra.length >= 2 && !review) {
    throw new Error(
      `O take fala ${sobra.length} palavra(s) ALEM do roteiro: "${sobra.join(' ').slice(0, 120)}".\n`
      + `  O roteiro termina em ${fimDoRoteiro.toFixed(2)}s e o take dura ${audioEnd.toFixed(2)}s.\n`
      + `  A legenda vem do ROTEIRO, entao esse trecho sai sem legenda nenhuma.\n`
      + `  Ou refaça o take, ou declare o corte em out/${flow.id}.review.json:\n`
      + `  { "sourceSha256": "${source.sha256}", "audioEnd": <segundos>, "reason": "...", "reviewedAt": "${new Date().toISOString()}" }`,
    );
  }
}

/*
 * ONDE CORTAR: NO VALE DA ONDA, NÃO NO CARIMBO DO ASR.
 *
 * 🔴 Defeito ouvido pelo dono em 11/09/2026, no `disc-ajuda` aos 1:27: a fala
 * ENGASGA. Causa medida no take contínuo: o corte entre `resultado-perfil` e
 * `acoes` caiu em 78,780 s, onde o sinal está a −18,0 dB — o mesmo nível do
 * meio da frase. A fatia termina em cima do som, e o build ainda põe 0,8 s de
 * cauda + 0,4 s de entrada: sai "...as quatro dimensõ" [tesoura] [1,2 s de
 * nada] "E o seu perfil".
 *
 * A conta antiga era o MEIO entre o fim de uma etapa e o começo da seguinte,
 * pelos timestamps do Whisper. Ela só funciona quando existe pausa: ali o
 * Whisper deu `end` e `start` IGUAIS (78,78), então o meio não tinha para onde
 * ir. E o `end` do Whisper é sistematicamente ADIANTADO — "dimensões" ainda
 * ressoa a −13 dB até ~78,88, e o vale de verdade está em 79,03 (−31,8 dB).
 *
 * A régua nova mede o ÁUDIO: procura o ponto mais silencioso numa janela em
 * volta do corte nominal, quase toda para a FRENTE (o `end` chega cedo, não
 * tarde). Onde já havia pausa o mínimo cai dentro dela e nada muda; onde não
 * havia, o corte anda os poucos centésimos que tiram a tesoura de cima da voz.
 */
const PCM_HZ = 16000, JANELA_MS = 10;
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', audio, '-ac', '1', '-ar', String(PCM_HZ), '-f', 's16le', '-'],
  { maxBuffer: 512 * 1024 * 1024, windowsHide: true });
/** Nível RMS em dB numa janela de 10 ms que começa em `t` segundos. */
function nivelDb(t: number): number {
  const i0 = Math.round(t * PCM_HZ), n = Math.round((JANELA_MS / 1000) * PCM_HZ);
  if (i0 < 0 || (i0 + n) * 2 > pcm.length) return 0; // fora do take: nunca escolher
  let soma = 0;
  for (let k = 0; k < n; k++) { const v = pcm.readInt16LE((i0 + k) * 2) / 32768; soma += v * v; }
  return 20 * Math.log10(Math.sqrt(soma / n) + 1e-9);
}
const RECUO_S = 0.06, AVANCO_S = 0.30; // assimétrico de propósito: o `end` do ASR adianta
/** Acima disto o ponto escolhido ainda é fala: o corte vai SOAR. Calibrado abaixo. */
const LIMIAR_SPLICE_DB = -35;
function refinarCorte(nominal: number) {
  const dbAntes = nivelDb(nominal);
  let melhorT = nominal, melhorDb = dbAntes;
  for (let t = nominal - RECUO_S; t <= nominal + AVANCO_S; t += JANELA_MS / 1000) {
    if (t <= 0 || t >= audioEnd) continue;
    const db = nivelDb(t);
    if (db < melhorDb) { melhorDb = db; melhorT = t; }
  }
  return { t: melhorT, db: melhorDb, dbAntes };
}

/**
 * Um corte por FRONTEIRA, não um por fatia: o fim de uma etapa é o começo da
 * seguinte. Calcular os dois lados em separado deixaria buraco ou sobreposição.
 */
const cortes: number[] = [0];
for (let i = 1; i < aligned.length; i++) {
  const nominal = (aligned[i - 1].end + aligned[i].start) / 2;
  const r = refinarCorte(nominal);
  cortes.push(r.t);
  const moveu = Math.abs(r.t - nominal) > 0.001;
  console.log(`  corte ${aligned[i - 1].id} -> ${aligned[i].id}: ${nominal.toFixed(3)}s ${r.dbAntes.toFixed(1)}dB`
    + (moveu ? ` => ${r.t.toFixed(3)}s ${r.db.toFixed(1)}dB` : ' (mantido)')
    + (r.db > LIMIAR_SPLICE_DB ? '   *** SEM VALE — splice audivel' : ''));
}
cortes.push(audioEnd);

const clips = flow.steps.map((step, i) => {
  const start = cortes[i];
  const end = cortes[i + 1];
  const key = chaveNarracao(flow.id, step.id, step.narration);
  /*
   * FADE DE 25 ms NAS DUAS BORDAS.
   *
   * O corte no vale resolve a maioria, mas nem todo take TEM vale: no `disc`, a
   * fronteira `resultado-perfil → acoes` é a melhor a −31,8 dB porque a voz
   * emenda "…as quatro dimensões. E o seu perfil" sem respirar. Cortar em rampa
   * em vez de na tesoura tira o clique do que sobra — e onde já há silêncio o
   * fade não faz nada, porque não há o que atenuar. 25 ms é curto demais para
   * comer fonema e longo o bastante para matar a descontinuidade.
   */
  const FADE_S = 0.025;
  const sliceKey = sha256(JSON.stringify({ sha256: source.sha256, start, end, codec: 'mp3-192k-v3-fade' }));
  const rel = `tutorial/${flow.id}/audio/${step.id}-${sliceKey.slice(0, 16)}.mp3`;
  const dest = path.join(PUBLIC, rel);
  const dur = end - start;
  /*
   * ⚠️ O `-ss` PRECISA VIR ANTES DO `-i`, E AGORA ISSO IMPORTA.
   *
   * Sem filtro, tanto faz: `-i take -ss X -t D` (seek de SAÍDA) devolvia a
   * fatia certa. Com `-af`, não: o seek de saída é aplicado DEPOIS do grafo de
   * filtros, então o `afade` via o take INTEIRO a partir de 0 — a rampa de
   * saída, marcada em `dur-0,025`, caía nos primeiros segundos do take e zerava
   * tudo o que vinha depois. O recorte pegava justamente essa parte zerada.
   *
   * Medido em 11/09/2026: 11 das 12 fatias do `disc` saíram a −180 dB (silêncio
   * absoluto); a única com som era a `abertura`, que começa em 0. E ninguém
   * reclamou — nem o ffmpeg, nem o align, nem o build. Dois vídeos foram
   * renderizados inteiros com voz só no primeiro beat.
   *
   * Com `-ss` antes do `-i` o ffmpeg entrega ao grafo só o trecho pedido, já com
   * o relógio em zero. O `asetpts` fica como cinto e suspensório.
   */
  if (!existsSync(dest)) execFileSync('ffmpeg', ['-v', 'error', '-ss', start.toFixed(6), '-i', audio, '-t', dur.toFixed(6),
    '-af', `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${FADE_S},afade=t=out:st=${(dur - FADE_S).toFixed(6)}:d=${FADE_S}`,
    '-c:a', 'libmp3lame', '-b:a', '192k', '-n', dest], { windowsHide: true });
  /*
   * E A FATIA TEM VOZ? Narração não é silêncio: uma fatia abaixo de −60 dB de
   * média é defeito de montagem, não conteúdo. Este check custa um decode e
   * teria pego o fade invertido acima no segundo em que ele nasceu, em vez de
   * depois de dois renders completos.
   */
  const pcmClip = execFileSync('ffmpeg', ['-v', 'error', '-i', dest, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
    { maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  let somaClip = 0;
  for (let k = 0; k * 2 + 1 < pcmClip.length; k++) { const v = pcmClip.readInt16LE(k * 2) / 32768; somaClip += v * v; }
  const dbClip = 20 * Math.log10(Math.sqrt(somaClip / Math.max(1, pcmClip.length / 2)) + 1e-9);
  if (dbClip < -60) throw new Error(`Fatia "${step.id}" saiu MUDA (${dbClip.toFixed(1)} dB): ${rel}`);
  const seconds = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0',dest], { encoding: 'utf8', windowsHide: true }).trim());
  return { id: step.id, key, audio: rel, seconds, sha256: sha256(readFileSync(dest)), sourceSha256: source.sha256, sourceStart: start, sourceEnd: end, qa: source.qa, createdAt: new Date().toISOString() };
});
const manifest: TutorialAudioManifest = { schema: 3, flow: flow.id, profile: source.profile, source, clips };
validarClipsTutorial(flow, manifest);
writeFileSync(path.join(OUT, `${flow.id}.audio.json`), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(OUT, `${flow.id}.alignment.json`), JSON.stringify({ sourceSha256: source.sha256, review, steps: aligned }, null, 2));
console.log(`${flow.id}: ${clips.length} etapas alinhadas e fatiadas do mesmo take aprovado`);
