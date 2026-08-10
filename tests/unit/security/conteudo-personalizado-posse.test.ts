import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F9 da auditoria de 09-10/08/2026.
 *
 * `gerarConteudoFinalPersonalizado` e `prepararAudioPersonalizado` vivem num
 * arquivo `'use server'` — logo são ENDPOINTS HTTP, e o objeto `colab` chegava
 * pela rede. Dois furos empilhados:
 *
 *   1. o conteúdo era buscado por id SEM filtro de tenant, então um autenticado
 *      de qualquer empresa recebia o PDF de outra com o `conteudo_inline` alheio
 *      renderizado — e 2 chamadas de IA pagas no caminho;
 *   2. passar `colab` PULAVA a identidade da sessão. O comentário no próprio
 *      arquivo admitia: "a identidade vem da SESSÃO (sem IDOR) — EXCETO quando
 *      `colab` é passado explicitamente".
 *
 * Corrigir só a rota `/api/conteudo/[id]/pdf` não bastaria: o bypass é a action.
 *
 * A régua usada é a da rota GÊMEA do podcast, que já estava certa — conteúdo
 * global OU do próprio tenant, `colab` autorizado por `assertColabAccess`. Este
 * teste usa o `assertColabAccess` REAL de propósito: duas réguas para a mesma
 * pergunta é exatamente como nasce a divergência do F4.
 */

let sessao: any = null;

const CONTEUDOS: Record<string, any> = {
  'k-A':      { id: 'k-A',      empresa_id: 'emp-A', formato: 'texto', conteudo_inline: 'x'.repeat(50), url: 'https://gen/A.pdf' },
  'k-B':      { id: 'k-B',      empresa_id: 'emp-B', formato: 'texto', conteudo_inline: 'y'.repeat(50), url: 'https://gen/B.pdf' },
  'k-global': { id: 'k-global', empresa_id: null,    formato: 'texto', conteudo_inline: '',             url: 'https://gen/G.pdf' },
  'a-A':      { id: 'a-A',      empresa_id: 'emp-A', formato: 'audio', conteudo_inline: 'Narração: '.padEnd(80, 'z'), url: 'https://gen/A.mp3' },
  'a-B':      { id: 'a-B',      empresa_id: 'emp-B', formato: 'audio', conteudo_inline: 'Narração: '.padEnd(80, 'z'), url: 'https://gen/B.mp3' },
};

const COLABS: Record<string, any> = {
  c1: { id: 'c1', empresa_id: 'emp-A', area_depto: 'Ensino', nome_completo: 'Ana do Banco' },
  c3: { id: 'c3', empresa_id: 'emp-B', area_depto: 'Ensino', nome_completo: 'Bruno de Outro Tenant' },
};

// `vi.mock` é içado acima das const, e estas são avaliadas DENTRO das factories
// (não só chamadas depois) — sem `vi.hoisted` o módulo falha ao mockar.
const { uploadMock, ttsMock, iaMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async () => ({ error: null })),
  ttsMock: vi.fn(async (_narracao: string, _nome: string) => ({ buffer: Buffer.from('mp3'), contentType: 'audio/mpeg' })),
  iaMock: vi.fn(async () => ''),
}));

