/**
 * Reanálise de segurança de 05/10/2026, item 4: duas rotas de API seguiam gateadas por PAPEL depois que o
 * R-73 tirou a permissão correspondente do RH.
 *
 *  · `POST /api/upload/signed-url` assinava upload no bucket PÚBLICO `conteudos` para qualquer RH
 *    (sem limite de tipo nem de tamanho). O fluxo inteiro de upload de conteúdo exige `content.manage`.
 *  · `GET /api/cenarios` devolvia, a qualquer pessoa do tenant, as `alternativas` do banco de cenários
 *    (o gabarito da avaliação de todos os cargos). Passou a exigir RH ou plataforma.
 *
 * O teste usa a autenticação REAL (`lib/auth/request-context`: Bearer → e-mail → contexto) e as permissões
 * REAIS (`canBase`); só o banco e o limitador são simulados. Validado por mutação (voltar o gate ao papel
 * antigo reprova).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  contextos: {} as Record<string, any>,
  assinou: [] as string[],
  leituras: [] as Array<{ tabela: string; filtros: Array<[string, any]> }>,
  cenarios: [{ id: 'c1', empresa_id: 'emp-A', cargo: 'Professor', alternativas: ['gabarito'], competencia: { nome: 'Comp', cod_comp: 'C1' }, ppp_escola_id: null }],
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    auth: {
      getUser: async (token: string) => {
        const ctx = h.contextos[token];
        return ctx ? { data: { user: { email: ctx.email } }, error: null } : { data: { user: null }, error: { message: 'jwt inválido' } };
      },
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          h.assinou.push(path);
          return { data: { signedUrl: `https://storage/${path}`, token: 't', path }, error: null };
        },
      }),
    },
    from: (tabela: string) => {
      const leitura = { tabela, filtros: [] as Array<[string, any]> };
      h.leituras.push(leitura);
      const q: any = {
        select: () => q,
        eq: (c: string, v: any) => { leitura.filtros.push([c, v]); return q; },
        order: () => q,
        then: (res: any) => res({ data: h.cenarios, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/authz', () => ({
  getUserContext: async (email: string) => Object.values(h.contextos).find((c: any) => c.email === email) || null,
  canViewColabJourney: async () => false,
}));
vi.mock('@/lib/permissions', async (orig) => {
  const m = await orig<typeof import('@/lib/permissions')>();
  return { ...m, can: async (ctx: any, p: string) => m.canBase(ctx, p as any) };
});
vi.mock('@/lib/rate-limit', () => ({ heavyLimiter: { check: async () => null } }));

import { POST as assinarUpload } from '@/app/api/upload/signed-url/route';
import { GET as listarCenarios } from '@/app/api/cenarios/route';

h.contextos = {
  'tk-rh': { email: 'rh@a.com', role: 'rh', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'rh-1', empresa_id: 'emp-A' } },
  'tk-colab': { email: 'ana@a.com', role: 'colaborador', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'c-1', empresa_id: 'emp-A' } },
  'tk-gestor': { email: 'gestor@a.com', role: 'gestor', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'g-1', empresa_id: 'emp-A' } },
  'tk-socio': { email: 'socio@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'socio', colaborador: null },
  'tk-master': { email: 'master@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master', colaborador: null },
};

const upload = (token: string | null, corpo: any = { formato: 'pdf', filename: 'a.pdf' }) =>
  new Request('https://app.vertho.ai/api/upload/signed-url', {
    method: 'POST',
    // Sem Bearer a rota cai no CSRF por Origin (cookie), então "sem login" precisa de uma Origin confiável
    // para chegar à autenticação, que é o que o caso quer provar.
    headers: { 'content-type': 'application/json', origin: 'https://app.vertho.ai', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });

const cenarios = (token: string | null, empresa: string | null = 'emp-A') =>
  new Request(`https://app.vertho.ai/api/cenarios${empresa ? `?empresa=${empresa}` : ''}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as any;

beforeEach(() => { h.assinou = []; h.leituras = []; });

describe('POST /api/upload/signed-url pede content.manage', () => {
  it.each([['RH', 'tk-rh'], ['colaborador', 'tk-colab'], ['gestor', 'tk-gestor'], ['Admin Sócio', 'tk-socio']])(
    '🔴 %s: 403 e nada é assinado', async (_n, token) => {
      const res = await assinarUpload(upload(token));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/content\.manage/);
      expect(h.assinou).toEqual([]);
    },
  );

  it('sem login: 401', async () => {
    const res = await assinarUpload(upload(null));
    expect(res.status).toBe(401);
    expect(h.assinou).toEqual([]);
  });

  it('admin master: assina, e o caminho vai sob o formato permitido', async () => {
    const res = await assinarUpload(upload('tk-master'));
    expect(res.status).toBe(200);
    expect(h.assinou).toHaveLength(1);
    expect(h.assinou[0]).toMatch(/^pdf\/global\/\d+-a\.pdf$/);
  });

  it('formato fora da lista continua barrado para quem tem a permissão', async () => {
    const res = await assinarUpload(upload('tk-master', { formato: '../x', filename: 'a.pdf' }));
    expect(res.status).toBe(400);
    expect(h.assinou).toEqual([]);
  });
});

describe('GET /api/cenarios: RH ou plataforma, nunca o colaborador', () => {
  it.each([['colaborador', 'tk-colab'], ['gestor', 'tk-gestor']])(
    '🔴 %s da própria empresa: 403 e o banco não é lido', async (_n, token) => {
      const res = await listarCenarios(cenarios(token));
      expect(res.status).toBe(403);
      expect(h.leituras).toEqual([]);
    },
  );

  it('sem login: 401', async () => {
    expect((await listarCenarios(cenarios(null))).status).toBe(401);
    expect(h.leituras).toEqual([]);
  });

  it('RH da empresa: lê os cenários dela, filtrados pela empresa', async () => {
    const res = await listarCenarios(cenarios('tk-rh'));
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo).toHaveLength(1);
    expect(corpo[0].competencia_nome).toBe('Comp');
    expect(h.leituras[0].filtros).toContainEqual(['empresa_id', 'emp-A']);
  });

  it('o tenant continua conferido: RH de uma empresa não lê a outra', async () => {
    const res = await listarCenarios(cenarios('tk-rh', 'emp-B'));
    expect(res.status).toBe(403);
    expect(h.leituras).toEqual([]);
  });

  it('plataforma (sócio e master) lê qualquer empresa', async () => {
    for (const t of ['tk-socio', 'tk-master']) {
      h.leituras = [];
      expect((await listarCenarios(cenarios(t, 'emp-B'))).status).toBe(200);
      expect(h.leituras[0].filtros).toContainEqual(['empresa_id', 'emp-B']);
    }
  });

  it('sem o parâmetro da empresa: 400', async () => {
    expect((await listarCenarios(cenarios('tk-rh', null))).status).toBe(400);
  });
});
