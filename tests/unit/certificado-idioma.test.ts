/**
 * R-67 (04/10/2026): o certificado saía no idioma da EMPRESA (`default_locale`), e
 * não no da pessoa. Quem escolheu outro idioma para a tela recebia o diploma no
 * da empresa. Agora vale o da pessoa (`colaboradores.locale`) e, na falta dele, o
 * da empresa.
 *
 * Medido em 04/10/2026 (leitura agregada): as 15 empresas têm `default_locale =
 * pt-BR` e as 557 pessoas têm `locale` nulo (529) ou pt-BR (28). Hoje a escolha
 * não muda nenhum certificado; o teste prova que muda quando existir.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

let colabLocale: string | null | undefined;
let empresaLocale: string | null | undefined;

const trilha = {
  id: 't1', numero_temporada: 1, competencia_foco: 'Comunicação', competencias_foco: null,
  data_inicio: '2026-08-04', evolution_generated_at: '2026-09-20', status: 'concluida',
  temporada_plano: Array.from({ length: 7 }, (_, i) => ({ semana: i + 1 })), evolution_report: {}, programa_modo: 'jornada', programa_config: null,
  empresa_id: 'emp-1',
};
const progressos = Array.from({ length: 7 }, (_, i) => ({ semana: i + 1, tipo: 'conteudo', reflexao: { insight: 'x' }, feedback: null }));

const sb = criarSupabaseMock({
  resolver: (t) => {
    if (t === 'trilhas') return trilha;
    if (t === 'empresas') return { nome: 'Escola Teste', ui_config: {}, default_locale: empresaLocale, sys_config: {} };
    return null;
  },
  lista: (t) => (t === 'temporada_semana_progresso' ? progressos : []),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireUserAction: vi.fn(async () => ({ email: 'ana@escola.test' })) }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'c1', nome_completo: 'Ana Souza', cargo: 'Professora', empresa_id: 'emp-1', locale: colabLocale })),
  canViewColabJourney: () => true,
}));

import { loadCertificadoData } from '@/actions/certificado';
import { findColabByEmail } from '@/lib/authz';

describe('certificado: idioma da pessoa, com a empresa como reserva', () => {
  beforeEach(() => { sb.reset(); colabLocale = null; empresaLocale = 'pt-BR'; });

  it('a pessoa com idioma próprio vence o da empresa', async () => {
    colabLocale = 'en-US';
    empresaLocale = 'pt-BR';
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.ok).toBe(true);
    expect(r.idioma).toBe('en-US');
  });

  it('sem idioma no cadastro da pessoa, vale o da empresa', async () => {
    colabLocale = null;
    empresaLocale = 'es-ES';
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.idioma).toBe('es-ES');
  });

  it('idioma desconhecido na pessoa cai no da empresa, e sem nenhum cai no padrão', async () => {
    colabLocale = 'xx-YY';
    empresaLocale = 'pt-PT';
    expect(((await loadCertificadoData('ana@escola.test')) as any).idioma).toBe('pt-PT');
    colabLocale = undefined;
    empresaLocale = null;
    expect(((await loadCertificadoData('ana@escola.test')) as any).idioma).toBe('pt-BR');
  });

  it('o campo da empresa segue como antes (compatibilidade) e a leitura pede a coluna locale da pessoa', async () => {
    colabLocale = 'en-US';
    empresaLocale = 'es-ES';
    const r: any = await loadCertificadoData('ana@escola.test');
    expect(r.empresa.locale).toBe('es-ES');
    expect(vi.mocked(findColabByEmail).mock.calls.at(-1)?.[1]).toMatch(/\blocale\b/);
  });
});

describe('o PDF usa o idioma pedido', () => {
  it('o texto do certificado muda com `idioma` e cai no da empresa sem ele', async () => {
    const { CertificadoPDF } = await import('@/lib/certificado-pdf');
    const base = {
      colab: { nome: 'Ana Souza', cargo: 'Professora' },
      trilha: { numeroTemporada: 1, competencias: ['Comunicação'], dataInicio: '2026-08-04', dataConclusao: '2026-09-20' },
      empresa: { nome: 'Escola Teste', locale: 'pt-BR' },
      participacao: { semanasComEntrega: 7, totalSemanas: 7, pct: 100 },
      cargaHoraria: 24,
    };
    const textos = (dados: any): string => JSON.stringify(CertificadoPDF({ dados }));
    const ptBR = textos(base);
    const en = textos({ ...base, idioma: 'en-US' });
    const semIdiomaComEmpresaEn = textos({ ...base, empresa: { nome: 'Escola Teste', locale: 'en-US' } });
    expect(en).not.toBe(ptBR);
    expect(en).toContain('Certificate');
    expect(ptBR).not.toContain('Certificate');
    // sem `idioma`, o da empresa (compatibilidade com quem monta os dados à mão)
    expect(semIdiomaComEmpresaEn).toBe(en);
    // idioma inválido cai no padrão
    expect(textos({ ...base, idioma: 'xx-YY' })).toBe(ptBR);
  });
});
