/**
 * Miolo da biblioteca v7 no worker (E4 da migração do vídeo, 17/10/2026).
 *
 * Quando o vídeo traz `visual_v7` (o plano que o `gerar-video-modulo` grava para o cliente com a chave ligada), o
 * miolo sai da biblioteca v7 renderizado no HyperFrames na AWS Lambda, e a abertura e o fecho do avatar saem do
 * Remotion como hoje, só que SEM legenda (decisão do dono, 17/10: "sem legenda" no vídeo inteiro do formato novo).
 * As três partes são emendadas na mesma linha do tempo do `render_inputprops`, então a masterização (clímax no
 * início do fecho), a publicação e a saudação nominal seguem iguais.
 *
 * Qualquer falha aqui volta para o render de hoje inteiro (com legenda) e deixa `video-v7-render-fallback` em
 * `degradacao_log`. O `render_fingerprint` inclui a ASSINATURA do plano (mig 291, 18/10/2026): converter um vídeo
 * pronto para o formato novo muda a revisão do deck, e o worker refaz os nominais (antes pulava os 5 do piloto da 4Life).
 * Um retry que reaproveita o mesmo plano tem a mesma assinatura e não força nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { montarComposicao } from './video-v7/composicao.mjs';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Tipo em DEGRADACAO (lib/degradacao.ts). Repetido aqui porque o worker não importa TypeScript. */
export const DEGRADACAO_V7_FALLBACK = 'video-v7-render-fallback';
/** Bibliotecas que esta composição sabe desenhar. */
export const VERSOES_V7 = ['v7d'];
export const FONTES_V7 = {
  codec: path.join(AQUI, 'video-v7', 'fontes', 'codec-cold-extrabold.woff2'),
  roboto: path.join(AQUI, 'video-v7', 'fontes', 'roboto.woff2'),
};

/**
 * A Lambda vinda do ambiente da box (o `ensureRenderWorker` repassa do Trigger). Sem as quatro peças obrigatórias,
 * `null`: a box renderiza tudo como hoje. Os nomes não são `AWS_*` de propósito, para não colidir com outra chave
 * da AWS no mesmo ambiente.
 * @param {Record<string, string | undefined>} env
 */
export function configLambda(env) {
  const c = {
    accessKeyId: env.HF_LAMBDA_ACCESS_KEY_ID,
    secretAccessKey: env.HF_LAMBDA_SECRET_ACCESS_KEY,
    region: env.HF_LAMBDA_REGION || 'us-east-1',
    bucket: env.HF_LAMBDA_BUCKET,
    stateMachineArn: env.HF_LAMBDA_STATE_MACHINE,
    // 4 trechos em paralelo: com até 4 boxes renderizando juntas cabem na simultaneidade reservada de 16 da função.
    // `Medido 17/10`: 4 trechos = 149 s e US$ 0,073 no miolo de 3min38 (16 trechos: 85 s e US$ 0,092).
    paralelos: Math.max(1, Number(env.HF_LAMBDA_PARALELOS) || 4),
    tetoMs: Math.max(60_000, Number(env.HF_LAMBDA_TETO_MS) || 15 * 60_000),
  };
  return c.accessKeyId && c.secretAccessKey && c.bucket && c.stateMachineArn ? c : null;
}

/**
 * Se o vídeo sai com o miolo da biblioteca, e onde fica o miolo na linha do tempo. Os invariantes protegem a emenda:
 * avatar só no começo e no fim, o plano é destas mesmas cenas, e a soma dos momentos bate com o miolo em até 1
 * quadro (senão o fecho desliza, e com ele o clímax da trilha e a saudação).
 * @returns {{ ok: true, fps: number, de: number, ate: number, total: number, cenas: any[] } | { ok: false, motivo: string }}
 */
export function decidirMiolo(job) {
  const v = job?.visual_v7;
  if (!v || !Array.isArray(v.momentos) || !v.momentos.length) return { ok: false, motivo: 'sem plano visual' };
  if (!VERSOES_V7.includes(v.versao)) return { ok: false, motivo: `biblioteca ${v.versao} desconhecida pela box` };
  const props = job.render_inputprops;
  const fps = props?.fps || 30;
  const cenas = Array.isArray(props?.scenes) ? props.scenes : [];
  const ehAvatar = (s) => String(s?.type || '').startsWith('avatar');
  let i = 0;
  while (i < cenas.length && ehAvatar(cenas[i])) i++;
  let j = cenas.length;
  while (j > i && ehAvatar(cenas[j - 1])) j--;
  const miolo = cenas.slice(i, j);
  if (!miolo.length) return { ok: false, motivo: 'vídeo sem miolo' };
  if (miolo.some(ehAvatar)) return { ok: false, motivo: 'cena de avatar no meio do vídeo' };
  const ids = miolo.map((s) => s.id);
  if (JSON.stringify(ids) !== JSON.stringify(v.cenas || [])) return { ok: false, motivo: `o plano é de outras cenas (${(v.cenas || []).join(',')} × ${ids.join(',')})` };
  const de = miolo[0].fromFrame;
  const ate = miolo[miolo.length - 1].fromFrame + miolo[miolo.length - 1].durationInFrames;
  const somaPlano = v.momentos.reduce((a, m) => a + (Number(m.dur) || 0), 0);
  if (Math.abs(somaPlano * fps - (ate - de)) > 1) {
    return { ok: false, motivo: `plano com ${somaPlano.toFixed(3)} s e miolo com ${((ate - de) / fps).toFixed(3)} s` };
  }
  const semAudio = ids.filter((id) => !job.assets?.[id]?.src);
  if (semAudio.length) return { ok: false, motivo: `cena do miolo sem narração: ${semAudio.join(',')}` };
  const imagensSemEndereco = (v.imagens || []).filter((im) => !im?.url || !im?.nome).length;
  if (imagensSemEndereco) return { ok: false, motivo: `${imagensSemEndereco} ilustração(ões) sem endereço` };
  return { ok: true, fps, de, ate, total: props.totalFrames, cenas: miolo };
}

