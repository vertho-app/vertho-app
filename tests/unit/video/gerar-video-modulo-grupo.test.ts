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
const gerarClip = vi.fn(async (..._a: any[]) => 'hg-novo');
const aguardarClip = vi.fn(async (..._a: any[]) => 'https://heygen.test/clip.mp4');
vi.mock('@/lib/video/heygen', () => ({
  gerarClipHeyGen: (...a: any[]) => (gerarClip as any)(...a),
  aguardarClipHeyGen: (...a: any[]) => (aguardarClip as any)(...a),
  motorHeyGen: () => 'avatar_iii', fotoPadraoHeyGen: () => 'foto-1',
}));
const subidos: Record<string, Buffer> = {};
let falharUploadAparado = false;
vi.mock('@/lib/video/render-helpers', () => ({
  storagePut: vi.fn(async (_b: string, p: string, buf: Buffer) => {
    if (falharUploadAparado && p.includes('-aparado-')) throw new Error('storage fora do ar');
    subidos[p] = buf; return `https://st.test/${p}`;
  }),
  storageGet: vi.fn(async () => Buffer.alloc(4000)), SUPA: 'https://supa.test', KEY: 'k',
}));
const transcribe = vi.fn();
vi.mock('@/lib/video/whisper-align', () => ({ transcribeWords: (...a: any[]) => transcribe(...a) }));
const planejar = vi.fn();
vi.mock('@/lib/video/narracao-unica', async (orig) => ({
  ...(await orig<typeof import('@/lib/video/narracao-unica')>()),
  planejarNarracaoUnica: (...a: any[]) => planejar(...a),
}));
// O "mp3" re-encodado carrega o tamanho do PCM que entrou: é assim que o teste vê se o
// áudio que subiu (e foi para a HeyGen) é o CORTADO ou o que o TTS devolveu.
vi.mock('@/lib/tts/audio-dsp', () => ({ pcmToMp3SemMaster: (pcm: Buffer) => Buffer.from(`MP3-PCM:${pcm.length}`) }));
// A F0 depende do tamanho do áudio medido: 201,3 Hz só para abertura + fecho JUNTOS
// (dois arquivos concatenados). É assim que o teste prova ONDE a mãe mediu a altura.
vi.mock('@/lib/tts/deriva', () => ({ medirDeriva: (pcm: Buffer) => ({ f0MedHz: pcm.length === 2 * pcmBytes ? 201.3 : 150 }) }));
vi.mock('@/lib/video/montar-inputprops', () => ({
  montarInputProps: () => ({ totalFrames: 100, fps: 30, height: 1080, captions: [] }),
  exportCaptionsToSrt: () => '', exportCaptionsToVtt: () => '',
}));
vi.mock('@/lib/video/ensure-render-worker', () => ({ ensureRenderWorker: vi.fn(async () => ({ provisioned: false, reason: 'teste' })) }));
vi.mock('@/trigger/render-video', () => ({ renderVideoTask: { triggerAndWait: vi.fn() } }));
// `tasks.trigger` dispara a task das saudações em Vertex logo depois de enfileirar o render (ver o teste da irmã).
const { dispararSaudacoes } = vi.hoisted(() => ({ dispararSaudacoes: vi.fn(async (..._a: any[]) => ({ id: 'run-1' })) }));
vi.mock('@trigger.dev/sdk', () => ({ task: (d: any) => d, tasks: { trigger: (...a: any[]) => dispararSaudacoes(...a) } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
const degradacoes: any[] = [];
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: vi.fn(async (d: any) => { degradacoes.push(d); }),
}));
// ffmpeg/ffprobe: toda duração medida é 10 s; todo arquivo lido tem `pcmBytes` de PCM mudo (1 s).
let pcmBytes = 48000;
/** Seno de 220 Hz, pico 0,1: a fala "medida" sai a −23 dBFS em qualquer arquivo lido. */
function tomPcm(bytes: number): Buffer {
  const b = Buffer.alloc(bytes);
  for (let i = 0; i < bytes / 2; i++) b.writeInt16LE(Math.round(0.1 * 32767 * Math.sin((2 * Math.PI * 220 * i) / 24000)), i * 2);
  return b;
}
/** Toda chamada de ffmpeg/ffprobe da task, com os argumentos: é como o teste vê se os quadros foram repostos. */
const chamadasExec: { cmd: string; args: string[] }[] = [];
/** Perfil de energia (dBFS por janela de 50 ms) dos arquivos lidos; depois dele, fala a −20 dB. `null` = o seno de sempre. */
let perfilDb: number[] | null = null;
function pcmDePerfil(perfil: number[], bytes: number): Buffer {
  const janela = 1200; // 50 ms a 24 kHz
  const b = Buffer.alloc(bytes);
  for (let j = 0; j * janela * 2 < bytes; j++) {
    const amp = Math.round(32768 * 10 ** ((j < perfil.length ? perfil[j] : -20) / 20));
    for (let k = 0; k < janela && (j * janela + k) * 2 + 1 < bytes; k++) b.writeInt16LE(k % 2 ? -amp : amp, (j * janela + k) * 2);
  }
  return b;
}
vi.mock('node:util', async (orig) => ({
  ...(await orig<typeof import('node:util')>()),
  promisify: () => async (cmd: string, args: string[] = []) => { chamadasExec.push({ cmd, args }); return { stdout: /ffprobe/.test(cmd) ? '10.0' : '' }; },
}));
vi.mock('node:fs/promises', async (orig) => ({
  ...(await orig<typeof import('node:fs/promises')>()),
  mkdtemp: async () => '/tmp/teste', writeFile: async () => {}, rm: async () => {}, readFile: async () => (perfilDb ? pcmDePerfil(perfilDb, pcmBytes) : tomPcm(pcmBytes)),
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
  referencia: { takeUnico: true, nivelDb: -23, pps: 2 },
  textos: { intro: { title: 't', subtitle: 's', narration: INTRO }, outro: { title: 't', subtitle: 's', narration: OUTRO } },
  avatar: MAE, ...extra,
});

let patches: any[];
const baixados: string[] = [];
let assetsIniciais: Record<string, any> = {};
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    const u = String(url);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.includes('/storage/v1/object/list/')) return ok([]);
    if (u.includes('heygen.test')) return new Response(Buffer.alloc(5000), { status: 200 });
    if (u.startsWith('https://st.test/')) { baixados.push(u); return new Response(Buffer.alloc(3000), { status: 200 }); }
    if (u.includes('/rest/v1/videos_gerados')) {
      if (init.method === 'PATCH') { patches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
      if (u.includes('select=assets')) return ok([{ assets: assetsIniciais }]);
      if (u.includes('select=empresa_id')) return ok([{ empresa_id: 'emp-1' }]);
    }
    return new Response('{}', { status: 404 });
  }));
}

