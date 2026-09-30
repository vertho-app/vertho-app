import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Kit semanal com o avatar compartilhado (`VIDEO_AVATAR_GRUPO`, 25/09/2026).
 *
 * Duas garantias:
 *   1. flag DESLIGADA (o padrão) = o Kit de antes: nenhum grupo, nenhuma célula
 *      esperando, o vídeo de cada DISC dispara sozinho;
 *   2. flag LIGADA = UM grupo por (empresa × módulo × cargo), criado ANTES do fan-out
 *      (senão os 4 DISC correriam para criá-lo), entregue a todas as células, e UM
 *      despacho no fim. Nos dois caminhos (lote e sequencial).
 */

const ordem: string[] = [];
const dispararVideoDoKit = vi.fn(async (_sb: any, a: any) => {
  ordem.push(`video-${a.disc}`);
  return { id: `v-${a.disc}`, status: 'processing', ...(a.avatarGrupo ? { adiado: true } : {}) };
});
vi.mock('@/actions/gerar-video', () => ({ dispararVideoDoKit: (...a: any[]) => (dispararVideoDoKit as any)(...a) }));

// Coletor e agenda dos roteiros (30/09/2026): marcadores, para provar que os 4 DISC
// recebem o MESMO coletor e a MESMA agenda. A etiqueta do ledger e a conta da agenda
// têm teste próprio em `tests/unit/video/roteiro-lote.test.ts`.
const RUN_ROTEIRO = vi.fn(async () => 'roteiro');
const AGENDA = { proximoAtrasoS: () => 0 };
const coletorDeRoteiros = vi.fn(async (..._a: any[]) => RUN_ROTEIRO);
const criarAgendaDeDisparo = vi.fn(() => AGENDA);
vi.mock('@/lib/video/roteiro-lote', () => ({
  coletorDeRoteiros: (...a: any[]) => (coletorDeRoteiros as any)(...a),
  criarAgendaDeDisparo: (...a: any[]) => (criarAgendaDeDisparo as any)(...a),
}));

const prepararGrupoAvatar = vi.fn(async (..._a: any[]) => { ordem.push('grupo'); return { id: 'g-1', status: 'pendente', textos: TEXTOS }; });
const despacharGrupoAvatar = vi.fn(async (..._a: any[]) => { ordem.push('despacho'); return { via: 'grupo', erros: [] }; });
vi.mock('@/lib/video/avatar-grupo-core', async (orig) => ({
  ...(await orig<typeof import('@/lib/video/avatar-grupo-core')>()),
  prepararGrupoAvatar: (...a: any[]) => (prepararGrupoAvatar as any)(...a),
  despacharGrupoAvatar: (...a: any[]) => (despacharGrupoAvatar as any)(...a),
}));

const resolverOuCriarBrief = vi.fn(async () => ({ briefId: 'b1', brief: { espinha: 'núcleo' }, moduloBaseId: 'mod-1', reused: true }));
vi.mock('@/lib/season-engine/kit/brief', () => ({
  resolverOuCriarBrief: (...a: any[]) => (resolverOuCriarBrief as any)(...a),
  gerarKitDesafio: vi.fn(async (_p: any, _b: any, disc: string) => { ordem.push(`desafio-${disc}`); return { desafio_texto: `desafio ${disc}` }; }),
}));
vi.mock('@/lib/season-engine/kit/contexto-empresa', () => ({ resolverContextoEmpresa: vi.fn(async () => 'PPP municipal') }));
vi.mock('@/actions/conteudos', () => ({ gerarConteudoIA: vi.fn(async (p: any) => ({ success: true, conteudoId: `c-${p.formato}`, titulo: p.formato })) }));
vi.mock('@/lib/season-engine/perfil-publico', () => ({ resolverPerfilPublicoDaEmpresa: vi.fn(async () => ({ registro: 'formal' })) }));
vi.mock('@/lib/season-engine/kit/plano-coorte', () => ({ levantarPlanoKitsCoorte: vi.fn() }));
vi.mock('@/lib/season-engine/kit/plano-desafios', () => ({ prepararDesafiosDaCoorte: vi.fn(async () => ({})) }));
vi.mock('@/lib/cargo-contexto', () => ({ carregarFichaCargo: vi.fn(async () => null) }));
vi.mock('@/lib/ai-batch', () => ({ createAIBatchCollector: () => ({ run: vi.fn(async () => 'x') }) }));
let sbDaTela: any = null;
vi.mock('@/lib/admin-supabase', () => ({ requireEmpresaSupabase: vi.fn(async () => sbDaTela), requireLinhaSupabase: vi.fn() }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));

