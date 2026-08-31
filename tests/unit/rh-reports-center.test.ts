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

/** O que a central pediu ao panorama: é aqui que o recorte tem que chegar. */
const espiao = vi.hoisted(() => ({ panorama: [] as any[] }));

const TURMA = { id: 'turma-a', nome: 'Turma A', status: 'em_jornada' };

const sb = criarSupabaseMock({
  resolver: (table) => {
    if (table === 'empresas') return { nome: 'Empresa Teste' };
    if (table === 'turmas') return TURMA;
    return null;
  },
  lista: (table, cols) => {
    if (table === 'relatorios') return REPORTS;
    if (table === 'turmas') return [TURMA];
    if (table === 'turma_membros') return [{ turma_id: TURMA.id, colaborador_id: 'pessoa-1' }];
    // `select('id')` em colaboradores é a busca das contas de RH (fora da
    // contagem da turma). Nenhuma aqui.
    if (table === 'colaboradores' && cols === 'id') return [];
    if (table === 'colaboradores') return [
      { id: 'gestor-1', nome_completo: 'Carla Gestora', cargo: 'Gerente Comercial' },
      { id: 'pessoa-1', nome_completo: 'Bruna Pessoa', cargo: 'Representante Comercial' },
    ];
    if (table === 'descriptor_assessments') return [
      {
        colaborador_id: 'pessoa-1', competencia: 'Comunicação para Decisão',
        descritor: 'Confirma entendimento e próximo passo', nota: 3.2,
        nivel: 'proficiente', assessment_date: '2026-08-27T10:00:00Z',
      },
    ];
    return [];
  },
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/home/loaders', () => ({
  carregarPanoramaRH: async (empresaId: string, opts?: any) => (espiao.panorama.push({ empresaId, opts }), {
    empresaNome: 'Empresa Teste', pessoas: 30, comPerfil: 28,
    comMapeamento: 25, emJornada: 20, emDia: 17, atrasadas: 3,
    jornadasEncerradas: 2, indisponivel: false,
  }),
  carregarRelatoriosGerenciais: async () => ({
    rh: { url: '/api/relatorios/pdf?id=rel-rh', em: '2026-08-29T10:00:00Z' },
    perfilOrg: { url: 'https://cdn/perfil.pdf', em: '2026-08-25T10:00:00Z' },
    dna: { url: 'https://cdn/dna.pdf', em: '2026-08-24T10:00:00Z' },
  }),
}));

import { carregarCentralRelatoriosRH } from '@/lib/relatorios/rh-center';

describe('central de relatórios do RH', () => {
  beforeEach(() => { sb.reset(); espiao.panorama.length = 0; });

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
    expect(result.dashboard.panorama).toMatchObject({
      pessoas: 30, comPerfil: 28, comMapeamento: 25, emJornada: 20,
    });
    expect(result.dashboard.descriptorAnalysis?.organization.competencies[0]).toMatchObject({
      competency: 'Comunicação para Decisão',
      average: 3.2,
    });
  });

  it('consulta relatórios e colaboradores sempre com o filtro automático do tenant', async () => {
    await carregarCentralRelatoriosRH(EMPRESA_ID);
    expect(sb.usou('relatorios', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('colaboradores', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('descriptor_assessments', 'eq', 'empresa_id')).toBe(true);
  });

  it('a rota deriva o tenant da sessão RH, sem aceitar empresa do browser', () => {
    const page = readFileSync('app/dashboard/relatorios/page.tsx', 'utf8');
    expect(page).toContain("requireRoleAction(['rh'])");
    // O tenant é SEMPRE `auth.empresaId`. A URL só pode escolher o recorte
    // (`turmaId`) dentro dele, e mesmo esse valor é validado no servidor
    // contra as turmas do próprio tenant.
    expect(page).toMatch(/carregarCentralRelatoriosRH\(auth\.empresaId(,|\))/);
    expect(page).not.toMatch(/empresaId:\s*string/);
    const usosDoBrowser = page.match(/params\??\.\w+/g) || [];
    expect(usosDoBrowser).toEqual(['params?.turma']);
  });

  it('recorta a leitura pela turma escolhida na URL', async () => {
    const result = await carregarCentralRelatoriosRH(EMPRESA_ID, { turmaId: TURMA.id });

    // O recorte chega ao panorama…
    expect(espiao.panorama[0].opts?.colaboradorIds).toEqual(['pessoa-1']);
    // …e aos documentos de pessoa: o PDI da Bruna fica, o do gestor sai.
    expect(result.people.map((d) => d.id)).toEqual(['rel-pdi']);
    expect(result.managers).toEqual([]);
    // Os organizacionais descrevem a empresa e continuam acessíveis.
    expect(result.organization.map((item) => item.kind)).toContain('rh');
    expect(result.scope.turmaId).toBe(TURMA.id);
    // …e a tela é avisada de que a narrativa do PDF NÃO segue o recorte.
    expect(result.scope.insightScopeIsCompany).toBe(true);
  });

  it('turma que não é deste tenant não recorta nada, e o escopo DIZ isso', async () => {
    const result = await carregarCentralRelatoriosRH(EMPRESA_ID, { turmaId: 'turma-de-outra-empresa' });

    // Nem meio recorte, nem recorte silencioso: a leitura é a empresa inteira,
    // e `scope.turmaId` null é o que faz a barra de filtro mostrar "todas".
    expect(espiao.panorama[0].opts?.colaboradorIds).toBeNull();
    expect(result.scope.turmaId).toBeNull();
    expect(result.scope.insightScopeIsCompany).toBe(false);
    expect(result.people.map((d) => d.id)).toEqual(['rel-pdi']);
    expect(result.managers.map((d) => d.id)).toEqual(['rel-gestor']);
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