/** A narração do miolo: o mp3 de cada cena, a partir do início dela no miolo (segundos). */
export function audiosDoMiolo(job, d) {
  return d.cenas.map((s) => ({ url: job.assets[s.id].src, nome: `${s.id}.mp3`, inicio: +((s.fromFrame - d.de) / d.fps).toFixed(4) }));
}

/** Os momentos no formato da composição. */
export function momentosDaComposicao(visual) {
  return visual.momentos.map((m) => ({ id: m.id, tpl: m.tpl, data: m.data, dur: m.dur, fundo: m.fundo }));
}

/**
 * Argumentos do ffmpeg que emendam as partes: cada uma é levada à mesma resolução, fps, `yuv420p` e áudio 48 kHz
 * estéreo, e o filtro `concat` (que decodifica e recodifica) junta tudo. O concat por arquivo (demuxer) abriria
 * buraco de AAC nas fronteiras.
 *
 * Cada parte é cortada (ou completada) no número EXATO de quadros dela, no vídeo E no áudio. `Medido 17/10/2026`: sem
 * isso, o AAC de cada parte sobra uns milissegundos além do vídeo e o concat encadeia a sobra (62 ms em 3 partes de
 * teste), desalinhando som e imagem a cada fronteira.
 * @param {{ partes: Array<{ arquivo: string, quadros: number }>, saida: string, largura: number, altura: number, fps: number }} o
 */
export function argsDaEmenda({ partes, saida, largura, altura, fps }) {
  const entradas = partes.flatMap((p) => ['-i', p.arquivo]);
  const filtros = partes.map((p, k) =>
    `[${k}:v]scale=${largura}:${altura}:flags=lanczos,setsar=1,fps=${fps},format=yuv420p,` +
    `tpad=stop_mode=clone:stop=${p.quadros},trim=end_frame=${p.quadros},setpts=PTS-STARTPTS[v${k}];` +
    `[${k}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
    `apad,atrim=end=${(p.quadros / fps).toFixed(6)},asetpts=PTS-STARTPTS[a${k}]`);
  const juntar = partes.map((_, k) => `[v${k}][a${k}]`).join('') + `concat=n=${partes.length}:v=1:a=1[v][a]`;
  return ['-y', ...entradas, '-filter_complex', [...filtros, juntar].join(';'), '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', saida];
}

/** Quadros, tamanho e duração do áudio de um mp4, pelo ffprobe. */
export async function medirVideo(arquivo) {
  const sonda = async (args) => JSON.parse((await exec(FFPROBE, ['-v', 'error', ...args, '-of', 'json', arquivo], { maxBuffer: 8 * 1024 * 1024 })).stdout);
  const v = await sonda(['-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,width,height']);
  const a = await sonda(['-select_streams', 'a:0', '-show_entries', 'stream=duration']);
  return {
    quadros: Number(v.streams?.[0]?.nb_read_packets) || 0, largura: v.streams?.[0]?.width, altura: v.streams?.[0]?.height,
    duracaoAudio: Number(a.streams?.[0]?.duration) || 0,
  };
}

/**
 * Emenda as partes e confere o resultado: os quadros esperados (1 de folga) e o áudio do tamanho do vídeo (2 quadros
 * de folga; mais que isso é som deslizando contra a imagem).
 */
export async function emendar({ partes, saida, largura, altura, fps, quadrosEsperados }) {
  await exec(FFMPEG, argsDaEmenda({ partes, saida, largura, altura, fps }), { timeout: 30 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  const m = await medirVideo(saida);
  if (quadrosEsperados && Math.abs(m.quadros - quadrosEsperados) > 1) {
    throw new Error(`emenda com ${m.quadros} quadros (esperado ${quadrosEsperados})`);
  }
  if (Math.abs(m.duracaoAudio - m.quadros / fps) > 2 / fps) {
    throw new Error(`emenda com áudio de ${m.duracaoAudio.toFixed(3)} s para ${(m.quadros / fps).toFixed(3)} s de vídeo`);
  }
  return m;
}

async function baixar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}: ${url.split('/').slice(-2).join('/')}`);
  await pipeline(r.body, fs.createWriteStream(destino));
  return destino;
}

