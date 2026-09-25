import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `executarGeracaoVideoModulo` como MÃE e como IRMÃ de um grupo de avatar.
 *
 * O que só este teste vê (as peças puras já têm o seu): a irmã sintetiza SÓ o miolo,
 * com o alvo de altura da mãe, e não chama a HeyGen; se o portão recusar esse miolo,
 * ela sai do grupo e refaz TUDO como hoje (take inteiro sem o alvo + a própria
 * HeyGen); falha que não é do portão a mantém no grupo; a mãe devolve o avatar e a F0
 * do take. E sem grupo o fluxo é o de antes.
 *
 * Tudo que sai da máquina é simulado: TTS, Whisper, HeyGen, Storage, REST, ffmpeg.
 */

const tts = vi.fn();
vi.mock('@/lib/gemini-tts', () => ({ generateNarrationAudio: (...a: any[]) => tts(...a), modeloTtsEfetivo: () => 'gemini-2.5-flash-tts' }));
const gerarClip = vi.fn(async () => 'hg-novo');
vi.mock('@/lib/video/heygen', () => ({
  gerarClipHeyGen: (...a: any[]) => (gerarClip as any)(...a),
  aguardarClipHeyGen: vi.fn(async () => 'https://heygen.test/clip.mp4'),
  motorHeyGen: () => 'avatar_iii', fotoPadraoHeyGen: () => 'foto-1',
}));
vi.mock('@/lib/video/render-helpers', () => ({
  storagePut: vi.fn(async (_b: string, p: string) => `https://st.test/${p}`),
  storageGet: vi.fn(async () => Buffer.alloc(4000)), SUPA: 'https://supa.test', KEY: 'k',
}));
const transcribe = vi.fn();
vi.mock('@/lib/video/whisper-align', () => ({ transcribeWords: (...a: any[]) => transcribe(...a) }));
const planejar = vi.fn();
vi.mock('@/lib/video/narracao-unica', async (orig) => ({
  ...(await orig<typeof import('@/lib/video/narracao-unica')>()),
  planejarNarracaoUnica: (...a: any[]) => planejar(...a),
}));
vi.mock('@/lib/tts/audio-dsp', () => ({ pcmToMp3SemMaster: () => Buffer.alloc(4000) }));
vi.mock('@/lib/tts/deriva', () => ({ medirDeriva: () => ({ f0MedHz: 201.3 }) }));
vi.mock('@/lib/video/montar-inputprops', () => ({
  montarInputProps: () => ({ totalFrames: 100, fps: 30, height: 1080, captions: [] }),
  exportCaptionsToSrt: () => '', exportCaptionsToVtt: () => '',
}));
vi.mock('@/lib/video/ensure-render-worker', () => ({ ensureRenderWorker: vi.fn(async () => ({ provisioned: false, reason: 'teste' })) }));
vi.mock('@/trigger/render-video', () => ({ renderVideoTask: { triggerAndWait: vi.fn() } }));
vi.mock('@trigger.dev/sdk', () => ({ task: (d: any) => d }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
const degradacoes: any[] = [];
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: vi.fn(async (d: any) => { degradacoes.push(d); }),
}));
// ffmpeg/ffprobe: toda duração medida é 10 s; todo arquivo lido tem 1 s de PCM mudo.
vi.mock('node:util', async (orig) => ({ ...(await orig<typeof import('node:util')>()), promisify: () => async (cmd: string) => ({ stdout: /ffprobe/.test(cmd) ? '10.0' : '' }) }));
vi.mock('node:fs/promises', async (orig) => ({
  ...(await orig<typeof import('node:fs/promises')>()),
  mkdtemp: async () => '/tmp/teste', writeFile: async () => {}, rm: async () => {}, readFile: async () => Buffer.alloc(48000),
}));

import { executarGeracaoVideoModulo } from '@/trigger/gerar-video-modulo';