import { criarSupabaseMock } from '../helpers/supabase-mock';
import { gerarKitSemanal, gerarKit } from '@/actions/kits';

const TEXTOS = { intro: { title: 't', subtitle: 's', narration: 'abertura' }, outro: { title: 't', subtitle: 's', narration: 'fecho?' } };
const sbFake = () => criarSupabaseMock({ resolver: (t) => (t === 'kits' ? { id: 'kit-1' } : null) }).client;
const BASE = { competencia: 'Autocuidado', descritor: 'Priorização', empresaId: 'emp-1', cargo: 'Professor(a)', formatos: ['texto'] as any };

/**
 * Até 30/09/2026 havia aqui um LIMITE DO INSTRUMENTO: cada `gerarKit` importava
 * `@/actions/gerar-video` dinamicamente, os 4 DISC do lote faziam o import em paralelo,
 * e o vitest só entregava o MOCK ao primeiro (os outros recebiam o módulo real). Desde
 * que os vídeos saem juntos, numa fase de `gerarKitSemanal` com UM import só, as 4
 * células chegam ao mock nos dois caminhos.
 */
const chegaramAoMock = () => dispararVideoDoKit.mock.calls.map((c: any[]) => c[1]);

beforeEach(() => {
  vi.unstubAllEnvs();
  ordem.length = 0;
  dispararVideoDoKit.mockClear();
  coletorDeRoteiros.mockClear();
  criarAgendaDeDisparo.mockClear();
  prepararGrupoAvatar.mockClear();
  despacharGrupoAvatar.mockClear();
  resolverOuCriarBrief.mockClear();
});

describe('flag desligada (padrão): o Kit de antes', () => {
  it.each([true, false])('useBatch=%s: sem grupo, cada DISC dispara o seu vídeo', async (useBatch) => {
    const r = await gerarKitSemanal({ ...BASE, discs: ['D', 'I', 'S', 'C'], useBatch, sb: sbFake() });
    expect(r.success).toBe(true);
    expect(prepararGrupoAvatar).not.toHaveBeenCalled();
    expect(despacharGrupoAvatar).not.toHaveBeenCalled();
    expect(chegaramAoMock().length).toBe(4);
    expect(chegaramAoMock().every((a) => a.avatarGrupo === null)).toBe(true);
    // Sem o grupo, o sequencial resolve o brief por DISC, como sempre (o 1º cria, os
    // outros reusam); só com o grupo ele sai antes do fan-out.
    expect(resolverOuCriarBrief).toHaveBeenCalledTimes(useBatch ? 1 : 4);
    expect(r).not.toHaveProperty('videoGrupo');
  });
});

describe('vídeos dos DISC juntos, roteiros num lote só (30/09/2026)', () => {
  it.each([true, false])('useBatch=%s: saem depois do último desafio, com o MESMO coletor e a MESMA agenda', async (useBatch) => {
    const r: any = await gerarKitSemanal({ ...BASE, discs: ['D', 'I', 'S', 'C'], useBatch, sb: sbFake() });

    // Nenhum vídeo no meio dos DISC: no sequencial, disparar dentro do `gerarKit`
    // intercalaria `video-D` entre `desafio-D` e `desafio-I`.
    const ultimoDesafio = ordem.findLastIndex((o) => o.startsWith('desafio-'));
    const primeiroVideo = ordem.findIndex((o) => o.startsWith('video-'));
    expect(primeiroVideo).toBeGreaterThan(ultimoDesafio);
    expect(coletorDeRoteiros).toHaveBeenCalledTimes(1);
    expect(coletorDeRoteiros.mock.calls[0][0]).toBe('emp-1');
    expect(criarAgendaDeDisparo).toHaveBeenCalledTimes(1);
    const chamadas = chegaramAoMock();
    expect(chamadas.map((a) => a.disc)).toEqual(['D', 'I', 'S', 'C']);
    expect(chamadas.every((a) => a.aiRunRoteiro === RUN_ROTEIRO && a.agendaDisparo === AGENDA)).toBe(true);
    // A entrada do vídeo continua no retorno (é ela que vai para o progresso do job).
    for (const k of r.kits) {
      expect(k.conteudos.find((c: any) => c.formato === 'video')).toMatchObject({ conteudoId: `v-${k.disc}`, ok: true, titulo: 'vídeo (renderizando)' });
    }
  });

  it('sem vídeo no lote, nenhum coletor de roteiro é criado', async () => {
    await gerarKitSemanal({ ...BASE, discs: ['D', 'I'], incluirVideo: false, sb: sbFake() });
    expect(coletorDeRoteiros).not.toHaveBeenCalled();
    expect(dispararVideoDoKit).not.toHaveBeenCalled();
  });

  it('chamada da TELA (sem `sb`) ignora `adiarVideo`: o vídeo sai na hora, sem coletor', async () => {
    sbDaTela = sbFake();
    const r: any = await gerarKit({ ...BASE, disc: 'D', adiarVideo: true });
    expect(r).not.toHaveProperty('videoPendente');
    expect(dispararVideoDoKit).toHaveBeenCalledTimes(1);
    expect(dispararVideoDoKit.mock.calls[0][1]).not.toHaveProperty('aiRunRoteiro');
    expect(r.conteudos.find((c: any) => c.formato === 'video')).toMatchObject({ conteudoId: 'v-D' });
  });
});