/** 10 palavras a EXATAMENTE 2 por segundo. */
const dezA2pps = () => Array.from({ length: 10 }, (_, i) => ({ word: `p${i}`, start: i * 0.5, end: (i + 1) * 0.5 }));
const fatiasDe = (cenas: { id: string }[]) => ({ ok: true, fatias: cenas.map((c, i) => ({ id: c.id, inicio: i * 0.2, fim: i * 0.2 + 0.2, words: dezA2pps(), casadas: 1, total: 1 })) });
const RECUSA = 'TTS: nenhuma das 3 tentativa(s) passou no controle de qualidade; áudio não publicado (registro 1,6 st acima do alvo)';
const textoDe = (chamada: any[]) => String(chamada[0]);

beforeEach(() => {
  for (const k of Object.keys(subidos)) delete subidos[k];
  baixados.length = 0;
  patches = [];
  assetsIniciais = {};
  pcmBytes = 48000;
  perfilDb = null;
  falharUploadAparado = false;
  chamadasExec.length = 0;
  vi.unstubAllEnvs();
  degradacoes.length = 0;
  dispararSaudacoes.mockClear();
  gerarClip.mockClear();
  aguardarClip.mockReset().mockResolvedValue('https://heygen.test/clip.mp4');
  tts.mockReset().mockImplementation(async () => ({ buffer: Buffer.alloc(4000), qa: { ok: true, tentativas: 1 } }));
  transcribe.mockReset().mockImplementation(async () => dezA2pps());
  planejar.mockReset().mockImplementation((_w: any, cenas: any[]) => fatiasDe(cenas));
  stubFetch();
});