function makeClient() {
  const from = (tabela: string) => {
    const filtros: Record<string, any> = {};
    const b: any = {
      select: () => b,
      eq: (col: string, val: any) => { filtros[col] = val; return b; },
      in: () => b, not: () => b, or: () => b, order: () => b, limit: () => b,
      neq: () => b, is: () => b, ilike: () => b, update: () => b, insert: () => b,
      maybeSingle: async () => {
        const fonte = tabela === 'micro_conteudos' ? CONTEUDOS
          : tabela === 'colaboradores' ? COLABS
          : {} as Record<string, any>;
        const row = fonte[filtros.id];
        if (!row) return { data: null, error: null };
        if (filtros.empresa_id && row.empresa_id !== filtros.empresa_id) return { data: null, error: null };
        return { data: row, error: null };
      },
      single: async () => ({ data: null, error: null }),
    };
    return b;
  };
  return {
    from,
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: { message: 'sem cache' } }),
        upload: uploadMock,
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cache/${p}` } }),
      }),
    },
  };
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => makeClient() }));
vi.mock('@/actions/ai-client', () => ({ callAI: iaMock }));
vi.mock('@/lib/gemini-tts', () => ({
  extractNarration: (t: string) => t,
  generatePersonalizedPodcastAudio: ttsMock,
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED: usuário não autenticado');
    return sessao;
  },
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, findColabByEmail: async () => COLABS.c1 };
});

import { gerarConteudoFinalPersonalizado, prepararAudioPersonalizado } from '@/actions/conteudos';

const colabA = { email: 'ana@a.com', role: 'colaborador', isPlatformAdmin: false, empresaId: 'emp-A', colaborador: COLABS.c1 };
const rhA = { email: 'rh@a.com', role: 'rh', isPlatformAdmin: false, empresaId: 'emp-A', colaborador: { id: 'rh1', empresa_id: 'emp-A' } };
const admin = { email: 'adm@vertho.ai', role: 'admin', isPlatformAdmin: true, empresaId: null, colaborador: null };

beforeEach(() => { sessao = null; uploadMock.mockClear(); ttsMock.mockClear(); iaMock.mockClear(); });

describe('gerarConteudoFinalPersonalizado — posse do CONTEÚDO e do COLABORADOR', () => {
  it('sem sessão não entrega nem o PDF genérico, e não chama IA', async () => {
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-A' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/autenticado/i);
    expect(r.url).toBeFalsy();
    expect(iaMock).not.toHaveBeenCalled();
  });

  it('autenticado do tenant A NÃO alcança conteúdo do tenant B (o achado)', async () => {
    sessao = colabA;
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-B' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sem acesso a este conteúdo/i);
    expect(r.url).toBeFalsy();
    expect(iaMock).not.toHaveBeenCalled();
  });

  it('conteúdo GLOBAL (empresa_id nulo) continua acessível — 30 dos 491 são assim', async () => {
    sessao = colabA;
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-global' });
    expect(r.success).toBe(true);
    expect(r.url).toBe('https://gen/G.pdf');
  });

  it('platform admin alcança qualquer tenant', async () => {
    sessao = admin;
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-B' });
    // barrado devolveria url falsy; aqui o conteúdo do tenant B é alcançado
    expect(r.success).toBe(true);
    expect(r.url).toBe('https://gen/B.pdf');
  });

  it('`colab` do caller é AUTORIZADO: colaborador comum não gera para outra pessoa', async () => {
    sessao = colabA;
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-A', colab: COLABS.c3 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sem acesso a este colaborador/i);
    expect(iaMock).not.toHaveBeenCalled();
  });

  it('RH gera para gente do PRÓPRIO tenant (o caminho de pré-geração em lote segue vivo)', async () => {
    sessao = rhA;
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-A', colab: COLABS.c1 });
    expect(r.success).toBe(true);
    expect(r.url).toBe('https://gen/A.pdf');
  });

  it('RH do tenant A não gera para colaborador do tenant B', async () => {
    sessao = rhA;
    const r: any = await gerarConteudoFinalPersonalizado({ contentId: 'k-A', colab: COLABS.c3 });
    expect(r.error).toMatch(/sem acesso a este colaborador/i);
  });
});

describe('prepararAudioPersonalizado — mesma régua, e o NOME vem do banco', () => {
  it('sem sessão não gera áudio nem grava no Storage', async () => {
    const r: any = await prepararAudioPersonalizado({ contentId: 'a-A', colab: COLABS.c1 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/autenticado/i);
    expect(ttsMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('não alcança áudio de outro tenant', async () => {
    sessao = colabA;
    const r: any = await prepararAudioPersonalizado({ contentId: 'a-B', colab: COLABS.c1 });
    expect(r.error).toMatch(/sem acesso a este conteúdo/i);
    expect(ttsMock).not.toHaveBeenCalled();
  });

  it('admin não mistura tenants: conteúdo de A com pessoa de B é recusado', async () => {
    sessao = admin;   // assertColabAccess libera admin para QUALQUER colaborador
    const r: any = await prepararAudioPersonalizado({ contentId: 'a-A', colab: COLABS.c3 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/outro tenant/i);
    expect(ttsMock).not.toHaveBeenCalled();
  });

  it('a saudação usa o nome do BANCO, não o que veio no payload', async () => {
    sessao = rhA;
    const r: any = await prepararAudioPersonalizado({
      contentId: 'a-A',
      colab: { id: 'c1', nome_completo: 'Nome Injetado Pelo Caller' },
    });
    expect(r.success).toBe(true);
    expect(ttsMock).toHaveBeenCalledTimes(1);
    expect(ttsMock.mock.calls[0][1]).toBe('Ana do Banco');
  });
});
