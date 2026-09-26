import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Orquestrador do avatar compartilhado (`trigger/gerar-video-grupo.ts`).
 *
 * As garantias que valem dinheiro ou vídeo:
 *   · a mãe é UMA (a 1ª pela ordem DISC) e só vira referência com narração única,
 *     duas cenas de avatar e F0 medida; senão as irmãs pagam a própria HeyGen;
 *   · a irmã recebe o avatar só do grupo do SEU tenant/módulo/cargo;
 *   · nenhuma célula é disparada duas vezes, nem fica esperando para sempre: se o
 *     orquestrador cair no meio, o que sobrou sai pelo fluxo de hoje.
 * O REST do Supabase e a task da mãe são simulados; a forma das respostas segue o
 * PostgREST (PATCH com `return=representation` devolve as linhas que casaram).
 */

const triggerAndWait = vi.fn();
const batchTrigger = vi.fn(async () => ({ batchId: 'b1' }));
vi.mock('@/trigger/gerar-video-modulo', () => ({ gerarVideoModuloTask: { triggerAndWait: (...a: any[]) => triggerAndWait(...a), batchTrigger: (...a: any[]) => (batchTrigger as any)(...a) } }));
vi.mock('@trigger.dev/sdk', () => ({ task: (def: any) => def }));
vi.mock('@/lib/video/render-helpers', () => ({ SUPA: 'https://supa.test', KEY: 'k' }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
const degradacoes: any[] = [];
vi.mock('@/lib/degradacao', async (orig) => ({
  ...(await orig<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: vi.fn(async (d: any) => { degradacoes.push(d); }),
}));

import { executarGrupoAvatar, payloadDoGrupo, problemaDaMae } from '@/trigger/gerar-video-grupo';

const TEXTOS = {
  intro: { title: 't', subtitle: 's', narration: 'Abertura do grupo.' },
  outro: { title: 't', subtitle: 's', narration: 'Fecho do grupo?' },
};
const AVATAR = {
  intro: { src: 'https://x/mae/scene-1.mp4', audioSrc: 'https://x/mae/scene-1.mp3', durationSec: 15, heygenVideoId: 'h1' },
  outro: { src: 'https://x/mae/scene-9.mp4', audioSrc: 'https://x/mae/scene-9.mp3', durationSec: 13, heygenVideoId: 'h2' },
};
const REF = { takeUnico: false, nivelDb: -21.5, pps: 2.01 };
const MAE_OK = { ok: true, output: { ok: true, grupo: { takeUnico: false, f0Hz: 204.5, referencia: REF, assinatura: 'ass-1', avatar: AVATAR } } };
/** Como o grupo guarda o avatar: com a régua da emenda junto (26/09/2026). */
const AVATAR_GRAVADO = { ...AVATAR, referencia: REF };

let grupo: any;
let celulas: Array<{ id: string; disc_dominante: string; roteiro: any; etapa: string }>;
let patchesGrupo: any[];
let consultasCelulas: string[];

function stubRest() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    const u = new URL(url);
    const metodo = init.method || 'GET';
    const q = decodeURIComponent(u.search);
    const json = (s: number, b: unknown) => new Response(b === null ? null : JSON.stringify(b), { status: s });
    if (u.pathname.endsWith('/video_avatar_grupo')) {
      if (metodo === 'GET') return json(200, [grupo]);
      patchesGrupo.push(JSON.parse(init.body));
      Object.assign(grupo, JSON.parse(init.body));
      return json(204, null);
    }
    if (u.pathname.endsWith('/videos_gerados')) {
      if (metodo === 'GET') {
        consultasCelulas.push(q);
        return json(200, celulas.filter((c) => c.etapa === 'aguardando_avatar'));
      }
      // Reivindicação: só casa se a célula ainda espera (o UPDATE condicional do PostgREST).
      const id = q.match(/id=eq\.([^&]+)/)![1];
      const c = celulas.find((x) => x.id === id && x.etapa === 'aguardando_avatar' && q.includes('etapa=eq.aguardando_avatar'));
      if (c) c.etapa = JSON.parse(init.body).etapa;
      return json(200, c ? [{ id }] : []);
    }
    return json(404, {});
  }));
}

const celula = (id: string, disc: string) => ({ id, disc_dominante: disc, roteiro: { scenes: [{ id: 'scene-1' }] }, etapa: 'aguardando_avatar' });
const disparadas = () => (batchTrigger.mock.calls as any[]).flatMap((c) => c[0]).map((i: any) => i.payload);

