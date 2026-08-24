/**
 * CONARH 52 — vídeo da pílula do Marcos (porta 4, o espelho).
 *
 * POR QUE EXISTE: a porta 4 promete "mesmo cargo, mesma competência, formatos
 * diferentes" e mostrava o Marcos (perfil D · formato vídeo) só em TEXTO — o
 * play vinha de 5 personas de outro tenant, outro cargo e outra competência,
 * que estavam ali apenas porque eram as únicas com mídia no pacote offline.
 * Este script fecha essa lacuna gerando a pílula do Marcos com o pipeline REAL
 * (o mesmo de `_render-local-completo.ts`: roteiro Opus → TTS Vindemiatrix →
 * avatar HeyGen com lip-sync da nossa voz → Whisper → Remotion → master −14
 * LUFS → saudação "Olá, Marcos"). O que o visitante vê no estande passa a ser
 * o que o cliente receberia.
 *
 * FONTE DO CONTEÚDO: `app/conarh/_data/conteudo.json` — descritor FBK-D04
 * (âncoras N1–N4 + leitura do motor) e o kit do Marcos. Trocar o caso e
 * regerar mantém vídeo e tela contando a mesma história.
 *
 * SAÍDA: `public/conarh/media/<nome>.mp4` (arquivo local — a demo roda em modo
 * avião; nada de Bunny aqui). Render em 720p por padrão: o tablet é 11–13" e o
 * pacote offline tem teto de ~30 MB por arquivo.
 *
 * Rodar: npx tsx scripts/_conarh-video-espelho.ts
 */
import './_env'; // PRIMEIRO: popula process.env antes dos imports que leem env no topo
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { buildRoteiroPrompt, parseRoteiro, normalizarRoteiro } from '../lib/video/roteiro-prompt';
import { gerarClipHeyGen, aguardarClipHeyGen } from '../lib/video/heygen';
import { transcribeWords } from '../lib/video/whisper-align';
import { montarInputProps, type AssetMap } from '../lib/video/montar-inputprops';
import { storagePut } from '../lib/video/render-helpers';
// @ts-ignore — .mjs sem tipos
import { masterizarAudio } from '../lib/video/masterizar-audio.mjs';
// @ts-ignore — .mjs sem tipos (MESMA personalização da prod)
import { personalizar, primeiroNome } from '../worker-hetzner/personalizar.mjs';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const ANTHROPIC = process.env.ANTHROPIC_API_KEY!;
const VOICE = process.env.VIDEO_TTS_VOICE || 'Vindemiatrix';
const FPS = 30;
const VIDEO_ID = 'conarh-marcos-' + Date.now();
const SAIDA = nodePath.resolve('public/conarh/media/pilula-video-marcos-combinado.mp4');
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── Conteúdo: sai do MESMO JSON que a tela lê ──────────────────────────────
const conteudo = JSON.parse(
  readFileSync(nodePath.resolve('app/conarh/_data/conteudo.json'), 'utf8'),
);
const D04 = conteudo.porta2.descritores.find((d: any) => d.cod === 'FBK-D04');
const MARCOS = conteudo.porta4.pessoas.find((p: any) => p.perfil_disc === 'D');
if (!D04 || !MARCOS) throw new Error('conteudo.json: FBK-D04 ou persona D não encontrados');

