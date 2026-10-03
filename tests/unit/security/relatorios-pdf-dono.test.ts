import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-71 (revisão de 02/10/2026): `/api/relatorios/pdf` conferia tenant e PAPEL,
 * não de quem era o relatório. Com o id em mãos (ele está na URL do PDF), um
 * gestor baixava o Relatório do Gestor de OUTRO gestor e o Relatório RH.
 *
 * O `assertTenantAccess` é o real: só a sessão é simulada.
 */
const estado = vi.hoisted(() => ({
  ctx: null as any,
  rel: null as any,
}));

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'relatorios') return estado.rel;
    if (tabela === 'empresas') return { nome: 'Empresa A' };
    if (tabela === 'colaboradores') return { nome_completo: 'Gestora Um', cargo: 'Diretora' };
    return null;
  },
});
sb.client.storage = {
  from: () => ({
    download: async () => ({ data: new Blob(['%PDF-1.7 salvo']), error: null }),
    upload: async () => ({ error: null }),
  }),
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/request-context', async (original) => ({
  ...(await original<typeof import('@/lib/auth/request-context')>()),
  requireUser: async () => estado.ctx,
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/pdf-marca', () => ({ resolverMarcaPdf: async () => ({}), nomeArquivoMarca: (v: string) => v }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: async () => Buffer.from('%PDF-1.7 gerado') }));
vi.mock('@/components/pdf/RelatorioIndividual', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioGestor', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioRH', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoExecutivo', () => ({ default: () => null }));
vi.mock('@/components/pdf/RelatorioPulsoNR1', () => ({ default: () => null }));

import { GET } from '@/app/api/relatorios/pdf/route';

const EMPRESA = 'emp-a';
const sessao = (role: string, colabId: string, extra: Record<string, any> = {}) => ({
  email: `${colabId}@empresa-a.com`,
  colaborador: { id: colabId, email: `${colabId}@empresa-a.com`, empresa_id: EMPRESA, role },
  role,
  empresaId: EMPRESA,
  isPlatformAdmin: false,
  ...extra,
});
const baixar = () => GET(new Request('https://empresa-a.vertho.ai/api/relatorios/pdf?id=rel-1'));

describe('/api/relatorios/pdf confere de QUEM é o relatório (R-71)', () => {
  beforeEach(() => {
    sb.reset();
  });

  describe('Relatório do Gestor', () => {
    beforeEach(() => {
      estado.rel = { id: 'rel-1', empresa_id: EMPRESA, tipo: 'gestor', colaborador_id: 'gestor-dono', pdf_path: 'g.pdf', conteudo: {} };
    });

    it('🔴 outro gestor da MESMA empresa recebe 403', async () => {
      estado.ctx = sessao('gestor', 'gestor-intruso');
      const r = await baixar();
      expect(r.status).toBe(403);
    });

    it('o gestor dono baixa o próprio relatório', async () => {
      estado.ctx = sessao('gestor', 'gestor-dono');
      const r = await baixar();
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('application/pdf');
    });

    it('RH da empresa baixa o relatório de qualquer gestor dela', async () => {
      estado.ctx = sessao('rh', 'rh-1');
      expect((await baixar()).status).toBe(200);
    });

    it('platform admin baixa', async () => {
      estado.ctx = { ...sessao('colaborador', 'admin-1'), isPlatformAdmin: true, empresaId: null };
      expect((await baixar()).status).toBe(200);
    });

    it('relatório sem dono gravado não abre para gestor nenhum', async () => {
      // `null === undefined` não pode virar "é o dono" para uma sessão sem cadastro.
      estado.rel = { ...estado.rel, colaborador_id: null };
      estado.ctx = { ...sessao('gestor', 'gestor-dono'), colaborador: null };
      expect((await baixar()).status).toBe(403);
    });

    it('colaborador recebe 403', async () => {
      estado.ctx = sessao('colaborador', 'colab-1');
      expect((await baixar()).status).toBe(403);
    });
  });

  describe('Relatório RH', () => {
    beforeEach(() => {
      estado.rel = { id: 'rel-1', empresa_id: EMPRESA, tipo: 'rh', colaborador_id: null, pdf_path: 'rh.pdf', conteudo: {} };
    });

    it('🔴 gestor recebe 403', async () => {
      estado.ctx = sessao('gestor', 'gestor-dono');
      expect((await baixar()).status).toBe(403);
    });

    it('RH baixa', async () => {
      estado.ctx = sessao('rh', 'rh-1');
      expect((await baixar()).status).toBe(200);
    });

    it('RH de OUTRA empresa continua barrado pelo tenant', async () => {
      estado.ctx = { ...sessao('rh', 'rh-b'), empresaId: 'emp-b' };
      expect((await baixar()).status).toBe(403);
    });
  });
});