beforeEach(() => {
  grupo = { id: 'g-1', empresa_id: 'emp-1', modulo_base_id: 'mod-1', cargo: 'Professor(a)', status: 'pendente', intro: TEXTOS.intro, outro: TEXTOS.outro, avatar: null, f0_hz: null, assinatura: null };
  // Criadas fora da ordem DISC: a mãe tem de ser a D mesmo assim.
  celulas = [celula('v-S', 'S'), celula('v-D', 'D'), celula('v-I', 'I')];
  patchesGrupo = [];
  consultasCelulas = [];
  degradacoes.length = 0;
  triggerAndWait.mockReset().mockResolvedValue(MAE_OK);
  batchTrigger.mockClear();
  stubRest();
});

describe('executarGrupoAvatar · caminho feliz', () => {
  it('gera a mãe (a 1ª pela ordem DISC), grava o avatar e só então dispara as irmãs com ele', async () => {
    const r: any = await executarGrupoAvatar({ grupoId: 'g-1' });

    expect(triggerAndWait).toHaveBeenCalledTimes(1);
    expect(triggerAndWait.mock.calls[0][0]).toMatchObject({ videoId: 'v-D', papelGrupo: 'mae' });
    expect(patchesGrupo.at(-1)).toMatchObject({ status: 'pronto', avatar: AVATAR_GRAVADO, f0_hz: 204.5, assinatura: 'ass-1' });
    expect(disparadas().map((p: any) => p.videoId)).toEqual(['v-I', 'v-S']);
    for (const p of disparadas()) {
      expect(p.avatarGrupo).toEqual({ grupoId: 'g-1', assinatura: 'ass-1', f0Hz: 204.5, referencia: REF, textos: TEXTOS, avatar: AVATAR });
    }
    expect(r).toMatchObject({ ok: true, mae: 'v-D', irmas: ['v-I', 'v-S'] });
    expect(degradacoes).toEqual([]);
  });

  it('a busca das células repete o tenant, o módulo e o cargo do grupo', async () => {
    await executarGrupoAvatar({ grupoId: 'g-1' });
    const q = consultasCelulas[0];
    for (const f of ['avatar_grupo_id=eq.g-1', 'empresa_id=eq.emp-1', 'modulo_base_id=eq.mod-1', 'cargo=eq.Professor(a)', 'etapa=eq.aguardando_avatar', 'status=eq.processing']) {
      expect(q, f).toContain(f);
    }
  });

  it('grupo já pronto: ninguém vira mãe, todas saem como irmãs', async () => {
    Object.assign(grupo, { status: 'pronto', avatar: AVATAR_GRAVADO, f0_hz: 199, assinatura: 'ass-0' });
    await executarGrupoAvatar({ grupoId: 'g-1' });
    expect(triggerAndWait).not.toHaveBeenCalled();
    expect(disparadas().map((p: any) => p.videoId)).toEqual(['v-D', 'v-I', 'v-S']);
    expect(disparadas().every((p: any) => p.avatarGrupo?.f0Hz === 199)).toBe(true);
  });

  it('grupo "pronto" sem avatar utilizável é tratado como pendente (gera mãe)', async () => {
    Object.assign(grupo, { status: 'pronto', avatar: { intro: AVATAR.intro, outro: null, referencia: REF }, f0_hz: 199, assinatura: 'ass-0' });
    await executarGrupoAvatar({ grupoId: 'g-1' });
    expect(triggerAndWait).toHaveBeenCalledTimes(1);
  });

  it('célula já tirada da espera por outra rodada não é disparada de novo', async () => {
    celulas.find((c) => c.id === 'v-S')!.etapa = 'narracao';
    await executarGrupoAvatar({ grupoId: 'g-1' });
    expect(disparadas().map((p: any) => p.videoId)).toEqual(['v-I']);
  });

  it('nenhuma célula esperando: não gera nada', async () => {
    celulas.forEach((c) => { c.etapa = 'render'; });
    const r: any = await executarGrupoAvatar({ grupoId: 'g-1' });
    expect(triggerAndWait).not.toHaveBeenCalled();
    expect(batchTrigger).not.toHaveBeenCalled();
    expect(r.motivo).toMatch(/nenhuma/);
  });
});