// Módulo-base SINTÉTICO (não vai ao banco): o prompt de roteiro só precisa da
// forma, e a matéria-prima é a régua do próprio caso da feira.
const modulo: any = {
  titulo: 'O combinado que faz o feedback virar desenvolvimento',
  descritor: D04.nome_curto,
  competenciaNome: conteudo.porta4.comum.competencia,
  nivel_entrada: 'N2',
  nivel_destino: 'N3',
  locale: 'pt-BR',
  discDominante: 'D',
  desafioTexto: MARCOS.desafio,
  cargoBloco:
    'CARGO: Gerente de Operações. Área: operação/logística. Responde por um centro de distribuição com coordenadores subordinados; cobra procedimento, prazo e qualidade de entrega. Entregas: expedição no prazo, conferência sem falha, indicadores de operação. Decisões: priorizar carga em dia de pico, escalar time, decidir quando segurar uma entrega. Tensões: pressão por velocidade contra rigor de procedimento; time técnico forte que resolve no improviso; conversas de correção que precisam acontecer sem quebrar a relação no dia seguinte.',
  conteudo_central: {
    ideia_principal: conteudo.porta4.comum.ideia_central,
    explicacao_expandida:
      'Quase todo feedback difícil termina com as duas pessoas de acordo sobre o passado e vagas sobre o futuro. A conversa foi honesta, o outro reconheceu o erro, e mesmo assim nada muda — porque nada do que foi dito pode ser verificado depois. Um combinado observável tem três partes: a AÇÃO (o que a pessoa vai fazer, em comportamento, não em intenção), a FORMA DE VERIFICAR (como os dois vão saber que aconteceu) e a DATA (quando revisam juntos). Sem as três, o que ficou foi uma promessa de atenção redobrada, que não é observável nem por quem prometeu. É o que separa o feedback que vira desenvolvimento do feedback que vira desabafo com agenda.',
    principios: [
      {
        nome: 'Intenção não é comportamento',
        explicacao:
          '"Vou redobrar a atenção" e "vou ficar de olho" descrevem disposição, não ação. Ninguém consegue verificar disposição — nem a própria pessoa. Troque por uma ação com sujeito, objeto e momento.',
      },
      {
        nome: 'O combinado é construído, não anunciado',
        explicacao:
          'Quando o gestor dita o próximo passo, ele leva o problema de volta. Quando pergunta "o que você faria para isso não se repetir?", a pessoa assume a autoria — e o gestor ajusta o que precisar.',
      },
      {
        nome: 'Sem data, não é combinado',
        explicacao:
          'A data de revisão é o que transforma a conversa em ciclo. Ela também protege a pessoa: existe um momento marcado para mostrar o que mudou, em vez de uma vigilância difusa e sem fim.',
      },
      {
        nome: 'O registro é curto, e é do outro',
        explicacao:
          'Três linhas enviadas logo depois — ação, medida, data — evitam a discussão de memória semanas depois. Quem escreve pode ser a própria pessoa: escrever é assumir.',
      },
    ],
  },
  conteudo_aplicavel: {
    exemplos_universais: {
      aplicacao_adequada: D04.n4,
      aplicacao_inadequada: D04.n1,
    },
    erros_comuns: [
      { erro: 'Fechar com "vamos redobrar a atenção" — intenção que ninguém consegue verificar.' },
      { erro: 'Prometer que o gestor vai observar, em vez de combinar o que a pessoa vai fazer.' },
      { erro: 'Terminar a conversa sem data de revisão, deixando o acompanhamento para quando lembrar.' },
      { erro: 'Ditar o próximo passo em vez de construí-lo — o outro concorda e não assume.' },
      { erro: 'Misturar o combinado com elogio de traço ("você é o melhor técnico"), que amortece a mensagem.' },
    ],
    boas_praticas: [
      { o_que_fazer: 'Fechar com ação, forma de verificar e data — as três, em uma frase só.' },
      { o_que_fazer: 'Perguntar "o que você faria para isso não se repetir?" antes de propor.' },
      { o_que_fazer: 'Registrar o combinado em até três linhas e enviar no mesmo dia.' },
      { o_que_fazer: 'Marcar a revisão na agenda dos dois, com hora e duração curta.' },
      { o_que_fazer: 'Na revisão, olhar a evidência combinada — não a impressão geral.' },
    ],
    situacoes_tipicas: [
      {
        contexto: 'Conversa de correção depois de uma falha de procedimento',
        desafio: 'O outro reconhece o erro e se compromete genericamente; a conversa acaba bem e nada muda.',
      },
      {
        contexto: '1:1 com coordenador que atrasa entregas recorrentemente',
        desafio: 'Sem combinado verificável, o assunto volta toda semana como cobrança, e o gestor vira fiscal.',
      },
      {
        contexto: 'Revisão do que foi combinado duas semanas depois',
        desafio: 'Sem registro, a conversa vira disputa de memória sobre o que cada um entendeu.',
      },
    ],
  },
};

// ── Daqui para baixo: cópia fiel do pipeline de `_render-local-completo.ts`
// (calibragens já pagas: pausa determinística, ênfase, trim de cauda, CFR) ──
const ENFASE =
  ' Dê leve ênfase de entonação às palavras de virada e aos termos-chave da frase, sem exagero teatral; antes de perguntas retóricas, deixe a entonação suspender de leve.';
const STYLE = {
  intro:
    'Narre como uma mentora calorosa e próxima, em português do Brasil, abrindo uma conversa. Tom curioso e acolhedor, energia que prende a atenção, ritmo natural com respiros leves. Engaje sem pressa — mas sem arrastar.' +
    ENFASE,
  outro:
    'Narre como uma mentora calorosa e próxima, em português do Brasil, fechando com uma pergunta de reflexão. Ritmo natural, com peso e intimidade; uma leve pausa antes da pergunta final e TERMINE com firmeza, sem arrastar nem deixar silêncio no fim.' +
    ENFASE,
  miolo:
    'Narre como uma mentora calorosa e acolhedora, em português do Brasil, num ritmo natural de conversa. Respiração natural entre as frases, tom íntimo e humano. Mantenha a fluidez — não alongue as pausas.' +
    ENFASE,
};
const styleForScene = (t: string) =>
  t === 'avatar_intro' ? STYLE.intro : t === 'avatar_outro' ? STYLE.outro : STYLE.miolo;

