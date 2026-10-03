import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * R-31 (revisão de 02/10/2026; decisão do dono em 03/10/2026): os relatórios do
 * Pulso não são servidos enquanto o bloco estiver off-line. Antes, a rota
 * entregava o PDF, inclusive o "Pulso Complementar NR-1", a quem tivesse o id.
 *
 * O registro de blocos é o REAL (`lib/blocos-offline.ts`): só a sessão e o
 * banco são simulados.
 */
const estado = vi.hoisted(() => ({ ctx: null as any, rel: null as any }));

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'relatorios') return estado.rel;
    if (tabela === 'empresas') return { nome: 'Empresa A' };
    if (tabela === 'colaboradores') return { nome_completo: 'Pessoa Um', cargo: 'Analista' };
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
import { blocoEstaOffline } from '@/lib/blocos-offline';
import { ehTipoRelatorioPulso, tipoRelatorioForaDoAr } from '@/lib/relatorios/tipos-pulso';

const EMPRESA = 'emp-a';
const rh = { email: 'rh@a.com', colaborador: { id: 'rh-1', empresa_id: EMPRESA, role: 'rh' }, role: 'rh', empresaId: EMPRESA, isPlatformAdmin: false };
const admin = { email: 'admin@vertho.ai', colaborador: null, role: 'colaborador', empresaId: null, isPlatformAdmin: true };
const baixar = () => GET(new Request('https://empresa-a.vertho.ai/api/relatorios/pdf?id=rel-1'));
const relatorio = (tipo: string) => ({ id: 'rel-1', empresa_id: EMPRESA, tipo, colaborador_id: null, pdf_path: 'x.pdf', conteudo: {} });

describe('/api/relatorios/pdf não serve relatório de bloco off-line (R-31)', () => {
  beforeEach(() => sb.reset());

  it('pré-condição: o Pulso está off-line no registro real', () => {
    expect(blocoEstaOffline('pulso')).toBe(true);
  });

  it.each(['pulso_executivo', 'pulso_complementar_nr1'])('🔴 %s: 404 para o RH da própria empresa, mesmo com o PDF já salvo', async (tipo) => {
    estado.rel = relatorio(tipo);
    estado.ctx = rh;
    const r = await baixar();
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe('Relatório não encontrado');
  });

  it('🔴 nem a plataforma recebe: o bloco está desligado para todos', async () => {
    estado.rel = relatorio('pulso_complementar_nr1');
    estado.ctx = admin;
    expect((await baixar()).status).toBe(404);
  });

  it('a resposta é a mesma de um id que não existe (não vira oráculo do que há gravado)', async () => {
    estado.ctx = rh;
    estado.rel = relatorio('pulso_executivo');
    const doPulso = await baixar();
    estado.rel = null;
    const inexistente = await baixar();
    expect(doPulso.status).toBe(inexistente.status);
    expect(await doPulso.json()).toEqual(await inexistente.json());
  });

  it('os outros tipos seguem abrindo', async () => {
    estado.ctx = rh;
    for (const tipo of ['rh']) {
      estado.rel = relatorio(tipo);
      expect((await baixar()).status, tipo).toBe(200);
    }
  });

  it('o helper reconhece só os dois tipos do Pulso', () => {
    expect(ehTipoRelatorioPulso('pulso_executivo')).toBe(true);
    expect(ehTipoRelatorioPulso('pulso_complementar_nr1')).toBe(true);
    for (const tipo of ['rh', 'gestor', 'individual', 'pulso', '', null, undefined, 42]) {
      expect(tipoRelatorioForaDoAr(tipo), String(tipo)).toBe(false);
    }
  });
});
