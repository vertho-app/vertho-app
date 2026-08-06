import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PDF do perfil externo (OPQ32/Hogan) = PII pesada — relatório psicométrico
 * nominal. A action que gera a URL assinada vive num arquivo `'use server'`,
 * logo é um ENDPOINT HTTP e o `colabId` é escolhido pelo CLIENTE.
 *
 * Sessão válida não é autorização: o gate tem que provar POSSE (gestor do
 * liderado / tutor do tutorado / RH do tenant). Estes testes exercitam
 * exatamente esse ramo — e o de tenant, que o `.eq('empresa_id')` fecha.
 */

let sessao: any = null;

// colaboradores por (id, empresa_id) — espelha o filtro real da query
const COLABS: Record<string, any> = {
  'c1': { id: 'c1', empresa_id: 'emp-A', gestor_email: 'gestor@x.com', perfil_externo_pdf_path: 'emp-A/c1.pdf' },
  'c2': { id: 'c2', empresa_id: 'emp-A', gestor_email: 'outro@x.com', perfil_externo_pdf_path: 'emp-A/c2.pdf' },
  'c3': { id: 'c3', empresa_id: 'emp-B', gestor_email: 'gestor@x.com', perfil_externo_pdf_path: 'emp-B/c3.pdf' },
  'c4': { id: 'c4', empresa_id: 'emp-A', gestor_email: 'gestor@x.com', perfil_externo_pdf_path: null },
};

const signedUrlMock = vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));

function makeClient() {
  const from = (_tabela: string) => {
    const filtros: Record<string, any> = {};
    const b: any = {
      select: () => b,
      eq: (col: string, val: any) => { filtros[col] = val; return b; },
      in: () => b, not: () => b, or: () => b, order: () => b, limit: () => b,
      neq: () => b, is: () => b, ilike: () => b, update: () => b, insert: () => b,
      maybeSingle: async () => {
        const c = COLABS[filtros.id];
        // o .eq('empresa_id') é o que impede cruzar tenant
        if (!c || (filtros.empresa_id && c.empresa_id !== filtros.empresa_id)) {
          return { data: null, error: null };
        }
        return { data: c, error: null };
      },
      single: async () => ({ data: null, error: null }),
    };
    return b;
  };
  return {
    from,
    storage: { from: () => ({ createSignedUrl: (p: string) => signedUrlMock(p) }) },
  };
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => makeClient() }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, getUserContext: async () => sessao };
});

import { getPerfilExternoPdfUrl } from '@/app/dashboard/gestor/actions';

const gestor = {
  email: 'gestor@x.com', role: 'gestor', isPlatformAdmin: false,
  colaborador: { id: 'g1', email: 'gestor@x.com', empresa_id: 'emp-A' },
};
const rh = {
  email: 'rh@x.com', role: 'rh', isPlatformAdmin: false,
  colaborador: { id: 'rh1', email: 'rh@x.com', empresa_id: 'emp-A' },
};
const tutor = {
  email: 'tutor@x.com', role: 'tutor', isPlatformAdmin: false,
  colaborador: { id: 't1', email: 'tutor@x.com', empresa_id: 'emp-A', tutorados_ids: ['c2'] },
};
const colab = {
  email: 'colab@x.com', role: 'colaborador', isPlatformAdmin: false,
  colaborador: { id: 'c9', email: 'colab@x.com', empresa_id: 'emp-A' },
};

beforeEach(() => { sessao = null; signedUrlMock.mockClear(); });

describe('getPerfilExternoPdfUrl — gate de POSSE', () => {
  it('sem sessão → não autenticado, e nunca assina URL', async () => {
    const r = await getPerfilExternoPdfUrl('c1');
    expect(r.error).toMatch(/autenticado/i);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it('colaborador comum não passa nem do gate de papel', async () => {
    sessao = colab;
    const r = await getPerfilExternoPdfUrl('c1');
    expect(r.error).toMatch(/restrito/i);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it('gestor abre o PDF do PRÓPRIO liderado', async () => {
    sessao = gestor;
    const r = await getPerfilExternoPdfUrl('c1');
    expect(r.url).toBe('https://signed/emp-A/c1.pdf');
  });

  it('gestor NÃO abre o PDF de liderado de outro gestor', async () => {
    sessao = gestor;
    const r = await getPerfilExternoPdfUrl('c2');
    expect(r.url).toBeUndefined();
    expect(r.error).toMatch(/escopo/i);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it('gestor NÃO alcança colaborador de OUTRO tenant (mesmo sendo o gestor lá)', async () => {
    sessao = gestor;
    const r = await getPerfilExternoPdfUrl('c3');
    expect(r.url).toBeUndefined();
    expect(r.error).toMatch(/não encontrado/i);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it('tutor abre só de quem está em tutorados_ids', async () => {
    sessao = tutor;
    expect((await getPerfilExternoPdfUrl('c2')).url).toBe('https://signed/emp-A/c2.pdf');
    signedUrlMock.mockClear();
    const r = await getPerfilExternoPdfUrl('c1');
    expect(r.error).toMatch(/escopo/i);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it('RH alcança a empresa toda — mas só a dele', async () => {
    sessao = rh;
    expect((await getPerfilExternoPdfUrl('c2')).url).toBe('https://signed/emp-A/c2.pdf');
    expect((await getPerfilExternoPdfUrl('c3')).error).toMatch(/não encontrado/i);
  });

  it('sem PDF carregado → erro claro, sem assinar nada', async () => {
    sessao = gestor;
    const r = await getPerfilExternoPdfUrl('c4');
    expect(r.error).toMatch(/sem pdf/i);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it('colabId vazio é rejeitado antes de qualquer query', async () => {
    sessao = gestor;
    expect((await getPerfilExternoPdfUrl('')).error).toMatch(/inválido/i);
  });
});