/** Descobre a assinatura real rodando uma mãe (é o que o orquestrador gravaria). */
async function assinaturaDaMae(): Promise<string> {
  const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
  tts.mockClear(); gerarClip.mockClear(); planejar.mockClear(); patches = []; degradacoes.length = 0;
  for (const k of Object.keys(subidos)) delete subidos[k];
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

  it('a F0 é medida no áudio do AVATAR (abertura + fecho que as irmãs recebem)', async () => {
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
    expect(r.grupo.f0Hz).toBe(201.3);
    expect(baixados).toEqual(expect.arrayContaining([r.grupo.avatar.intro.audioSrc, r.grupo.avatar.outro.audioSrc]));
  });

  it('take recusado (caminho por cena): a mãe SERVE de referência, com a F0 do avatar', async () => {
    planejar.mockReturnValue({ ok: false, motivo: 'corte sem pausa' });
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
    expect(r.grupo.takeUnico).toBe(false);
    expect(r.grupo.f0Hz).toBe(201.3);
    expect(r.grupo.avatar.intro?.audioSrc).toBeTruthy();
  });

  it('não conseguiu baixar o áudio do avatar: f0Hz nulo (o orquestrador não usa essa mãe)', async () => {
    const f = globalThis.fetch as any;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => (String(url).startsWith('https://st.test/') ? new Response('x', { status: 503 }) : f(url, init))));
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
    expect(r.grupo.f0Hz).toBeNull();
  });
});

describe('irmã', () => {
  it('sintetiza só o miolo, com o alvo da mãe, e não paga HeyGen', async () => {
    const ass = await assinaturaDaMae();
    dispararSaudacoes.mockClear();            // o helper acima rodou a MÃE, que também disparou: aqui só conta a irmã
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
    // O render foi para a fila e, sem esperar por ela, a task das saudações em Vertex foi disparada para ESTA célula.
    expect(dispararSaudacoes).toHaveBeenCalledTimes(1);
    expect(dispararSaudacoes.mock.calls[0].slice(0, 2)).toEqual(['gerar-saudacoes-celula', { celulaId: 'v-irma' }]);
  });

  it('o disparo das saudações que FALHA não derruba o render e deixa rastro (a caixa ainda registra a falta por pessoa)', async () => {
    const ass = await assinaturaDaMae();
    degradacoes.length = 0;                   // o helper rodou a MÃE; aqui só conta a irmã
    dispararSaudacoes.mockRejectedValueOnce(new Error('trigger api fora'));   // armado DEPOIS do helper da mãe
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass }) });
    expect(r.queued).toBe('hetzner');                    // o render segue na fila
    expect(degradacoes).toHaveLength(1);
    expect(degradacoes[0]).toMatchObject({ fluxo: 'video', tipo: 'saudacao-vertex-falhou', chave: 'celula:v-irma' });
    expect(degradacoes[0].detalhe).toMatchObject({ fase: 'disparo', erro: expect.stringContaining('trigger api fora') });
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

