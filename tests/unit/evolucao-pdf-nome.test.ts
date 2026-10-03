import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-129 (revisão de 02/10/2026): o PDF executivo de evolução punha o nome da
 * turma CRU no `Content-Disposition`. Três turmas de Macaé e o nome do Grupo
 * Sinal têm travessão (medido no banco em 03/10/2026), fora do Latin-1: o
 * `Headers` lança "Cannot convert argument to a ByteString" e o RH recebia
 * essa frase em JSON no lugar do PDF. Mesma régua que a rota vizinha já tinha
 * (`relatorios-pdf-filename.test.ts`).
 */
const estado = vi.hoisted(() => ({
  turma: null as null | { id: string; nome: string },
  empresa: 'Empresa A',
  falha: null as null | Error,
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { nome: estado.empresa } : null),
});
sb.client.auth = { getUser: async () => ({ data: { user: { email: 'rh@empresa-a.com' } }, error: null }) };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => ({
    colaborador: { id: 'c1', email: 'rh@empresa-a.com', empresa_id: 'emp-a', role: 'rh' },
    role: 'rh', empresaId: 'emp-a', isPlatformAdmin: false, platformAdminRole: null,
  }),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ raw: sb.client }) }));
vi.mock('@/lib/relatorios/evolucao-center', () => ({
  carregarEvolucaoRH: async () => {
    if (estado.falha) throw estado.falha;
    return { indisponivel: false, cobertura: { medidos: 2 }, pessoas: [] };
  },
}));
vi.mock('@/lib/relatorios/recorte-turma', () => ({
  resolverRecorteDeTurma: async () => ({ colaboradorIds: estado.turma ? ['c1'] : null, turma: estado.turma }),
}));
vi.mock('@/lib/pdf-marca', () => ({
  resolverMarcaPdf: async () => ({ logoBase64: null, mostrarVertho: true }),
  marcaVertho: () => ({ logoBase64: null, mostrarVertho: true }),
  nomeArquivoMarca: (v: string) => v,
}));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => Buffer.from('%PDF-1.7 teste') }));
vi.mock('@/components/pdf/RelatorioEvolucao', () => ({ default: () => null }));

import { GET } from '@/app/api/relatorios/evolucao/pdf/route';

const pedido = (query = '') => new Request(`https://macae.vertho.ai/api/relatorios/evolucao/pdf${query}`, {
  headers: { authorization: 'Bearer token-de-teste' },
});

describe('PDF executivo de evolução: nome no cabeçalho HTTP', () => {
  beforeEach(() => {
    sb.reset();
    estado.turma = null;
    estado.empresa = 'Empresa A';
    estado.falha = null;
  });

  for (const modo of ['attachment', 'inline'] as const) {
    it(`🔴 ${modo}: turma com travessão devolve o PDF, sem ByteString error`, async () => {
      estado.turma = { id: 't1', nome: 'Diretores \u2014 Turma 1' };
      const r = await GET(pedido(`?turma=t1${modo === 'inline' ? '&view=inline' : ''}`));
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('application/pdf');
      const cd = r.headers.get('content-disposition') || '';
      expect(cd).toMatch(/^[\x20-\x7e]+$/);
      expect(cd).toContain(`${modo}; filename="`);
      expect(cd).toContain("filename*=UTF-8''vertho-evolucao-diretores-%E2%80%94-turma-1.pdf");
    });
  }

  it('empresa com travessão (Grupo Sinal), sem turma, também', async () => {
    estado.empresa = 'Grupo Sinal \u2014 Demonstração';
    const r = await GET(pedido());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('%E2%80%94-demonstra%C3%A7%C3%A3o.pdf');
  });

  it('🔴 falha na geração: 500 sem a mensagem interna', async () => {
    estado.falha = new Error('segredo interno: coluna x não existe');
    const r = await GET(pedido());
    expect(r.status).toBe(500);
    const corpo = await r.text();
    expect(corpo).not.toContain('segredo interno');
    expect(JSON.parse(corpo).error).toBe('falha ao gerar o PDF');
  });
});
