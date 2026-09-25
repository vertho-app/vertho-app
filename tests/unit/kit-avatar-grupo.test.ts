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

const dispararVideoDoKit = vi.fn(async (_sb: any, a: any) => ({ id: `v-${a.disc}`, status: 'processing', ...(a.avatarGrupo ? { adiado: true } : {}) }));
vi.mock('@/actions/gerar-video', () => ({ dispararVideoDoKit: (...a: any[]) => (dispararVideoDoKit as any)(...a) }));

const ordem: string[] = [];
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
 * ⚠️ LIMITE DO INSTRUMENTO, medido aqui (25/09/2026, com log dentro do `kits.ts`):
 * `gerarKit` importa `@/actions/gerar-video` DINAMICAMENTE, e no lote os 4 DISC fazem
 * esse import em paralelo. O vitest entrega o MOCK só ao primeiro deles; os outros três
 * recebem o módulo REAL, mesmo com o módulo já aquecido. Em produção não há mock, então
 * não há o que corrigir no código. Consequência para este arquivo: no caminho de LOTE só
 * a 1ª célula chega ao mock (e é ela que exercita a linha do lote); o caminho
 * SEQUENCIAL confere as 4. Sem esta nota, "4 chamadas" no lote pareceria bug do Kit.
 */
const chegaramAoMock = () => dispararVideoDoKit.mock.calls.map((c: any[]) => c[1]);

beforeEach(() => {
  vi.unstubAllEnvs();
  ordem.length = 0;
  dispararVideoDoKit.mockClear();
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
    expect(chegaramAoMock().length).toBe(useBatch ? 1 : 4);
    expect(chegaramAoMock().every((a) => a.avatarGrupo === null)).toBe(true);
    // Sem o grupo, o sequencial resolve o brief por DISC, como sempre (o 1º cria, os
    // outros reusam); só com o grupo ele sai antes do fan-out.
    expect(resolverOuCriarBrief).toHaveBeenCalledTimes(useBatch ? 1 : 4);
    expect(r).not.toHaveProperty('videoGrupo');
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
    expect(chegaramAoMock().map((a) => a.avatarGrupo)).toEqual(Array(useBatch ? 1 : 4).fill({ grupoId: 'g-1', textos: TEXTOS }));
    // O grupo nasce antes do 1º desafio (o fan-out), não no meio dele.
    expect(ordem.indexOf('grupo')).toBeLessThan(ordem.findIndex((o) => o.startsWith('desafio-')));
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