describe('emenda da irmã: caminho, ritmo e nível (escuta cega de 26/09/2026)', () => {
  it('a mãe devolve a régua: caminho, nível (−23 dBFS do tom) e ritmo da ABERTURA + FECHO', async () => {
    // Fecho a 4 pal/s, o resto a 2: o ritmo do avatar junta os dois (20 palavras em 7,5 s).
    planejar.mockImplementation((_w: any, cenas: any[]) => {
      const f = fatiasDe(cenas);
      f.fatias[f.fatias.length - 1].words = Array.from({ length: 10 }, (_, i) => ({ word: `q${i}`, start: i * 0.25, end: (i + 1) * 0.25 }));
      return f;
    });
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-mae', roteiro: roteiro(), papelGrupo: 'mae' });
    expect(r.grupo.referencia.takeUnico).toBe(true);
    expect(r.grupo.referencia.nivelDb).toBeCloseTo(-23, 0);
    expect(r.grupo.referencia.pps).toBeCloseTo(20 / 7.5, 3);
  });

  it('mãe que narrou CENA A CENA: a irmã narra o miolo cena a cena também (sem take único)', async () => {
    const ass = await assinaturaDaMae();
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass, referencia: { takeUnico: false, nivelDb: -23, pps: 2 } }) });
    expect(planejar).not.toHaveBeenCalled();
    expect(tts.mock.calls.map(textoDe)).toEqual(expect.arrayContaining(['Miolo um no tom do perfil.', 'Miolo dois no tom do perfil.']));
    expect(tts).toHaveBeenCalledTimes(2);
    expect(gerarClip).not.toHaveBeenCalled();
    expect(degradacoes.some((d) => d.chave === 'grupo:irma')).toBe(false);
  });

  it('ritmo do miolo fora da faixa do avatar: sai do grupo e refaz TUDO como hoje', async () => {
    const ass = await assinaturaDaMae();
    // Miolo a 2 pal/s contra um avatar a 1,5: 1,33×, fora dos ±15%.
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass, referencia: { takeUnico: true, nivelDb: -23, pps: 1.5 } }) });
    expect(degradacoes.find((d) => d.chave === 'grupo:irma')?.detalhe?.motivo).toMatch(/emenda .*ritmo do miolo 1\.33×/);
    // 1º take: só o miolo, com o alvo; 2º take: o vídeo inteiro, sem o alvo.
    expect(tts).toHaveBeenCalledTimes(2);
    expect(tts.mock.calls[0][1].alvo).toBeDefined();
    expect(textoDe(tts.mock.calls[1])).toContain('Quando tudo chega');
    expect(tts.mock.calls[1][1]).not.toHaveProperty('alvo');
    expect(gerarClip).toHaveBeenCalledTimes(2);
    expect(patches.at(-1).assets['scene-1'].src).not.toBe(MAE.intro.src);
  });

  it('nível do miolo diferente do avatar: o miolo é regravado no nível dele (−23 → −30 dBFS)', async () => {
    const ass = await assinaturaDaMae();
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass, referencia: { takeUnico: true, nivelDb: -30, pps: 2 } }) });
    const final = patches.at(-1).assets;
    for (const id of ['scene-2', 'scene-3']) {
      expect(final[id].src).toMatch(new RegExp(`v-irma/${id}-nivel-.*\\.mp3$`));
      // O mp3 regravado carrega o PCM com o ganho: mesmo tamanho, −7 dB.
      expect(subidos[final[id].src.replace('https://st.test/', '')].toString()).toMatch(/^MP3-PCM:\d+$/);
    }
    expect(final['scene-1'].src).toBe(MAE.intro.src);
    expect(gerarClip).not.toHaveBeenCalled();
  });

  it('nível já igual ao do avatar: o miolo não é regravado', async () => {
    const ass = await assinaturaDaMae();
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass }) });
    expect(Object.keys(subidos).some((k) => k.includes('-nivel-'))).toBe(false);
  });
});

describe('caminho por cena: fala A MAIS no fim (25/09/2026)', () => {
  // Retake só do fecho: as outras cenas já têm áudio (e a abertura, avatar).
  const prontas = () => ({
    'scene-1': { src: MAE.intro.src, audioSrc: MAE.intro.audioSrc, durationSec: 10 },
    'scene-2': { src: 'https://st.test/v-1/scene-2.mp3', durationSec: 10 },
    'scene-3': { src: 'https://st.test/v-1/scene-3.mp3', durationSec: 10 },
  });
  const palavras = (texto: string, t0: number) => texto.split(' ').map((w, i) => ({ word: w, start: t0 + i * 0.4, end: t0 + i * 0.4 + 0.3 }));

  it('o TTS repete a pergunta: o fecho é cortado no fim do texto ANTES de ir para a HeyGen', async () => {
    assetsIniciais = prontas();
    pcmBytes = 24000 * 2 * 20; // 20 s de áudio
    transcribe.mockResolvedValue([...palavras(OUTRO, 0), ...palavras(OUTRO, 6)]);
    await executarGeracaoVideoModulo({ videoId: 'v-1', roteiro: roteiro() });

    expect(tts).toHaveBeenCalledTimes(1);
    const outro = patches.at(-1).assets['scene-4'];
    // O corte fica 0,4 s depois do fim da última palavra do texto.
    const n = OUTRO.split(' ').length;
    const corte = (n - 1) * 0.4 + 0.3 + 0.4;
    expect(outro.sobraCortadaS).toBeCloseTo(20 - corte, 1);
    expect(outro.words).toHaveLength(n);
    expect(outro.words.every((w: any) => w.start < corte)).toBe(true);
    // Um upload só, o CORTADO, e é ele que vai para a HeyGen.
    const mp3s = Object.keys(subidos).filter((k) => /^v-1\/scene-4-.*\.mp3$/.test(k));
    expect(mp3s).toHaveLength(1);
    expect(subidos[mp3s[0]].toString()).toBe(`MP3-PCM:${Math.ceil(corte * 24000) * 2}`);
    expect(gerarClip).toHaveBeenCalledTimes(1);
    expect(gerarClip.mock.calls[0][0]).toBe(`https://st.test/${mp3s[0]}`);
  });

  it('fecho sem sobra: o áudio segue como veio, sem `sobraCortadaS`', async () => {
    assetsIniciais = prontas();
    pcmBytes = 24000 * 2 * 6;
    transcribe.mockResolvedValue(palavras(OUTRO, 0));
    await executarGeracaoVideoModulo({ videoId: 'v-1', roteiro: roteiro() });
    expect(patches.at(-1).assets['scene-4']).not.toHaveProperty('sobraCortadaS');
    expect(patches.at(-1).assets['scene-4'].words).toHaveLength(OUTRO.split(' ').length);
  });
});

