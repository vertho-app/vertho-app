import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Células do Kit em lote com o avatar por grupo (`lib/video/celulas-lote.ts`, 30/09/2026).
 *
 * O script semanal disparava célula a célula e cada uma pagava o próprio avatar
 * (medido: 32 células em 13 combinações de módulo × cargo desde 01/08). Aqui:
 *   · um grupo por módulo × cargo, e só com cargo de verdade;
 *   · o despacho do grupo vem DEPOIS de as células dele entrarem no banco;
 *   · uma agenda só para células soltas e grupos (cada narração que começa é uma vaga),
 *     com o grupo pronto reservando uma vaga por irmã;
 *   · o plano que passaria do teto é recusado antes de qualquer disparo.
 * A agenda é a REAL (com relógio parado); o disparo e o grupo são simulados.
 */

const ordem: string[] = [];
const dispararVideoDoKit = vi.fn(async (_sb: any, a: any) => {
  if (a.kitId === 'k-falha') throw new Error('roteiro inválido');
  // A célula só "entra" depois do roteiro e do insert (latência): sem esta espera, o
  // teste de ordem não pegaria um despacho que deixasse de esperar as inserções.
  await new Promise((r) => setTimeout(r, 2));
  ordem.push(`insere-${a.disc}-${a.cargo}`);
  if (a.avatarGrupo) return { id: `v-${a.disc}`, status: 'processing', adiado: true };
  // Célula solta: o disparo real pede a vaga na agenda (ver `criarEDispararVideo`).
  const atraso = a.agendaDisparo?.proximoAtrasoS();
  return { id: `v-${a.disc}`, status: 'processing', atraso };
});
vi.mock('@/actions/gerar-video', () => ({ dispararVideoDoKit: (...a: any[]) => (dispararVideoDoKit as any)(...a) }));

let gruposPorCargo: Record<string, any> = {};
const prepararGrupoAvatar = vi.fn(async (_sb: any, p: any) => gruposPorCargo[`${p.moduloBaseId}::${p.cargo}`] ?? null);
const despacharGrupoAvatar = vi.fn(async (_sb: any, p: any) => { ordem.push(`despacho-${p.grupoId}`); return { via: 'grupo', erros: [] }; });
vi.mock('@/lib/video/avatar-grupo-core', () => ({
  prepararGrupoAvatar: (...a: any[]) => (prepararGrupoAvatar as any)(...a),
  despacharGrupoAvatar: (...a: any[]) => (despacharGrupoAvatar as any)(...a),
}));
const createAIBatchCollector = vi.fn(() => ({ run: vi.fn() }));
vi.mock('@/lib/ai-batch', () => ({ createAIBatchCollector: (...a: any[]) => (createAIBatchCollector as any)(...a) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'claude-opus-5') }));

import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { dispararCelulasDoKitEmLote, despacharGruposOrfaos, planoDeVagas } from '@/lib/video/celulas-lote';

const TEXTOS = { intro: { title: 't', subtitle: 's', narration: 'a' }, outro: { title: 't', subtitle: 's', narration: 'f?' } };
const grupo = (id: string, status = 'pendente') => ({ id, status, textos: TEXTOS });
const cel = (disc: string, cargo: string, moduloBaseId = 'm1') => ({ moduloBaseId, cargo, disc: disc as any, desafioTexto: `desafio ${disc}`, kitId: `k-${disc}-${cargo}` });
const RUN = vi.fn();
const BASE = { empresaId: 'emp-1', pppBrief: 'PPP', createdBy: 'kit:coorte', aiRunRoteiro: RUN as any, agora: () => 0 };
const argsDe = (disc: string, cargo: string) => dispararVideoDoKit.mock.calls.map((c: any[]) => c[1]).find((a) => a.disc === disc && a.cargo === cargo);

beforeEach(() => {
  ordem.length = 0;
  gruposPorCargo = {};
  dispararVideoDoKit.mockClear();
  prepararGrupoAvatar.mockClear();
  despacharGrupoAvatar.mockClear();
  createAIBatchCollector.mockClear();
});