const INTRO = 'Quando tudo chega ao mesmo tempo, quem decide o seu dia é a urgência de outra pessoa.';
const OUTRO = 'Qual demanda vai sair da lista primeiro, e com que critério?';
const roteiro = () => ({
  title: 'T',
  scenes: [
    { id: 'scene-1', type: 'avatar_intro', narration: INTRO },
    { id: 'scene-2', type: 'concept_reveal', narration: 'Miolo um no tom do perfil.' },
    { id: 'scene-3', type: 'steps_flow', narration: 'Miolo dois no tom do perfil.' },
    { id: 'scene-4', type: 'avatar_outro', narration: OUTRO },
  ],
}) as any;
const MAE = {
  intro: { src: 'https://st.test/mae/scene-1.mp4', audioSrc: 'https://st.test/mae/scene-1.mp3', durationSec: 10, heygenVideoId: 'h1' },
  outro: { src: 'https://st.test/mae/scene-4.mp4', audioSrc: 'https://st.test/mae/scene-4.mp3', durationSec: 10, heygenVideoId: 'h2' },
};
const payload = (extra: any = {}) => ({
  grupoId: 'g-1', assinatura: '', f0Hz: 204.5,
  textos: { intro: { title: 't', subtitle: 's', narration: INTRO }, outro: { title: 't', subtitle: 's', narration: OUTRO } },
  avatar: MAE, ...extra,
});

let patches: any[];
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    const u = String(url);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.includes('/storage/v1/object/list/')) return ok([]);
    if (u.includes('heygen.test')) return new Response(Buffer.alloc(5000), { status: 200 });
    if (u.includes('/rest/v1/videos_gerados')) {
      if (init.method === 'PATCH') { patches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      if (u.includes('select=assets')) return ok([{ assets: {} }]);
      if (u.includes('select=empresa_id')) return ok([{ empresa_id: 'emp-1' }]);
    }
    return new Response('{}', { status: 404 });
  }));
}

const fatiasDe = (cenas: { id: string }[]) => ({ ok: true, fatias: cenas.map((c, i) => ({ id: c.id, inicio: i * 0.2, fim: i * 0.2 + 0.2, words: [], casadas: 1, total: 1 })) });
const RECUSA = 'TTS: nenhuma das 3 tentativa(s) passou no controle de qualidade; áudio não publicado (registro 1,6 st acima do alvo)';
const textoDe = (chamada: any[]) => String(chamada[0]);

beforeEach(() => {
  patches = [];
  degradacoes.length = 0;
  gerarClip.mockClear();
  tts.mockReset().mockImplementation(async () => ({ buffer: Buffer.alloc(4000), qa: { ok: true, tentativas: 1 } }));
  transcribe.mockReset().mockResolvedValue([{ word: 'x', start: 0, end: 0.1 }]);
  planejar.mockReset().mockImplementation((_w: any, cenas: any[]) => fatiasDe(cenas));
  stubFetch();
});

/** Descobre a assinatura real rodando uma mãe (é o que o orquestrador gravaria). */
async function assinaturaDaMae(): Promise<string> {
  const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
  tts.mockClear(); gerarClip.mockClear(); patches = []; degradacoes.length = 0;
  return r.grupo.assinatura;
}

describe('sem grupo: o fluxo de antes', () => {
  it('um take sobre as 4 cenas, sem alvo do grupo, e HeyGen nas 2 cenas de avatar', async () => {
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-1', roteiro: roteiro() });
    expect(tts).toHaveBeenCalledTimes(1);
    expect(textoDe(tts.mock.calls[0])).toContain('Quando tudo chega');
    expect(textoDe(tts.mock.calls[0])).toContain('Qual demanda');
    expect(tts.mock.calls[0][1]).not.toHaveProperty('alvo');
    expect(tts.mock.calls[0][1].ledger.artifactKey).toMatch(/^videos_gerados:v-1:take:/);
    expect(gerarClip).toHaveBeenCalledTimes(2);
    expect(r.grupo).toBeUndefined();
  });
});