/**
 * SOPRO antes da fala no fecho (08/10/2026). O `avatar_iii` é determinístico: um fecho que abre com sopro de ~−50 dB sai com
 * a boca atrasada e re-sortear não conserta. A task apara o começo do áudio ENVIADO à HeyGen e repõe os mesmos quadros no
 * clipe devolvido, para ele voltar a casar com o mp3 ORIGINAL que a composição toca. A régua é a de `aparar-sopro.test.ts`;
 * aqui se prova a FIAÇÃO: o que vai à HeyGen, o que volta, o que fica gravado e o que acontece quando algo falha.
 */
describe('aparo do sopro antes da fala (avatar)', () => {
  // As 12 primeiras janelas do fecho REAL da e405782d (Boehringer): sopro de −50 dB e fala em 0,40 s → 8 quadros.
  const COM_SOPRO = [-76, -52, -55, -52, -52, -54, -50, -72, -28, -21, -26, -31];
  // A abertura REAL da mesma célula: pico de −63 dB antes da fala em 0,25 s.
  const LIMPO = [-93, -63, -63, -64, -64, -36, -20, -17, -36, -39, -16, -23];
  const AMOSTRAS_8_QUADROS = Math.round((8 / 30) * 24000); // 6.400
  const aparados = () => Object.keys(subidos).filter((k) => /-aparado-.*\.mp3$/.test(k));
  const tpads = () => chamadasExec.filter((c) => c.args.some((a) => /tpad=start_mode=clone/.test(a)));
  const filtroDe = (c: { args: string[] }) => c.args[c.args.indexOf('-filter_complex') + 1];

  it('com sopro: a HeyGen recebe o áudio APARADO, o clipe volta com os quadros repostos e o mp3 original segue como áudio da cena', async () => {
    perfilDb = COM_SOPRO; pcmBytes = 24000 * 2 * 3;
    await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });

    // abertura e fecho, cada um com o seu mp3 aparado (o perfil é o mesmo nos dois)
    expect(aparados()).toHaveLength(2);
    for (const k of aparados()) expect(subidos[k].toString()).toBe(`MP3-PCM:${(pcmBytes / 2 - AMOSTRAS_8_QUADROS) * 2}`);
    expect(gerarClip).toHaveBeenCalledTimes(2);
    for (const c of gerarClip.mock.calls) expect(String(c[0])).toMatch(/\/v-ap\/scene-[14]-aparado-.*\.mp3$/);

    // 8 quadros a 30 fps = 0,2667 s: imagem parada e voz embutida atrasada pelo mesmo tempo
    expect(tpads()).toHaveLength(2);
    for (const c of tpads()) expect(filtroDe(c)).toBe('[0:v]tpad=start_mode=clone:start_duration=0.2667[v];[0:a]adelay=267|267[a]');
    // ... DEPOIS de normalizar para CFR (a ordem que o dono validou de ouvido): o ffmpeg de `-r 30` sem filtro vem antes
    const cfr = chamadasExec.findIndex((c) => c.args.includes('-r') && !c.args.includes('-filter_complex') && c.args.includes('libx264'));
    const pad = chamadasExec.findIndex((c) => c.args.some((a) => /tpad/.test(a)));
    expect(cfr).toBeGreaterThanOrEqual(0);
    expect(cfr).toBeLessThan(pad);

    // o que fica gravado: o áudio da cena é o ORIGINAL (a composição toca ele), e dá para contar quantos foram aparados
    const final = patches.at(-1).assets;
    for (const id of ['scene-1', 'scene-4']) {
      expect(final[id].audioSrc).not.toMatch(/aparado/);
      expect(final[id].audioSrc).toMatch(new RegExp(`/v-ap/${id}-[a-z0-9]+\\.mp3$`));
      expect(final[id].aparouQuadros).toBe(8);
    }
    // e o aparo foi persistido junto do id do clipe ANTES de esperar a HeyGen (a retomada precisa dos dois). O patch
    // certo é o INTERMEDIÁRIO (id do clipe e ainda sem `audioSrc`): o estado final também os tem e não prova nada.
    expect(patches.some((p) => { const a = p.assets?.['scene-1']; return a?.heygenVideoId === 'hg-novo' && a.aparouQuadros === 8 && !a.audioSrc; })).toBe(true);
    expect(degradacoes).toEqual([]);
  });

  it('abertura limpa: a HeyGen recebe o áudio como veio e nenhum quadro é reposto', async () => {
    perfilDb = LIMPO; pcmBytes = 24000 * 2 * 3;
    await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });
    expect(aparados()).toEqual([]);
    for (const c of gerarClip.mock.calls) expect(String(c[0])).not.toMatch(/aparado/);
    expect(tpads()).toEqual([]);
    expect(patches.at(-1).assets['scene-1']).not.toHaveProperty('aparouQuadros');
  });

  it('VIDEO_APARAR_SOPRO=off desliga sem deploy: mesmo com sopro, o áudio vai inteiro', async () => {
    vi.stubEnv('VIDEO_APARAR_SOPRO', 'off');
    perfilDb = COM_SOPRO; pcmBytes = 24000 * 2 * 3;
    await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });
    expect(aparados()).toEqual([]);
    for (const c of gerarClip.mock.calls) expect(String(c[0])).not.toMatch(/aparado/);
    expect(tpads()).toEqual([]);
  });

  it('o aparo QUEBRA (storage fora): o vídeo sai com o áudio inteiro, como antes, e a falha fica em degradacao_log', async () => {
    falharUploadAparado = true;
    perfilDb = COM_SOPRO; pcmBytes = 24000 * 2 * 3;
    const r: any = await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });
    expect(r.queued).toBe('hetzner');                        // o render segue na fila
    for (const c of gerarClip.mock.calls) expect(String(c[0])).not.toMatch(/aparado/);
    expect(tpads()).toEqual([]);                             // sem aparo, nada a repor (repor aqui seria boca ADIANTADA)
    const falhas = degradacoes.filter((d) => d.tipo === 'avatar-aparo-falhou');
    expect(falhas.map((d) => d.chave).sort()).toEqual(['v-ap:scene-1', 'v-ap:scene-4']);
    expect(falhas[0]).toMatchObject({ fluxo: 'video', severidade: 'aviso', empresaId: 'emp-1' });
    expect(falhas[0].detalhe.erro).toContain('storage fora do ar');
  });

  it('retomada de um clipe JÁ PAGO com aparo: repõe os MESMOS quadros e não paga outro clipe', async () => {
    assetsIniciais = {
      'scene-1': { src: 'https://st.test/v-ap/scene-1-x.mp3', durationSec: 0, heygenVideoId: 'hg-pago', aparouQuadros: 8 },
      'scene-2': { src: 'https://st.test/v-ap/scene-2-x.mp3', durationSec: 0 },
      'scene-3': { src: 'https://st.test/v-ap/scene-3-x.mp3', durationSec: 0 },
      'scene-4': { src: 'https://st.test/v-ap/scene-4-x.mp3', durationSec: 0, heygenVideoId: 'hg-pago-2', aparouQuadros: 11 },
    };
    await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });
    expect(gerarClip).not.toHaveBeenCalled();
    expect(aparados()).toEqual([]);                          // não re-analisa nem re-sobe áudio: o clipe já existe
    expect(tpads().map(filtroDe).sort()).toEqual([
      '[0:v]tpad=start_mode=clone:start_duration=0.2667[v];[0:a]adelay=267|267[a]',
      '[0:v]tpad=start_mode=clone:start_duration=0.3667[v];[0:a]adelay=367|367[a]',
    ]);
    expect(patches.at(-1).assets['scene-4'].aparouQuadros).toBe(11);
  });

  it('o clipe anterior NÃO retoma e a cena é gerada de novo: o aparo antigo não vaza para o clipe novo', async () => {
    // O clipe `hg-morto` foi pago com 8 quadros aparados, mas a HeyGen não o entrega mais. O áudio desta cena não tem
    // sopro, então o clipe NOVO sai sem aparo: repor 8 quadros nele seria boca atrasada de novo, por herança.
    aguardarClip.mockRejectedValueOnce(new Error('clipe sumiu na HeyGen'));
    perfilDb = LIMPO; pcmBytes = 24000 * 2 * 3;
    assetsIniciais = {
      'scene-1': { src: 'https://st.test/v-ap/scene-1-x.mp3', durationSec: 0, heygenVideoId: 'hg-morto', aparouQuadros: 8 },
      'scene-2': { src: 'https://st.test/v-ap/scene-2-x.mp3', durationSec: 0 },
      'scene-3': { src: 'https://st.test/v-ap/scene-3-x.mp3', durationSec: 0 },
      'scene-4': { src: 'https://st.test/v-ap/scene-4-x.mp3', durationSec: 0 },
    };
    await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });
    expect(gerarClip).toHaveBeenCalledTimes(2);              // a cena 1 refeita e a 4 que ainda não tinha clipe
    expect(tpads()).toEqual([]);
    expect(patches.at(-1).assets['scene-1']).not.toHaveProperty('aparouQuadros');
    expect(patches.at(-1).assets['scene-1'].heygenVideoId).toBe('hg-novo');
    // E o estado INTERMEDIÁRIO, o que uma retomada leria se a task caísse agora, também não traz o aparo do clipe morto.
    const intermediarios = patches.map((p) => p.assets?.['scene-1']).filter((a) => a?.heygenVideoId === 'hg-novo');
    expect(intermediarios.length).toBeGreaterThan(0);
    for (const a of intermediarios) expect(a).not.toHaveProperty('aparouQuadros');
  });

  it('retomada de um clipe pago ANTES do aparo existir (sem `aparouQuadros`): nada é reposto', async () => {
    assetsIniciais = {
      'scene-1': { src: 'https://st.test/v-ap/scene-1-x.mp3', durationSec: 0, heygenVideoId: 'hg-velho' },
      'scene-2': { src: 'https://st.test/v-ap/scene-2-x.mp3', durationSec: 0 },
      'scene-3': { src: 'https://st.test/v-ap/scene-3-x.mp3', durationSec: 0 },
      'scene-4': { src: 'https://st.test/v-ap/scene-4-x.mp3', durationSec: 0, heygenVideoId: 'hg-velho-2' },
    };
    await executarGeracaoVideoModulo({ videoId: 'v-ap', roteiro: roteiro() });
    expect(tpads()).toEqual([]);
    expect(patches.at(-1).assets['scene-1']).not.toHaveProperty('aparouQuadros');
  });

  it('a irmã de um grupo usa o avatar da mãe como veio: não analisa, não apara e não repõe nada', async () => {
    const ass = await assinaturaDaMae();
    chamadasExec.length = 0;
    perfilDb = COM_SOPRO; pcmBytes = 24000 * 2 * 3;
    await executarGeracaoVideoModulo({ videoId: 'v-irma', roteiro: roteiro(), avatarGrupo: payload({ assinatura: ass }) });
    expect(gerarClip).not.toHaveBeenCalled();
    expect(aparados()).toEqual([]);
    expect(tpads()).toEqual([]);
  });
});