const PRONUNCIA: Array<[RegExp, string]> = [
  [/\bVertho\b/gi, 'Vértho'],
  [/\bPDI\b/g, 'pê-dê-í'],
  [/\bDISC\b/g, 'dísc'],
  [/\b1:1\b/g, 'um a um'],
];
const aplicarPronuncia = (t: string) => PRONUNCIA.reduce((s, [re, sub]) => s.replace(re, sub), t);

async function ffmpegBuf(
  args: string[],
  inBuf: Buffer,
  inExt: string,
  outExt: string,
  timeout = 120_000,
): Promise<Buffer> {
  const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'cve-'));
  const inP = nodePath.join(dir, 'in.' + inExt);
  const outP = nodePath.join(dir, 'out.' + outExt);
  try {
    await writeFile(inP, inBuf);
    await exec(FFMPEG, ['-y', '-i', inP, ...args, outP], { timeout, maxBuffer: 64 * 1024 * 1024 });
    return await readFile(outP);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
const trimTail = (mp3: Buffer) =>
  ffmpegBuf(
    ['-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.6,areverse', '-c:a', 'libmp3lame', '-q:a', '4'],
    mp3,
    'mp3',
    'mp3',
    60_000,
  )
    .then((o) => (o.length > 1000 ? o : mp3))
    .catch(() => mp3);
const normFps = (mp4: Buffer) =>
  ffmpegBuf(
    ['-r', String(FPS), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart'],
    mp4,
    'mp4',
    'mp4',
    180_000,
  ).catch(() => mp4);

async function ffprobeDur(url: string): Promise<number> {
  try {
    const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url]);
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

async function ttsPcm(text: string, voice: string, style: string, attempt = 0): Promise<{ pcm: Buffer; rate: number }> {
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: `${style}:\n\n${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if ((res.status === 429 || res.status === 503) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return ttsPcm(text, voice, style, attempt + 1);
  }
  if (!res.ok) throw new Error('TTS ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data: any = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  // Vertex às vezes devolve 200 OK sem áudio — re-tentar é a correção conhecida.
  if (!part) {
    if (attempt < 4) return ttsPcm(text, voice, style, attempt + 1);
    throw new Error('TTS sem áudio após 5 tentativas');
  }
  const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
  return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
}

function segs(t: string): { text: string; q: boolean }[] {
  const out: { text: string; q: boolean }[] = [];
  const re = /([^?]*\?)\s+(?=\S)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const x = t.slice(last, m.index + m[1].length).trim();
    if (x) out.push({ text: x, q: true });
    last = re.lastIndex;
  }
  const rest = t.slice(last).trim();
  if (rest) out.push({ text: rest, q: /\?$/.test(rest) });
  return out.length ? out : [{ text: t.trim(), q: /\?$/.test(t.trim()) }];
}

async function pcmToMp3(pcm: Buffer, rate: number): Promise<Buffer> {
  const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'pcm-'));
  const inP = nodePath.join(dir, 'in.pcm');
  const outP = nodePath.join(dir, 'out.mp3');
  try {
    await writeFile(inP, pcm);
    await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-c:a', 'libmp3lame', '-q:a', '4', outP], {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return await readFile(outP);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function narrarMp3(text: string, voice: string, style: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  let rate = 24000;
  let prevQ = false;
  for (const s of segs(text)) {
    const { pcm, rate: r } = await ttsPcm(s.text, voice, style);
    rate = r;
    if (parts.length) parts.push(Buffer.alloc(Math.round(rate * (prevQ ? 0.7 : 0.22)) * 2));
    parts.push(pcm);
    prevQ = s.q;
  }
  return pcmToMp3(Buffer.concat(parts), rate);
}

async function main() {
  log('gerando roteiro (Opus 4.6 + thinking) —', modulo.titulo);
  const { system, user } = buildRoteiroPrompt(modulo);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 16000,
      // Geracao 5 removeu `{type:'enabled', budget_tokens}` (400). Ver
      // tests/unit/integrations/ia-request-cru-guard.test.ts.
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
  const roteiro: any = normalizarRoteiro(
    parseRoteiro((j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''))!,
  );
  const palavras = roteiro.scenes.reduce((a: number, s: any) => a + String(s.narration || '').split(/\s+/).filter(Boolean).length, 0);
  log('roteiro:', roteiro.scenes.length, 'cenas ·', palavras, 'palavras →', roteiro.scenes.map((s: any) => s.type).join(', '));

  const assets: AssetMap = {};
  log('narração (', VOICE, ')…');
  for (const s of roteiro.scenes.filter((x: any) => x.narration?.trim())) {
    const mp3 = await narrarMp3(aplicarPronuncia(s.narration), VOICE, styleForScene(s.type));
    const buf = await trimTail(mp3);
    const src = await storagePut('video-assets', `${VIDEO_ID}/${s.id}.mp3`, buf, 'audio/mpeg');
    const words = await transcribeWords(buf);
    assets[s.id] = { src, durationSec: 0, words: words || undefined };
    log('  ✓', s.id, s.type);
  }

  const avatares = roteiro.scenes.filter((s: any) => s.type.startsWith('avatar') && assets[s.id]?.src);
  log('avatar HeyGen (', avatares.length, 'cenas — ~1-3 min cada)…');
  for (const s of avatares) {
    const id = await gerarClipHeyGen(assets[s.id].src, { width: 1920, height: 1080 });
    const url = await aguardarClipHeyGen(id);
    const mp4 = Buffer.from(await (await fetch(url)).arrayBuffer());
    const norm = await normFps(mp4);
    const src = await storagePut('video-assets', `${VIDEO_ID}/${s.id}.mp4`, norm, 'video/mp4');
    assets[s.id] = { src, durationSec: 0, audioSrc: assets[s.id].src, words: assets[s.id]?.words };
    log('  ✓ avatar', s.id);
  }

  for (const id of Object.keys(assets)) assets[id].durationSec = await ffprobeDur(assets[id].src);
  const props: any = montarInputProps(roteiro, assets, { fps: FPS, width: 1920, height: 1080 });
  log('timeline:', props.totalFrames, 'frames =', (props.totalFrames / FPS).toFixed(1), 's');

  await ensureBrowser();
  const BUNDLE = nodePath.resolve('spike-bundle');
  const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps: props });
  mkdirSync(nodePath.resolve('outputs'), { recursive: true });
  const cru = nodePath.resolve('outputs', `${VIDEO_ID}-cru.mp4`);
  // 720p por padrão: teto de ~30 MB por arquivo no pacote offline dos tablets.
  const rawScale = Number(process.env.VIDEO_RENDER_SCALE) || 0.6667;
  const scale = rawScale === 1 ? 1 : Math.round(props.height * rawScale) / props.height;
  log(`renderizando (${Math.round(props.height * scale)}p)…`);
  await renderMedia({
    serveUrl: BUNDLE,
    composition: comp,
    codec: 'h264',
    outputLocation: cru,
    concurrency: 4,
    chromiumOptions: { gl: 'swangle' },
    timeoutInMilliseconds: 120000,
    inputProps: props,
    ...(scale !== 1 ? { scale } : {}),
  });

  const outro = props.scenes.find((s: any) => s.type === 'avatar_outro');
  const climaxSec = outro ? outro.fromFrame / FPS : props.totalFrames / FPS - 4;
  const bedR = nodePath.resolve('public/video-spike/audio/bed-respiro.mp3');
  const bedP = nodePath.resolve('public/video-spike/audio/bed-pico.mp3');
  const master = nodePath.resolve('outputs', `${VIDEO_ID}-master.mp4`);
  log('masterizando (−14 LUFS + bed-pico @', climaxSec.toFixed(1), 's)…');
  try {
    await masterizarAudio({ videoIn: cru, bedRespiro: bedR, bedPico: bedP, climaxStartSec: climaxSec, videoOut: master });
  } catch (e: any) {
    log('master falhou (', e?.message, ') → usando render cru');
    writeFileSync(master, readFileSync(cru));
  }

  const perso = nodePath.resolve('outputs', `${VIDEO_ID}-perso.mp4`);
  let finalPath = master;
  log(`saudação "Olá, ${primeiroNome(MARCOS.nome)}" → prepend ao deck…`);
  try {
    await personalizar(master, MARCOS.nome, perso, {
      bundleDir: BUNDLE,
      brand: props.brand,
      width: props.width,
      height: props.height,
      voice: VOICE,
    });
    finalPath = perso;
  } catch (e: any) {
    log('saudação falhou (', String(e?.message || e).slice(0, 140), ') → deck sem saudação');
  }

  const buf = await readFile(finalPath);
  writeFileSync(SAIDA, buf);
  const mb = (buf.length / 1024 / 1024).toFixed(1);
  log('PRONTO ✅', SAIDA, `(${mb} MB)`);
  if (Number(mb) > 30) log('⚠️  acima de 30 MB — reduzir VIDEO_RENDER_SCALE antes de levar aos tablets');
}

main().catch((e) => {
  console.error('ERRO:', e?.stack || e?.message || e);
  process.exit(1);
});