describe('flag ligada', () => {
  beforeEach(() => vi.stubEnv('VIDEO_AVATAR_GRUPO', 'on'));

  it.each([true, false])('useBatch=%s: 1 grupo ANTES dos DISC, entregue a todos, 1 despacho no fim', async (useBatch) => {
    const r: any = await gerarKitSemanal({ ...BASE, discs: ['D', 'I', 'S', 'C'], useBatch, sb: sbFake() });

    expect(prepararGrupoAvatar).toHaveBeenCalledTimes(1);
    expect(prepararGrupoAvatar.mock.calls[0][1]).toEqual({ empresaId: 'emp-1', moduloBaseId: 'mod-1', cargo: 'Professor(a)', pppBrief: 'PPP municipal' });
    expect(ordem[0]).toBe('grupo');
    expect(ordem.at(-1)).toBe('despacho');
    expect(chegaramAoMock().map((a) => a.avatarGrupo)).toEqual(Array(4).fill({ grupoId: 'g-1', textos: TEXTOS }));
    // O grupo nasce antes do 1º desafio (o fan-out), não no meio dele.
    expect(ordem.indexOf('grupo')).toBeLessThan(ordem.findIndex((o) => o.startsWith('desafio-')));
    // As células entram no banco ANTES do despacho, que as lê de lá.
    expect(ordem.findLastIndex((o) => o.startsWith('video-'))).toBeLessThan(ordem.indexOf('despacho'));
    expect(despacharGrupoAvatar).toHaveBeenCalledTimes(1);
    expect(despacharGrupoAvatar.mock.calls[0][1]).toEqual({ grupoId: 'g-1', empresaId: 'emp-1' });
    // Brief resolvido 1×, antes do fan-out (os DISC não correm para criá-lo).
    expect(resolverOuCriarBrief).toHaveBeenCalledTimes(1);
    expect(r.videoGrupo).toEqual({ grupoId: 'g-1', via: 'grupo', erros: [] });
  });

  it('sem cargo não há grupo (o texto do avatar fala da rotina do cargo)', async () => {
    await gerarKitSemanal({ ...BASE, cargo: 'todos', discs: ['D', 'I'], sb: sbFake() });
    expect(prepararGrupoAvatar).not.toHaveBeenCalled();
    expect(chegaramAoMock()).toHaveLength(2);
    expect(chegaramAoMock().every((a) => a.avatarGrupo === null)).toBe(true);
  });

  it('sem vídeo no lote não há grupo', async () => {
    await gerarKitSemanal({ ...BASE, discs: ['D', 'I'], incluirVideo: false, sb: sbFake() });
    expect(prepararGrupoAvatar).not.toHaveBeenCalled();
    expect(despacharGrupoAvatar).not.toHaveBeenCalled();
  });

  it('grupo não nasceu (null): as células seguem o fluxo de hoje e nada é despachado', async () => {
    prepararGrupoAvatar.mockResolvedValueOnce(null as any);
    await gerarKitSemanal({ ...BASE, discs: ['D', 'I'], sb: sbFake() });
    expect(chegaramAoMock()).toHaveLength(2);
    expect(chegaramAoMock().every((a) => a.avatarGrupo === null)).toBe(true);
    expect(despacharGrupoAvatar).not.toHaveBeenCalled();
  });

  it('chamada da TELA (sem `sb`) ignora um `avatarGrupo` vindo do cliente', async () => {
    sbDaTela = sbFake();
    await gerarKit({ ...BASE, disc: 'D', avatarGrupo: { grupoId: 'g-forjado', textos: TEXTOS } });
    expect(dispararVideoDoKit.mock.calls[0][1].avatarGrupo).toBeNull();
  });
});
