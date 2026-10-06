/**
 * Reanálise de segurança de 05/10/2026, item 4: as actions da Knowledge Base (`/admin/vertho/knowledge-base`)
 * eram gateadas por PAPEL: `isPlatformAdmin || (role === 'rh' && empresaId === id)`. O R-73 (02/10) tirou
 * `knowledge_base.manage` do RH porque nenhuma tela dele usa a base, mas as actions seguiram abertas ao RH
 * da empresa pelo action id (e ao Admin Sócio, que é `isPlatformAdmin` e não tem escrita). Cada uma, aberta,
 * deixava gravar, subir arquivo e semear o RAG que alimenta o Tira-Dúvidas e os relatórios.
 *
 * Agora: LER pede `admin.access` (o RH não tem, o sócio tem); ESCREVER pede `knowledge_base.manage` (só o admin
 * master); e o tenant continua conferido. As permissões são as REAIS (`canBase`), então o teste acompanha a
 * matriz de papéis de `lib/permissions`.
 *
 * Validado por mutação: voltar a leitura ou a escrita ao gate por papel reprova um teste.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sessao: null as any,
  extras: [] as string[],            // permissões concedidas por override (para o cenário "RH ganhou a chave")
  empresaDoDoc: 'emp-A',
  tabelas: [] as string[],
  escritas: [] as string[],
  ingestDoc: vi.fn(async (..._a: any[]) => 'doc-1'),
  deactivateDoc: vi.fn(async (..._a: any[]) => {}),
  listDocs: vi.fn(async (..._a: any[]) => [{ id: 'd1' }]),
  seed: vi.fn(async (..._a: any[]) => ({ criados: 1, pulados: 0 })),
  parse: vi.fn(async (..._a: any[]) => [{ titulo: 'Seção', conteudo: 'texto' }]),
}));

function cliente() {
  return {
    from: (tabela: string) => {
      h.tabelas.push(tabela);
      const q: any = {
        select: () => q, eq: () => q, neq: () => q, ilike: () => q, limit: () => q, order: () => q,
        update: () => { h.escritas.push(`update:${tabela}`); return q; },
        maybeSingle: async () => ({ data: { id: 'd1', empresa_id: h.empresaDoDoc, titulo: 't', conteudo: 'c' }, error: null }),
        then: (res: any) => res({ data: [], error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => cliente() }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/lib/permissions', async (orig) => {
  const m = await orig<typeof import('@/lib/permissions')>();
  return { ...m, can: async (ctx: any, p: string) => m.canBase(ctx, p as any) || h.extras.includes(p) };
});
vi.mock('@/lib/auth/action-context', async (orig) => {
  const real = await orig<typeof import('@/lib/auth/action-context')>().catch(() => ({} as any));
  const { can } = await import('@/lib/permissions');
  const usuario = async () => {
    if (!h.sessao) throw new Error('UNAUTHORIZED: usuário não autenticado');
    return h.sessao;
  };
  return {
    ...real,
    getAuthenticatedEmailFromAction: async () => h.sessao?.email || null,
    requireUserAction: usuario,
    requireAdminAction: async () => {
      const c = await usuario();
      if (!c.isPlatformAdmin) throw new Error('FORBIDDEN: apenas platform admin');
      return c;
    },
    requirePermissionAction: async (perm: string) => {
      const c = await usuario();
      if (!(await can(c, perm as any))) throw new Error(`FORBIDDEN: permissão necessária ${perm}`);
      return c;
    },
    assertTenantAccessAction: async (c: any, empresaId: string | null | undefined) => {
      if (!empresaId) throw new Error('BAD_REQUEST: empresaId obrigatório');
      if (c.isPlatformAdmin) return;
      if (c.empresaId !== empresaId) throw new Error('FORBIDDEN: sem acesso a esta empresa');
    },
  };
});
vi.mock('@/lib/rag', () => ({
  ingestDoc: (...a: any[]) => h.ingestDoc(...a),
  deactivateDoc: (...a: any[]) => h.deactivateDoc(...a),
  listDocs: (...a: any[]) => h.listDocs(...a),
}));
vi.mock('@/lib/rag-ingest', () => ({ parseAndChunk: (...a: any[]) => h.parse(...a) }));
vi.mock('@/lib/rag-seed', () => ({ seedKnowledgeBase: (...a: any[]) => h.seed(...a) }));

import {
  listarDocsKB, carregarDocKB, criarDocKB, atualizarDocKB, desativarDocKB, uploadDocsArquivo, seedKB, testarBuscaKB,
} from '@/app/admin/vertho/knowledge-base/actions';

const RH_A = { email: 'rh@a.com', role: 'rh', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'rh-1' } };
const COLAB_A = { email: 'ana@a.com', role: 'colaborador', empresaId: 'emp-A', isPlatformAdmin: false, colaborador: { id: 'c-1' } };
const SOCIO = { email: 'socio@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'socio', colaborador: null };
const MASTER = { email: 'master@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true, platformAdminRole: 'master', colaborador: null };

const formulario = (empresaId: string) => {
  const fd = new FormData();
  fd.set('empresaId', empresaId);
  fd.set('file', new File(['conteúdo'], 'politica.txt', { type: 'text/plain' }));
  return fd;
};

const LEITURAS: Array<[string, (e?: string) => Promise<any>]> = [
  ['listarDocsKB', (e = 'emp-A') => listarDocsKB(e)],
  ['carregarDocKB', (e = 'emp-A') => carregarDocKB(e, 'd1')],
  ['testarBuscaKB', (e = 'emp-A') => testarBuscaKB(e, 'política')],
];
const ESCRITAS: Array<[string, (e?: string) => Promise<any>]> = [
  ['criarDocKB', (e = 'emp-A') => criarDocKB({ empresaId: e, titulo: 'Título', conteudo: 'Conteúdo' })],
  ['atualizarDocKB', () => atualizarDocKB('d1', { titulo: 'Novo' })],
  ['desativarDocKB', (e = 'emp-A') => desativarDocKB(e, 'd1')],
  ['uploadDocsArquivo', (e = 'emp-A') => uploadDocsArquivo(formulario(e))],
  ['seedKB', (e = 'emp-A') => seedKB(e)],
];

const nadaFoiEscrito = () => {
  expect(h.ingestDoc).not.toHaveBeenCalled();
  expect(h.deactivateDoc).not.toHaveBeenCalled();
  expect(h.seed).not.toHaveBeenCalled();
  expect(h.escritas).toEqual([]);
};

beforeEach(() => {
  h.sessao = null; h.extras = []; h.empresaDoDoc = 'emp-A'; h.tabelas = []; h.escritas = [];
  for (const f of [h.ingestDoc, h.deactivateDoc, h.listDocs, h.seed, h.parse]) f.mockClear();
});

describe('o RH da empresa não opera a Knowledge Base por action id', () => {
  beforeEach(() => { h.sessao = RH_A; });

  it.each([...LEITURAS, ...ESCRITAS])('🔴 %s: recusado, na empresa dele', async (_n, chamar) => {
    expect(await chamar()).toEqual({ error: 'Acesso restrito' });
    nadaFoiEscrito();
  });

  it('atualizarDocKB recusa pela permissão ANTES de ler o banco (não vira oráculo de id)', async () => {
    await atualizarDocKB('d1', { titulo: 'x' });
    expect(h.tabelas).toEqual([]);
  });
});

describe('colaborador comum também não', () => {
  beforeEach(() => { h.sessao = COLAB_A; });
  it.each([...LEITURAS, ...ESCRITAS])('%s: recusado', async (_n, chamar) => {
    expect(await chamar()).toEqual({ error: 'Acesso restrito' });
    nadaFoiEscrito();
  });
});

describe('Admin Sócio: lê, não escreve', () => {
  beforeEach(() => { h.sessao = SOCIO; });

  it.each(LEITURAS)('%s funciona', async (_n, chamar) => {
    const r = await chamar();
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it.each(ESCRITAS)('🔴 %s: recusado (o sócio é isPlatformAdmin, mas não tem escrita)', async (_n, chamar) => {
    expect(await chamar()).toEqual({ error: 'Acesso restrito' });
    nadaFoiEscrito();
  });
});

describe('admin master: tudo continua funcionando', () => {
  beforeEach(() => { h.sessao = MASTER; });

  it.each(LEITURAS)('%s funciona', async (_n, chamar) => {
    expect((await chamar()).ok).toBe(true);
  });

  it('criar, desativar, subir arquivo, semear e atualizar chegam ao destino', async () => {
    expect((await criarDocKB({ empresaId: 'emp-B', titulo: 'T', conteudo: 'C' })).ok).toBe(true);
    expect(h.ingestDoc).toHaveBeenCalledTimes(1);
    expect((await desativarDocKB('emp-B', 'd1')).ok).toBe(true);
    expect(h.deactivateDoc).toHaveBeenCalledWith('emp-B', 'd1');
    expect((await uploadDocsArquivo(formulario('emp-B'))).ok).toBe(true);
    expect(h.ingestDoc).toHaveBeenCalledTimes(2);
    expect((await seedKB('emp-B')).ok).toBe(true);
    h.empresaDoDoc = 'emp-B';
    expect((await atualizarDocKB('d1', { titulo: 'Novo' })).ok).toBe(true);
    expect(h.escritas).toEqual(['update:knowledge_base']);
  });

  it('empresa vazia é erro de validação, não gravação', async () => {
    expect(await criarDocKB({ empresaId: '', titulo: 'T', conteudo: 'C' })).toEqual({ error: 'empresaId+titulo+conteudo obrigatórios' });
    expect(h.ingestDoc).not.toHaveBeenCalled();
  });
});

describe('o dia em que o RH ganhar a chave por override: o tenant continua valendo', () => {
  beforeEach(() => { h.sessao = RH_A; h.extras = ['knowledge_base.manage', 'admin.access']; });

  it('na empresa dele passa; em outra, não', async () => {
    expect((await criarDocKB({ empresaId: 'emp-A', titulo: 'T', conteudo: 'C' })).ok).toBe(true);
    expect(await criarDocKB({ empresaId: 'emp-B', titulo: 'T', conteudo: 'C' })).toEqual({ error: 'Acesso restrito' });
    expect(h.ingestDoc).toHaveBeenCalledTimes(1);
  });

  it('atualizar documento de outra empresa (o tenant vem da LINHA) é recusado', async () => {
    h.empresaDoDoc = 'emp-B';
    expect(await atualizarDocKB('d1', { titulo: 'x' })).toEqual({ error: 'Acesso restrito' });
    expect(h.escritas).toEqual([]);
  });
});

describe('quem não está logado segue recebendo o erro de autenticação (não vira "Acesso restrito")', () => {
  it.each([...LEITURAS, ...ESCRITAS])('%s', async (_n, chamar) => {
    await expect(chamar()).rejects.toThrow(/UNAUTHORIZED/);
  });
});
