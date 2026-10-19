import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import {
  decidirMiolo, audiosDoMiolo, argsDaEmenda, configLambda, renderizarMioloNaLambda, emendar, medirVideo,
  DEGRADACAO_V7_FALLBACK,
} from '@/worker-hetzner/miolo-v7.mjs';
import { DEGRADACAO } from '@/lib/degradacao';

/**
 * O miolo da biblioteca v7 no worker (E4, 17/10/2026): a box decide entre o formato novo e o de hoje, pede o miolo à
 * Lambda e emenda com a abertura e o fecho do Remotion. Os invariantes da decisão protegem a emenda (o fecho não pode
 * deslizar: o clímax da trilha e a saudação dependem dele). Dados sintéticos: o repositório é público.
 */

const FPS = 30;
/** Um vídeo de abertura (300 quadros), miolo de duas cenas (450 + 300) e fecho (240), com o plano batendo. */
function job(extra: Record<string, unknown> = {}) {
  const scenes = [
    { id: 'scene-1', type: 'avatar_intro', fromFrame: 0, durationInFrames: 300 },
    { id: 'scene-2', type: 'steps_flow', fromFrame: 300, durationInFrames: 450 },
    { id: 'scene-3', type: 'icon_story', fromFrame: 750, durationInFrames: 300 },
    { id: 'scene-4', type: 'avatar_outro', fromFrame: 1050, durationInFrames: 240 },
  ];
  return {
    id: 'v-1',
    render_inputprops: { fps: FPS, width: 1920, height: 1080, totalFrames: 1290, scenes },
    assets: { 'scene-2': { src: 'https://st.exemplo/a2.mp3' }, 'scene-3': { src: 'https://st.exemplo/a3.mp3' } },
    visual_v7: {
      versao: 'v7d', cenas: ['scene-2', 'scene-3'],
      momentos: [{ id: 's2-1-fluxo', tpl: 'fluxo', data: { t: 0.3 }, dur: 15, fundo: 'navy' }, { id: 's3-1-imagem', tpl: 'imagem', data: { arquivo: 's3-1-imagem.png' }, dur: 10, fundo: 'navy' }],
      imagens: [{ nome: 's3-1-imagem.png', url: 'https://st.exemplo/img.png' }],
    },
    ...extra,
  };
}

describe('decidirMiolo: quando o vídeo sai no formato novo', () => {
  it('miolo entre a abertura e o fecho, plano destas cenas e somando o mesmo tempo', () => {
    expect(decidirMiolo(job())).toMatchObject({ ok: true, fps: 30, de: 300, ate: 1050, total: 1290 });
  });

  it('cada invariante quebrado devolve o vídeo de hoje, com o motivo', () => {
    const casos: Array<[string, (j: any) => void, RegExp]> = [
      ['sem plano', (j) => { j.visual_v7 = null; }, /sem plano/],
      ['biblioteca desconhecida', (j) => { j.visual_v7.versao = 'v8'; }, /desconhecida/],
      ['avatar no meio', (j) => {
        // abertura | scene-2 | avatar | scene-3 | fecho: o avatar fica ENTRE duas cenas do miolo
        const s = j.render_inputprops.scenes;
        s.splice(2, 0, { id: 'scene-x', type: 'avatar_intro', fromFrame: 750, durationInFrames: 30 });
        s[3].fromFrame = 780; s[4].fromFrame = 1080; j.render_inputprops.totalFrames = 1320;
      }, /avatar no meio/],
      ['plano de outras cenas', (j) => { j.visual_v7.cenas = ['scene-2']; }, /outras cenas/],
      ['soma diferente (2 quadros)', (j) => { j.visual_v7.momentos[0].dur = 15 + 2 / FPS; }, /plano com/],
      ['cena sem narração', (j) => { delete j.assets['scene-3']; }, /sem narração/],
      ['ilustração sem endereço', (j) => { j.visual_v7.imagens[0].url = ''; }, /sem endereço/],
    ];
    for (const [nome, mexe, motivo] of casos) {
      const j = job();
      mexe(j);
      const d = decidirMiolo(j);
      expect(d.ok, nome).toBe(false);
      expect((d as { motivo: string }).motivo, nome).toMatch(motivo);
    }
  });

  it('1 quadro de diferença ainda passa (arredondamento dos segundos do plano)', () => {
    const j = job();
    j.visual_v7.momentos[0].dur = 15 + 0.9 / FPS;
    expect(decidirMiolo(j).ok).toBe(true);
  });

  it('vídeo sem abertura ou sem fecho também serve (o miolo vai até a ponta)', () => {
    const j = job();
    j.render_inputprops.scenes = j.render_inputprops.scenes.slice(1);
    j.render_inputprops.scenes.forEach((s) => { s.fromFrame -= 300; });
    j.render_inputprops.totalFrames = 990;
    expect(decidirMiolo(j)).toMatchObject({ ok: true, de: 0, ate: 750, total: 990 });
  });
});