describe('dispararCelulasDoKitEmLote', () => {
  it('um grupo por módulo × cargo: cargos diferentes no mesmo módulo não dividem avatar', async () => {
    gruposPorCargo = { 'm1::Professor(a)': grupo('g-prof'), 'm1::Diretor(a)': grupo('g-dir') };
    const r = await dispararCelulasDoKitEmLote({}, { ...BASE, grupo: true, celulas: [cel('D', 'Professor(a)'), cel('I', 'Professor(a)'), cel('S', 'Diretor(a)')] });

    expect(prepararGrupoAvatar).toHaveBeenCalledTimes(2);
    expect(argsDe('D', 'Professor(a)').avatarGrupo.grupoId).toBe('g-prof');
    expect(argsDe('I', 'Professor(a)').avatarGrupo.grupoId).toBe('g-prof');
    expect(argsDe('S', 'Diretor(a)').avatarGrupo.grupoId).toBe('g-dir');
    expect(r.grupos.map((g) => [g.grupoId, g.celulas]).sort()).toEqual([['g-dir', 1], ['g-prof', 2]]);
  });

  it.each([
    ['grupo desligado', false, 'Professor(a)'],
    ['cargo "todos"', true, 'todos'],
  ])('%s: nenhum grupo, e cada célula pede a sua vaga na MESMA agenda', async (_n, comGrupo, cargo) => {
    const r = await dispararCelulasDoKitEmLote({}, { ...BASE, grupo: comGrupo, celulas: [cel('D', cargo), cel('I', cargo), cel('S', cargo)] });
    expect(prepararGrupoAvatar).not.toHaveBeenCalled();
    expect(despacharGrupoAvatar).not.toHaveBeenCalled();
    expect(r.celulas.map((c: any) => c.atraso)).toEqual([0, 210, 420]);
    const agendas = dispararVideoDoKit.mock.calls.map((c: any[]) => c[1].agendaDisparo);
    expect(new Set(agendas).size).toBe(1);
    expect(dispararVideoDoKit.mock.calls.every((c: any[]) => c[1].aiRunRoteiro === RUN && c[1].avatarGrupo === null)).toBe(true);
  });

  it('o grupo só é despachado depois de as células dele entrarem, na vaga seguinte da agenda', async () => {
    gruposPorCargo = { 'm1::Professor(a)': grupo('g-1') };
    const r = await dispararCelulasDoKitEmLote({}, { ...BASE, grupo: true, celulas: [cel('D', 'todos'), cel('D', 'Professor(a)'), cel('I', 'Professor(a)')] });

    expect(ordem.indexOf('despacho-g-1')).toBeGreaterThan(ordem.indexOf('insere-D-Professor(a)'));
    expect(ordem.indexOf('despacho-g-1')).toBeGreaterThan(ordem.indexOf('insere-I-Professor(a)'));
    // A célula solta pegou a vaga 0; o grupo (a mãe) pega a de 210 s.
    expect(r.celulas[0]).toMatchObject({ atraso: 0 });
    expect(despacharGrupoAvatar.mock.calls[0][1]).toEqual({ grupoId: 'g-1', empresaId: 'emp-1', atrasoS: 210, intervaloS: 210 });
  });

  it('grupo PRONTO reserva uma vaga por irmã (elas saem direto do orquestrador)', async () => {
    gruposPorCargo = { 'm1::Professor(a)': grupo('g-pronto', 'pronto'), 'm2::Professor(a)': grupo('g-pend') };
    await dispararCelulasDoKitEmLote({}, { ...BASE, grupo: true, celulas: [cel('D', 'Professor(a)'), cel('I', 'Professor(a)'), cel('S', 'Professor(a)', 'm2')] });
    const atraso = (id: string) => despacharGrupoAvatar.mock.calls.map((c: any[]) => c[1]).find((p) => p.grupoId === id).atrasoS;
    // O pronto ocupa 0 e 210 (duas irmãs); o pendente vem depois, em 420.
    expect(atraso('g-pronto')).toBe(0);
    expect(atraso('g-pend')).toBe(420);
  });

  it('acima do teto, recusa ANTES de qualquer disparo e sem criar coletor; exatamente no teto, passa', async () => {
    // Teto de 5.400 s, intervalo de 60 s: cabem 91 vagas (a 1ª em 0, a última em 5.400).
    const muitas = (n: number) => Array.from({ length: n }, (_, i) => ({ ...cel('D', 'todos'), kitId: `k-${i}` }));
    const { aiRunRoteiro: _semColetor, ...semColetor } = BASE;
    await expect(dispararCelulasDoKitEmLote({}, { ...semColetor, grupo: false, intervaloS: 60, celulas: muitas(92) })).rejects.toThrow(/teto/);
    expect(dispararVideoDoKit).not.toHaveBeenCalled();
    expect(createAIBatchCollector).not.toHaveBeenCalled();
    await expect(dispararCelulasDoKitEmLote({}, { ...BASE, grupo: false, intervaloS: 60, celulas: muitas(91) })).resolves.toMatchObject({ vagas: 91 });
  });

  it('grupo que não nasceu (null): as células seguem soltas e nada é despachado', async () => {
    const r = await dispararCelulasDoKitEmLote({}, { ...BASE, grupo: true, celulas: [cel('D', 'Professor(a)'), cel('I', 'Professor(a)')] });
    expect(prepararGrupoAvatar).toHaveBeenCalledTimes(1);
    expect(despacharGrupoAvatar).not.toHaveBeenCalled();
    expect(r.vagas).toBe(2);
    expect(r.celulas.map((c: any) => c.atraso)).toEqual([0, 210]);
  });

  it('uma célula que falha não impede o despacho do grupo com as que entraram', async () => {
    gruposPorCargo = { 'm1::Professor(a)': grupo('g-1') };
    const r = await dispararCelulasDoKitEmLote({}, { ...BASE, grupo: true, celulas: [cel('D', 'Professor(a)'), { ...cel('I', 'Professor(a)'), kitId: 'k-falha' }] });
    expect(r.celulas.find((c: any) => c.error)?.error).toMatch(/roteiro inválido/);
    expect(despacharGrupoAvatar).toHaveBeenCalledTimes(1);
    expect(r.grupos[0]).toMatchObject({ grupoId: 'g-1', celulas: 1, via: 'grupo' });
  });
});