describe('mãe', () => {
  it('devolve o avatar pronto, a F0 do take e a assinatura', async () => {
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
    expect(r.grupo).toMatchObject({ takeUnico: true, f0Hz: 201.3 });
    expect(r.grupo.assinatura).toMatch(/^Aoede\|gemini-2\.5-flash-tts\|2026-09-05\|[0-9a-f]{8}\|foto-1\|avatar_iii\|30$/);
    expect(r.grupo.avatar.intro).toMatchObject({ heygenVideoId: 'hg-novo', durationSec: 10 });
    expect(r.grupo.avatar.intro.src).toMatch(/v-mae\/scene-1-.*\.mp4$/);
    expect(r.grupo.avatar.intro.audioSrc).toMatch(/v-mae\/scene-1-.*\.mp3$/);
    expect(r.grupo.avatar.outro.src).toMatch(/v-mae\/scene-4-.*\.mp4$/);
  });

  it('take recusado (caminho por cena): a mãe avisa que NÃO serve de referência', async () => {
    planejar.mockReturnValue({ ok: false, motivo: 'corte sem pausa' });
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
    expect(r.grupo.takeUnico).toBe(false);
    expect(r.grupo.f0Hz).toBeNull();
  });
});

describe('irmã', () => {
  it('sintetiza só o miolo, com o alvo da mãe, e não paga HeyGen', async () => {
    const ass = await assinaturaDaMae();
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass }) });

    expect(tts).toHaveBeenCalledTimes(1);
    const texto = textoDe(tts.mock.calls[0]);
    expect(texto).toContain('Miolo um');
    expect(texto).not.toContain('Quando tudo chega');
    expect(texto).not.toContain('Qual demanda');
    expect(tts.mock.calls[0][1].alvo).toEqual({ f0Hz: 204.5, tolSt: 1.25 });
    expect(tts.mock.calls[0][1].ledger).toMatchObject({ feature: 'tts_video_cena', empresaId: 'emp-1' });
    expect(tts.mock.calls[0][1].ledger.artifactKey).toMatch(/^videos_gerados:v-irma:take-grupo:/);
    expect(gerarClip).not.toHaveBeenCalled();
    const final = patches.at(-1).assets;
    expect(final['scene-1']).toMatchObject({ src: MAE.intro.src, audioSrc: MAE.intro.audioSrc });
    expect(final['scene-4']).toMatchObject({ src: MAE.outro.src, audioSrc: MAE.outro.audioSrc });
    expect(degradacoes).toEqual([]);
  });

  it('portão recusa o miolo contra a altura da mãe: sai do grupo e refaz TUDO como hoje', async () => {
    const ass = await assinaturaDaMae();
    tts.mockRejectedValueOnce(new Error(RECUSA));
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass }) });

    expect(tts).toHaveBeenCalledTimes(2);
    expect(textoDe(tts.mock.calls[1])).toContain('Quando tudo chega');
    expect(tts.mock.calls[1][1]).not.toHaveProperty('alvo');
    expect(gerarClip).toHaveBeenCalledTimes(2);
    expect(patches.at(-1).assets['scene-1'].src).not.toBe(MAE.intro.src);
    expect(degradacoes.find((d) => d.chave === 'grupo:irma')?.detalhe?.motivo).toMatch(/portão recusou/);
  });

  it('falha que não é do portão (Whisper): fica no grupo e o miolo cai no caminho por cena', async () => {
    const ass = await assinaturaDaMae();
    transcribe.mockResolvedValueOnce(null);
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass }) });

    // 1 take (recusado pelo corte) + 2 cenas do miolo; nenhuma cena de avatar.
    expect(tts).toHaveBeenCalledTimes(3);
    expect(tts.mock.calls.slice(1).map(textoDe)).toEqual(['Miolo um no tom do perfil.', 'Miolo dois no tom do perfil.']);
    expect(gerarClip).not.toHaveBeenCalled();
    expect(degradacoes.some((d) => d.chave === 'grupo:irma')).toBe(false);
    expect(degradacoes.some((d) => d.tipo === 'narracao-unica-recusada')).toBe(true);
  });

  it('assinatura diferente (outra foto/motor/voz): não usa o avatar da mãe', async () => {
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: 'outra|coisa' }) });
    expect(textoDe(tts.mock.calls[0])).toContain('Quando tudo chega');
    expect(tts.mock.calls[0][1]).not.toHaveProperty('alvo');
    expect(gerarClip).toHaveBeenCalledTimes(2);
    expect(degradacoes.find((d) => d.chave === 'grupo:irma')?.detalhe?.motivo).toMatch(/assinatura/);
  });
});
