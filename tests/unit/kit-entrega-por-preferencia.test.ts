import { describe, it, expect } from 'vitest';
import { resolverKitDaSemana, precarregarKits, overlayKitNaSemana } from '@/lib/season-engine/kit/entrega-semana';

/**
 * Kit NOVO (marcado `desafio.por_preferencia`): a pessoa vê só os 2 primeiros formatos dela, e o vídeo só se for um deles.
 * Kit ANTERIOR (sem a marca) segue entregando tudo, como os pilotos em andamento já recebem. Os dois resolvedores (cache e
 * live) precisam carregar a marca, senão o filtro vale numa query e some na outra.
 */
const BRIEF = { id: 'b1', competencia: 'Planejamento', descritor: 'Gestão de riscos', cargo: 'Gestão Escolar', empresa_id: 'e1' };
const CONTEUDOS = [
  { id: 'c-texto', kit_id: 'k1', formato: 'texto', url: null, titulo: 'Texto' },
  { id: 'c-case', kit_id: 'k1', formato: 'case', url: null, titulo: 'Caso' },
  { id: 'c-audio', kit_id: 'k1', formato: 'audio', url: null, titulo: 'Podcast' },
];
const sbMock = (kitDesafio: any) => ({
  from: (nome: string) => {
    const rows = nome === 'kit_briefs' ? [BRIEF] : nome === 'kits' ? [{ id: 'k1', brief_id: 'b1', disc: 'S', desafio: kitDesafio }] : nome === 'micro_conteudos' ? CONTEUDOS : [];
    const q: any = { select: () => q, eq: () => q, or: () => q, is: () => q, in: () => q, order: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null }), single: async () => ({ data: rows[0] ?? null }),
      then: (res: any) => Promise.resolve({ data: rows }).then(res) };
    return q;
  },
});
const ARGS = { empresaId: 'e1', competencia: BRIEF.competencia, descritor: BRIEF.descritor, disc: 'S', cargo: BRIEF.cargo };
const NOVO = { desafio_texto: 'faça X', por_preferencia: true };
const ANTIGO = { desafio_texto: 'faça X' };

async function semana(desafio: any, formatosTop2: any, via: 'cache' | 'live') {
  const sb = sbMock(desafio) as any;
  const kitsCache = via === 'cache' ? await precarregarKits(sb, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo }) : undefined;
  const plano = { tipo: 'conteudo', semana: 1, descritor: BRIEF.descritor, conteudo: { formatos_disponiveis: {}, formato_core: 'texto' } };
  await overlayKitNaSemana(sb, plano, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo, formatoPref: 'audio', formatosTop2, competenciaFoco: BRIEF.competencia, kitsCache });
  return plano.conteudo as any;
}

describe('a marca por_preferencia chega pelos DOIS resolvedores', () => {
  it('resolverKitDaSemana (live) e precarregarKits (cache) carregam a marca; kit antigo não a tem', async () => {
    expect((await resolverKitDaSemana(sbMock(NOVO) as any, ARGS))!.desafio).toMatchObject({ por_preferencia: true });
    expect((await resolverKitDaSemana(sbMock(ANTIGO) as any, ARGS))!.desafio).not.toHaveProperty('por_preferencia');
    const cache = await precarregarKits(sbMock(NOVO) as any, { empresaId: 'e1', disc: 'S', cargo: BRIEF.cargo });
    expect([...cache.values()][0].desafio).toMatchObject({ por_preferencia: true });
  });
});

describe.each(['cache', 'live'] as const)('overlay do kit (%s)', (via) => {
  it('kit NOVO: só os 2 primeiros formatos da pessoa; o formato principal é o 1º dela', async () => {
    const c = await semana(NOVO, ['audio', 'texto'], via);
    expect(Object.keys(c.formatos_disponiveis).sort()).toEqual(['audio', 'texto']);
    expect(c.formato_core).toBe('audio');
    expect(c.core_id).toBe('c-audio');
    expect(c.video_permitido).toBe(false);
  });
  it('vídeo entre os 2 primeiros libera o vídeo para a pessoa', async () => {
    expect((await semana(NOVO, ['video', 'case'], via)).video_permitido).toBe(true);
  });
  it('kit ANTIGO segue entregando TODOS os formatos e não marca vídeo (pilotos em andamento não mudam)', async () => {
    const c = await semana(ANTIGO, ['texto', 'case'], via);
    expect(Object.keys(c.formatos_disponiveis).sort()).toEqual(['audio', 'case', 'texto']);
    expect(c).not.toHaveProperty('video_permitido');
  });
  it('kit novo SEM os 2 formatos dela: não deixa a tela vazia, mostra o que houver', async () => {
    const c = await semana(NOVO, ['video', 'video'] as any, via);
    expect(Object.keys(c.formatos_disponiveis).sort()).toEqual(['audio', 'case', 'texto']);
    expect(c.video_permitido).toBe(true);
  });
  it('sem formatosTop2 (health-check, caller antigo): não filtra', async () => {
    const c = await semana(NOVO, undefined, via);
    expect(Object.keys(c.formatos_disponiveis).sort()).toEqual(['audio', 'case', 'texto']);
  });
});
