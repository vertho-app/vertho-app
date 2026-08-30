import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const EMPRESA_ID = 'tenant-rh-1';
const REPORTS = [
  { id: 'rel-rh', colaborador_id: null, tipo: 'rh', gerado_em: '2026-08-29T10:00:00Z' },
  { id: 'rel-pulso', colaborador_id: null, tipo: 'pulso_executivo', gerado_em: '2026-08-28T10:00:00Z' },
  { id: 'rel-gestor', colaborador_id: 'gestor-1', tipo: 'gestor', gerado_em: '2026-08-27T10:00:00Z' },
  { id: 'rel-pdi', colaborador_id: 'pessoa-1', tipo: 'individual', gerado_em: '2026-08-26T10:00:00Z' },
];

const sb = criarSupabaseMock({
  resolver: (table) => table === 'empresas' ? { nome: 'Empresa Teste' } : null,
  lista: (table) => {
    if (table === 'relatorios') return REPORTS;
    if (table === 'colaboradores') return [
      { id: 'gestor-1', nome_completo: 'Carla Gestora', cargo: 'Gerente Comercial' },
      { id: 'pessoa-1', nome_completo: 'Bruna Pessoa', cargo: 'Representante Comercial' },
    ];
    return [];
  },
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/home/loaders', () => ({
  carregarRelatoriosGerenciais: async () => ({
    rh: { url: '/api/relatorios/pdf?id=rel-rh', em: '2026-08-29T10:00:00Z' },
    perfilOrg: { url: 'https://cdn/perfil.pdf', em: '2026-08-25T10:00:00Z' },
    dna: { url: 'https://cdn/dna.pdf', em: '2026-08-24T10:00:00Z' },
  }),
}));

import { carregarCentralRelatoriosRH } from '@/lib/relatorios/rh-center';

describe('central de relatórios do RH', () => {
  beforeEach(() => sb.reset());

  it('agrupa documentos sem duplicar o relatório de RH e identifica os destinatários', async () => {
    const result = await carregarCentralRelatoriosRH(EMPRESA_ID);

    expect(result.companyName).toBe('Empresa Teste');
    expect(result.organization.map((item) => item.kind)).toEqual([
      'rh', 'perfil_org', 'dna', 'pulso_executivo',
    ]);
    expect(result.managers).toEqual([
      expect.objectContaining({ id: 'rel-gestor', recipient: 'Carla Gestora', role: 'Gerente Comercial' }),
    ]);
    expect(result.people).toEqual([
      expect.objectContaining({ id: 'rel-pdi', recipient: 'Bruna Pessoa', role: 'Representante Comercial' }),
    ]);
  });

  it('consulta relatórios e colaboradores sempre com o filtro automático do tenant', async () => {
    await carregarCentralRelatoriosRH(EMPRESA_ID);
    expect(sb.usou('relatorios', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
  });

  it('a rota deriva o tenant da sessão RH, sem aceitar empresa do browser', () => {
    const page = readFileSync('app/dashboard/relatorios/page.tsx', 'utf8');
    expect(page).toContain("requireRoleAction(['rh'])");
    expect(page).toContain('carregarCentralRelatoriosRH(auth.empresaId)');
    expect(page).not.toMatch(/searchParams|empresaId:\s*string/);
  });

  it('renderiza o PDF dentro da tela e mantém o download como ação separada', () => {
    const view = readFileSync('app/dashboard/relatorios/relatorios-rh-view.tsx', 'utf8');
    const reader = readFileSync('components/pdf/in-app-pdf-document.tsx', 'utf8');
    const home = readFileSync('app/dashboard/home-rh.tsx', 'utf8');
    const pdfRoute = readFileSync('app/api/relatorios/pdf/route.ts', 'utf8');

    expect(view).toContain('<ReportReader');
    expect(view).toContain('<InAppPdfDocument');
    expect(view).not.toContain('<iframe');
    expect(view).not.toContain('target="_blank"');
    expect(reader).toContain("import('pdfjs-dist')");
    expect(reader).toContain('<canvas');
    expect(home).toContain('/dashboard/relatorios?document=organization-rh');
    expect(home).not.toContain('target="_blank"');
    expect(pdfRoute).toContain("searchParams.get('view') === 'inline'");
    expect(pdfRoute).toContain('`${contentDisposition}; filename=');
  });
});