describe('executarGrupoAvatar · a mãe não serve de referência', () => {
  it.each([
    ['falhou', { ok: false, error: { message: 'HeyGen timeout aguardando video_id x' } }, /mãe falhou: HeyGen timeout/],
    ['sem F0 do avatar', { ok: true, output: { grupo: { ...MAE_OK.output.grupo, f0Hz: null } } }, /F0 medida no áudio do avatar/],
    ['sem o fecho', { ok: true, output: { grupo: { ...MAE_OK.output.grupo, avatar: { intro: AVATAR.intro, outro: null } } } }, /duas cenas/],
    ['sem ritmo do avatar', { ok: true, output: { grupo: { ...MAE_OK.output.grupo, referencia: { ...REF, pps: null } } } }, /ritmo ou nível/],
    ['sem nível do avatar', { ok: true, output: { grupo: { ...MAE_OK.output.grupo, referencia: { ...REF, nivelDb: null } } } }, /ritmo ou nível/],
  ])('mãe %s: grupo em erro, degradação, irmãs no fluxo de hoje (sem o avatar)', async (_nome, res, motivo) => {
    triggerAndWait.mockResolvedValue(res);
    const r: any = await executarGrupoAvatar({ grupoId: 'g-1' });

    expect(patchesGrupo.at(-1)).toMatchObject({ status: 'erro' });
    expect(patchesGrupo.at(-1).erro).toMatch(motivo);
    expect(degradacoes[0]).toMatchObject({ fluxo: 'video', tipo: 'video-avatar-grupo-fallback', chave: 'grupo:mae', empresaId: 'emp-1' });
    expect(disparadas().map((p: any) => p.videoId)).toEqual(['v-I', 'v-S']);
    expect(disparadas().every((p: any) => !('avatarGrupo' in p))).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('mãe que saiu pelo caminho por cena SERVE de referência (regra de 25/09/2026)', async () => {
    triggerAndWait.mockResolvedValue({ ok: true, output: { grupo: { ...MAE_OK.output.grupo, takeUnico: false } } });
    const r: any = await executarGrupoAvatar({ grupoId: 'g-1' });
    expect(patchesGrupo.at(-1)).toMatchObject({ status: 'pronto', f0_hz: 204.5 });
    expect(disparadas().every((p: any) => p.avatarGrupo?.f0Hz === 204.5)).toBe(true);
    expect(r.ok).toBe(true);
    expect(degradacoes).toEqual([]);
  });

  it('a mãe já foi tirada da espera por outra rodada: não dispara nada', async () => {
    celulas.find((c) => c.id === 'v-D')!.etapa = 'narracao';
    // v-D saiu da espera: a busca não a devolve, então a mãe passa a ser a I.
    await executarGrupoAvatar({ grupoId: 'g-1' });
    expect(triggerAndWait.mock.calls[0][0].videoId).toBe('v-I');
  });

  it('o orquestrador cai no meio: grupo em erro e o que sobrou sai pelo fluxo de hoje', async () => {
    triggerAndWait.mockRejectedValue(new Error('worker reiniciou'));
    await expect(executarGrupoAvatar({ grupoId: 'g-1' })).rejects.toThrow('worker reiniciou');
    expect(patchesGrupo.at(-1)).toMatchObject({ status: 'erro' });
    expect(degradacoes.at(-1)?.chave).toBe('grupo:orquestrador');
    expect(disparadas().map((p: any) => p.videoId)).toEqual(['v-I', 'v-S']);
    expect(disparadas().every((p: any) => !('avatarGrupo' in p))).toBe(true);
  });
});

describe('payloadDoGrupo e problemaDaMae', () => {
  it('payload só existe com as duas cenas, F0, assinatura e textos', () => {
    const g = { id: 'g-1', avatar: AVATAR_GRAVADO, f0_hz: 200, assinatura: 'a', intro: TEXTOS.intro, outro: TEXTOS.outro };
    expect(payloadDoGrupo(g)?.referencia).toEqual(REF);
    // Grupo gravado antes da régua da emenda (26/09/2026): não é reaproveitável.
    expect(payloadDoGrupo({ ...g, avatar: AVATAR })).toBeNull();
    expect(payloadDoGrupo({ ...g, avatar: { ...AVATAR, referencia: { ...REF, pps: 0 } } })).toBeNull();
    expect(payloadDoGrupo({ ...g, f0_hz: 0 })).toBeNull();
    expect(payloadDoGrupo({ ...g, assinatura: null })).toBeNull();
    expect(payloadDoGrupo({ ...g, avatar: { ...AVATAR_GRAVADO, intro: { ...AVATAR.intro, audioSrc: '' } } })).toBeNull();
    expect(payloadDoGrupo({ ...g, outro: { ...TEXTOS.outro, narration: '' } })).toBeNull();
  });

  it('a mãe boa não tem problema', () => {
    expect(problemaDaMae(MAE_OK)).toBeNull();
  });
});