describe('a narração e a emenda', () => {
  it('cada cena do miolo toca o seu mp3 a partir do início dela no miolo', () => {
    const j = job();
    const d = decidirMiolo(j) as Exclude<ReturnType<typeof decidirMiolo>, { ok: false }>;
    expect(audiosDoMiolo(j, d)).toEqual([
      { url: 'https://st.exemplo/a2.mp3', nome: 'scene-2.mp3', inicio: 0 },
      { url: 'https://st.exemplo/a3.mp3', nome: 'scene-3.mp3', inicio: 15 },
    ]);
  });

  it('a emenda usa o filtro concat, com todas as partes no mesmo tamanho, fps e áudio, cada uma no tamanho EXATO dela', () => {
    const partes = [{ arquivo: 'ab.mp4', quadros: 300 }, { arquivo: 'mi.mp4', quadros: 750 }, { arquivo: 'fe.mp4', quadros: 240 }];
    const a = argsDaEmenda({ partes, saida: 'out.mp4', largura: 1280, altura: 720, fps: 30 });
    const filtro = a[a.indexOf('-filter_complex') + 1];
    expect(filtro.match(/scale=1280:720/g)).toHaveLength(3);
    expect(filtro.match(/fps=30/g)).toHaveLength(3);
    expect(filtro.match(/aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo/g)).toHaveLength(3);
    expect(filtro).toContain('trim=end_frame=750');
    expect(filtro).toContain('atrim=end=25.000000');
    expect(filtro).toContain('atrim=end=8.000000');
    expect(filtro).toContain('[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]');
    expect(a).not.toContain('-f'); // nada de concat por arquivo (demuxer)
    expect(a.at(-1)).toBe('out.mp4');
  });

  const temFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  it.skipIf(!temFfmpeg)('emenda de verdade: 3 partes de tamanhos diferentes saem com a soma dos quadros e o áudio do tamanho do vídeo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emenda-'));
    const parte = (nome: string, quadros: number, tamanho: string) => {
      const f = path.join(dir, nome);
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `testsrc=size=${tamanho}:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000',
        '-frames:v', String(quadros), '-t', String(quadros / 30), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f], { stdio: 'ignore' });
      return f;
    };
    try {
      const partes = [
        { arquivo: parte('ab.mp4', 15, '320x180'), quadros: 15 },
        { arquivo: parte('mi.mp4', 30, '640x360'), quadros: 30 },
        { arquivo: parte('fe.mp4', 12, '320x180'), quadros: 12 },
      ];
      const m = await emendar({ partes, saida: path.join(dir, 'out.mp4'), largura: 320, altura: 180, fps: 30, quadrosEsperados: 57 });
      expect(m).toMatchObject({ quadros: 57, largura: 320, altura: 180 });
      // sem o corte por parte, o áudio saía 62 ms mais longo (a sobra do AAC de cada parte, encadeada)
      expect(Math.abs(m.duracaoAudio - 57 / 30)).toBeLessThanOrEqual(2 / 30);
      const audio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels', '-of', 'csv=p=0', path.join(dir, 'out.mp4')]).toString().trim();
      expect(audio).toBe('48000,2');
      await expect(emendar({ partes, saida: path.join(dir, 'out2.mp4'), largura: 320, altura: 180, fps: 30, quadrosEsperados: 60 })).rejects.toThrow(/57 quadros/);
      expect((await medirVideo(path.join(dir, 'out.mp4'))).quadros).toBe(57);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});

describe('configuração da Lambda na box', () => {
  it('sem as quatro peças obrigatórias, a box faz o vídeo de hoje', () => {
    expect(configLambda({})).toBeNull();
    expect(configLambda({ HF_LAMBDA_ACCESS_KEY_ID: 'a', HF_LAMBDA_SECRET_ACCESS_KEY: 'b', HF_LAMBDA_BUCKET: 'c' })).toBeNull();
    expect(configLambda({ AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b', HF_LAMBDA_BUCKET: 'c', HF_LAMBDA_STATE_MACHINE: 'd' })).toBeNull();
  });

  it('com elas: região padrão us-east-1 e 4 trechos em paralelo (4 boxes cabem nos 16 da função)', () => {
    expect(configLambda({ HF_LAMBDA_ACCESS_KEY_ID: 'a', HF_LAMBDA_SECRET_ACCESS_KEY: 'b', HF_LAMBDA_BUCKET: 'c', HF_LAMBDA_STATE_MACHINE: 'd' }))
      .toMatchObject({ region: 'us-east-1', bucket: 'c', stateMachineArn: 'd', paralelos: 4, tetoMs: 900_000 });
  });

  it('o tipo da degradação é o mesmo do catálogo do app', () => {
    expect(DEGRADACAO_V7_FALLBACK).toBe(DEGRADACAO.VIDEO_V7_RENDER_FALLBACK);
  });
});

describe('renderizarMioloNaLambda (AWS e downloads dublados)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cfg = { region: 'us-east-1', bucket: 'b', stateMachineArn: 'arn:sm', paralelos: 4, tetoMs: 60_000 };

  function aws(progressos: any[]) {
    const comandos: any[] = [];
    class GetObjectCommand { constructor(public input: any) { comandos.push(['get', input]); } }
    class DeleteObjectCommand { constructor(public input: any) { comandos.push(['delete', input]); } }
    const configs: any[] = [];
    return {
      comandos, configs,
      intervaloMs: 0,
      comandosS3: { GetObjectCommand, DeleteObjectCommand },
      s3: { send: async (c: any) => (c instanceof GetObjectCommand ? { Body: Readable.from(Buffer.from('mp4')) } : {}) },
      sfn: {},
      sdk: {
        deploySite: async (o: any) => { configs.push(['site', o]); return { siteId: 'abc123' }; },
        renderToLambda: async (o: any) => { configs.push(['render', o]); return { renderId: 'r1', executionArn: 'arn:ex' }; },
        getRenderProgress: async () => progressos.shift(),
      },
    };
  }
  const fim = (status: string, extra: Record<string, unknown> = {}) => ({ status, totalFrames: 750, framesRendered: 750, costs: { accruedSoFarUsd: 0.05 }, outputFile: status === 'SUCCEEDED' ? { s3Uri: 's3://b/renders/r1/output.mp4' } : null, errors: [], ...extra });

  function preparar() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miolo-'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('x'))));
    const j = job();
    const d = decidirMiolo(j) as Exclude<ReturnType<typeof decidirMiolo>, { ok: false }>;
    return { dir, j, d };
  }

  it('monta o projeto, renderiza com 4 trechos, baixa o mp4 e APAGA o projeto do bucket', async () => {
    const { dir, j, d } = preparar();
    const a = aws([fim('RUNNING'), fim('SUCCEEDED')]);
    try {
      const r = await renderizarMioloNaLambda({ job: j, d, cfg, dir, aws: a });
      expect(fs.readFileSync(r.arquivo, 'utf8')).toBe('mp4');
      expect(r.custoUsd).toBe(0.05);
      const html = fs.readFileSync(path.join(dir, 'projeto', 'index.html'), 'utf8');
      expect(html).toContain('src="midia/scene-2.mp3" data-start="0"');
      expect(html).toContain('src="midia/scene-3.mp3" data-start="15"');
      expect(fs.existsSync(path.join(dir, 'projeto', 'midia', 's3-1-imagem.png'))).toBe(true);
      expect(fs.readdirSync(path.join(dir, 'projeto', 'fontes')).sort()).toEqual(['Codec-ExtraBold.woff2', 'Roboto.woff2']);
      const render = a.configs.find((c) => c[0] === 'render')![1];
      expect(render.config).toMatchObject({ fps: 30, width: 1920, height: 1080, maxParallelChunks: 4, runtimeCap: 'lambda' });
      expect(a.comandos).toEqual([['get', { Bucket: 'b', Key: 'renders/r1/output.mp4' }], ['delete', { Bucket: 'b', Key: 'sites/abc123/project.tar.gz' }]]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('render que falha ou planeja 2+ quadros a mais ou a menos lança, e o projeto é apagado do mesmo jeito', async () => {
    for (const progresso of [fim('FAILED', { errors: [{ state: 'RenderChunk', error: 'x', cause: 'y' }] }), fim('SUCCEEDED', { totalFrames: 748 }), fim('SUCCEEDED', { totalFrames: 752 })]) {
      const { dir, j, d } = preparar();
      const a = aws([progresso]);
      try {
        await expect(renderizarMioloNaLambda({ job: j, d, cfg, dir, aws: a })).rejects.toThrow(/FAILED|748|752/);
        expect(a.comandos.filter((c) => c[0] === 'delete')).toHaveLength(1);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });

  // `Medido 18-19/10/2026`: 7 de ~24 renders da 4Life voltaram ao formato de hoje com "Lambda planejou N+1 quadros
  // (miolo tem N)". A soma dos segundos do plano arredonda para 1 quadro a mais ou a menos, e a emenda corta ou completa.
  it('1 quadro a mais ou a menos da Lambda é aceito (a emenda leva o miolo ao tamanho exato)', async () => {
    for (const totalFrames of [749, 751]) {
      const { dir, j, d } = preparar();
      const a = aws([fim('SUCCEEDED', { totalFrames, framesRendered: totalFrames })]);
      try {
        const r = await renderizarMioloNaLambda({ job: j, d, cfg, dir, aws: a });
        expect(fs.readFileSync(r.arquivo, 'utf8')).toBe('mp4');
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it('passou do teto: desiste (a box cai no render de hoje) e apaga o projeto', async () => {
    const { dir, j, d } = preparar();
    let t = 0;
    const a = aws(Array.from({ length: 5 }, () => fim('RUNNING', { framesRendered: 100 })));
    try {
      await expect(renderizarMioloNaLambda({ job: j, d, cfg: { ...cfg, tetoMs: 60_000 }, dir, aws: a, agora: () => (t += 40_000) })).rejects.toThrow(/passou de 1 min/);
      expect(a.comandos.filter((c) => c[0] === 'delete')).toHaveLength(1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