describe('planoDeVagas', () => {
  const cs = [cel('D', 'Professor(a)'), cel('I', 'Professor(a)'), cel('S', 'Professor(a)'), cel('C', 'todos')];
  it.each([
    ['sem grupo', null, 4],
    ['grupo pendente: 1 (a mãe) + a solta', new Map([['m1::Professor(a)', { status: 'pendente' }]]), 2],
    ['grupo pronto: uma por irmã + a solta', new Map([['m1::Professor(a)', { status: 'pronto' }]]), 4],
    ['grupo que não nasceu conta cada célula', new Map([['m1::Professor(a)', null]]), 4],
  ])('%s', (_n, grupos, esperado) => {
    expect(planoDeVagas(cs, grupos as any)).toBe(esperado);
  });
});

describe('despacharGruposOrfaos', () => {
  it('despacha cada grupo com célula esperando, uma vez, espaçados, só do tenant', async () => {
    const sb = criarSupabaseMock({ lista: (t) => (t === 'videos_gerados' ? [{ avatar_grupo_id: 'g-1' }, { avatar_grupo_id: 'g-1' }, { avatar_grupo_id: 'g-2' }] : []) });
    const r = await despacharGruposOrfaos(sb.client, { empresaId: 'emp-1', agora: () => 0 });
    expect(r.grupos).toEqual(['g-1', 'g-2']);
    expect(despacharGrupoAvatar.mock.calls.map((c: any[]) => [c[1].grupoId, c[1].atrasoS])).toEqual([['g-1', 0], ['g-2', 210]]);
    const filtros = sb.chamadas.filter((c) => c.tabela === 'videos_gerados' && c.metodo === 'eq').map((c) => c.args);
    expect(filtros).toContainEqual(['empresa_id', 'emp-1']);
    expect(filtros).toContainEqual(['etapa', 'aguardando_avatar']);
  });

  it('leitura falha: lança (não finge que não há órfãs)', async () => {
    const sb = criarSupabaseMock();
    sb.falharEm({ tabela: 'videos_gerados', op: 'select', mensagem: 'timeout' });
    await expect(despacharGruposOrfaos(sb.client, { empresaId: 'emp-1' })).rejects.toThrow(/timeout/);
  });
});
