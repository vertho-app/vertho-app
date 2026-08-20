// `importarVideosBunny` — o que PODE virar acervo.
//
// 🔴 O INVARIANTE DESTE ARQUIVO: **vídeo que a plataforma gerou não entra no
// banco de micro-conteúdos, e nada entra sem empresa.**
//
// Por que ele existe (19/08/2026): a library do Bunny é COMPARTILHADA entre
// tenants e é onde vivem os vídeos nominais — 1.076 `videos_personalizados`
// prontos (macae 557, ibipeba 512) e 144 decks, contra 6 pré-produzidos no
// acervo inteiro. O import pede os 200 mais recentes POR DATA, ou seja: hoje
// traz praticamente só personalizados. Sem esta guarda, um clique inseria
// centenas de vídeos com o nome de uma pessoa como conteúdo GLOBAL
// (`empresa_id` nulo), `ativo: true`, `cargo: 'todos'`, `nivel 1..4` — visíveis
// no acervo de todos os clientes e elegíveis para o motor servir a qualquer um.
//
// O sintoma seria mudo: nada falha, e o vídeo do colaborador de um cliente
// aparece na trilha de outro.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const GUID_PERSONALIZADO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const GUID_DECK = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const GUID_PRE_PRODUZIDO = 'cccccccc-3333-4333-8333-cccccccccccc';
const EMPRESA = '11111111-2222-4333-8444-555555555555';

const sb = criarSupabaseMock({
  resolver: (tabela: string) => (tabela === 'empresas' ? { id: EMPRESA } : null),
  lista: (tabela: string) => {
    if (tabela === 'videos_personalizados') return [{ bunny_video_id: GUID_PERSONALIZADO }];
    if (tabela === 'videos_gerados') return [{ bunny_video_id: GUID_DECK }];
    return []; // micro_conteudos: nada importado ainda
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));

/** A library devolve os três: dois da plataforma, um pré-produzido de verdade. */
const RESPOSTA_BUNNY = {
  items: [
    { guid: GUID_PERSONALIZADO, title: 'Maria · 9f2c-cell', length: 90 },
    { guid: GUID_DECK, title: 'deck-macae-diretor-D', length: 120 },
    { guid: GUID_PRE_PRODUZIDO, title: 'Vazamento Bilionário em T&D.mp4', length: 300 },
  ],
};

beforeEach(() => {
  sb.reset();
  process.env.BUNNY_LIBRARY_ID = '123';
  process.env.BUNNY_STREAM_API_KEY = 'chave';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => RESPOSTA_BUNNY })) as any);
});

const { importarVideosBunny } = await import('@/actions/conteudos');

/** As linhas que o insert em `micro_conteudos` recebeu (achatadas). */
function inseridos(): any[] {
  return sb.escritas
    .filter((e) => e.tabela === 'micro_conteudos' && e.op === 'insert')
    .flatMap((e) => (Array.isArray(e.payload) ? e.payload : [e.payload]));
}

describe('🔴 vídeo NOMINAL da plataforma nunca vira acervo', () => {
  it('personalizado e deck são ignorados; o pré-produzido entra', async () => {
    const r: any = await importarVideosBunny(EMPRESA);
    expect(r.ok).toBe(true);

    const guids = inseridos().map((l) => l.bunny_video_id);
    expect(guids).toEqual([GUID_PRE_PRODUZIDO]);
    expect(guids).not.toContain(GUID_PERSONALIZADO);
    expect(guids).not.toContain(GUID_DECK);
  });

  it('conta quantos foram recusados — zero calado parece falha de integração', async () => {
    const r: any = await importarVideosBunny(EMPRESA);
    expect(r.nominaisIgnorados).toBe(2);
  });

  it('🔴 falha ao LER os personalizados aborta — lista vazia liberaria tudo', async () => {
    // Sem este check, um erro de leitura devolveria `data: null`, o conjunto de
    // GUIDs da plataforma nasceria vazio e a guarda deixaria passar exatamente
    // o que ela existe para barrar.
    sb.falharEm({ tabela: 'videos_personalizados', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await importarVideosBunny(EMPRESA);
    expect(r.error).toMatch(/personalizados/i);
    expect(inseridos()).toHaveLength(0);
  });
});

describe('🔴 escopo: nada entra como global', () => {
  it('sem empresa, recusa e NÃO grava', async () => {
    const r: any = await importarVideosBunny(undefined);
    expect(r.error).toMatch(/empresa/i);
    expect(sb.escritas).toHaveLength(0);
  });

  it('"all" (visão de todas as empresas) também recusa', async () => {
    const r: any = await importarVideosBunny('all');
    expect(r.error).toMatch(/empresa/i);
    expect(sb.escritas).toHaveLength(0);
  });

  it('o que entra carrega a empresa do filtro', async () => {
    await importarVideosBunny(EMPRESA);
    expect(inseridos()[0].empresa_id).toBe(EMPRESA);
  });

  it('e entra DESLIGADO — sem competência, o motor não deve poder escolher', async () => {
    await importarVideosBunny(EMPRESA);
    expect(inseridos()[0].ativo).toBe(false);
    expect(inseridos()[0].competencia).toBe('Não classificado');
  });
});