/**
 * Monta o projeto do miolo (composição + fontes + ilustrações + narração), renderiza na Lambda, baixa o mp4 e apaga
 * o projeto do bucket (a pasta `sites/` não expira e leva a narração e as ilustrações do cliente).
 * `aws` = { sdk, s3, sfn, comandosS3 } (injetado: na box, os pacotes reais; nos testes, dublês).
 */
export async function renderizarMioloNaLambda({ job, d, cfg, dir, aws, log = () => {}, agora = () => Date.now() }) {
  const v = job.visual_v7;
  const props = job.render_inputprops;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'baixados'), { recursive: true });
  const audios = [];
  for (const a of audiosDoMiolo(job, d)) audios.push({ arquivo: await baixar(a.url, path.join(dir, 'baixados', a.nome)), inicio: a.inicio });
  const imagens = [];
  for (const im of v.imagens || []) imagens.push({ nome: im.nome, arquivo: await baixar(im.url, path.join(dir, 'baixados', `img-${im.nome}`)) });
  const projeto = path.join(dir, 'projeto');
  montarComposicao({ destino: projeto, momentos: momentosDaComposicao(v), fontes: FONTES_V7, imagens, audios, largura: props.width, altura: props.height, fps: d.fps });

  const t0 = agora();
  const site = await aws.sdk.deploySite({ projectDir: projeto, bucketName: cfg.bucket, region: cfg.region, s3: aws.s3 });
  try {
    const h = await aws.sdk.renderToLambda({
      siteHandle: site, bucketName: cfg.bucket, stateMachineArn: cfg.stateMachineArn, region: cfg.region, sfn: aws.sfn, s3: aws.s3,
      config: { fps: d.fps, width: props.width, height: props.height, format: 'mp4', codec: 'h264', quality: 'high', maxParallelChunks: cfg.paralelos, runtimeCap: 'lambda' },
    });
    log(`miolo v7 ${job.id}: render ${h.renderId} na Lambda (${cfg.paralelos} trechos em paralelo)`);
    let p;
    for (;;) {
      p = await aws.sdk.getRenderProgress({ executionArn: h.executionArn, region: cfg.region, sfn: aws.sfn });
      if (p.status !== 'RUNNING') break;
      if (agora() - t0 > cfg.tetoMs) throw new Error(`Lambda passou de ${Math.round(cfg.tetoMs / 60000)} min sem terminar (${p.framesRendered}/${p.totalFrames ?? '?'} quadros)`);
      await new Promise((r) => setTimeout(r, aws.intervaloMs ?? 5000));
    }
    if (p.status !== 'SUCCEEDED' || !p.outputFile?.s3Uri) {
      throw new Error(`Lambda ${p.status}: ${JSON.stringify(p.errors || []).slice(0, 300)}`);
    }
    if (p.totalFrames != null && p.totalFrames !== d.ate - d.de) throw new Error(`Lambda planejou ${p.totalFrames} quadros (miolo tem ${d.ate - d.de})`);
    const semEsquema = p.outputFile.s3Uri.replace(/^s3:\/\//, '');
    const bucket = semEsquema.slice(0, semEsquema.indexOf('/'));
    const chave = semEsquema.slice(semEsquema.indexOf('/') + 1);
    const obj = await aws.s3.send(new aws.comandosS3.GetObjectCommand({ Bucket: bucket, Key: chave }));
    const arquivo = path.join(dir, 'miolo.mp4');
    await pipeline(obj.Body, fs.createWriteStream(arquivo));
    const custo = p.costs?.accruedSoFarUsd ?? null;
    log(`miolo v7 ${job.id}: ${p.framesRendered} quadros em ${Math.round((agora() - t0) / 1000)} s, US$ ${custo}`);
    return { arquivo, custoUsd: custo, segundos: Math.round((agora() - t0) / 1000) };
  } finally {
    await aws.s3.send(new aws.comandosS3.DeleteObjectCommand({ Bucket: cfg.bucket, Key: `sites/${site.siteId}/project.tar.gz` }))
      .catch((e) => log(`miolo v7 ${job.id}: projeto não apagado do bucket (${e?.message || e})`));
  }
}

/** Os pacotes reais da AWS e do HyperFrames, carregados só quando o miolo novo é usado. */
export async function carregarAws(cfg) {
  const [sdk, s3mod, sfnmod] = await Promise.all([
    import('@hyperframes/aws-lambda/sdk'), import('@aws-sdk/client-s3'), import('@aws-sdk/client-sfn'),
  ]);
  const credentials = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey };
  return {
    sdk,
    s3: new s3mod.S3Client({ region: cfg.region, credentials }),
    sfn: new sfnmod.SFNClient({ region: cfg.region, credentials }),
    comandosS3: { GetObjectCommand: s3mod.GetObjectCommand, DeleteObjectCommand: s3mod.DeleteObjectCommand },
  };
}
