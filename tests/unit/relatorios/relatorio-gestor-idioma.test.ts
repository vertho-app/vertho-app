import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { semComentarios } from '../../helpers/fonte';
import { readFileSync } from 'node:fs';

/**
 * R-67 (04/10/2026): a leitura executiva do GESTOR (o card "Leitura para decidir e agir" da home dele) sai da IA
 * no idioma do gestor. O `callAI` já aceita `locale` (`lib/ai-language.ts` acrescenta a instrução de idioma ao
 * prompt), mas a geração não o passava: sem `locale` ele lê o cookie de quem DISPAROU (a operação da Vertho, em
 * pt-BR), e o gestor de outro idioma abria a tela traduzida com a síntese em português.
 *
 * Regra: o idioma da PESSOA que lê (`colaboradores.locale`); gestor sem cadastro no tenant, ou sem idioma, fica
 * com o da empresa (`empresas.default_locale`); na falta dos dois, pt-BR (`resolveAppLocale`).
 */

const mocks = vi.hoisted(() => ({
  chamadas: [] as Array<{ user: string; opcoes: any }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_system: string, user: string, _cfg: any, _max: number, opcoes: any) => {
    mocks.chamadas.push({ user, opcoes });
    return '{}';
  }),
}));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => JSON.parse(t) }));
vi.mock('@/lib/rag', () => ({ retrieveContext: vi.fn(async () => []), formatGroundingBlock: () => '' }));
vi.mock('@react-pdf/renderer', async (original) => ({ ...(await original<any>()), renderToBuffer: vi.fn(async () => Buffer.from('%PDF')) }));

const EMPRESA = 'emp-gestor-idioma';
let defaultLocale: string | null = 'es-ES';

const COLABS = [
  { id: 'g1', nome_completo: 'Gina Gestora', email: 'gina@x.test', cargo: 'Gestor', gestor_email: 'chefe@x.test', role: 'gestor', locale: 'en-US' },
  { id: 'g2', nome_completo: 'Hugo Gestor', email: 'hugo@x.test', cargo: 'Gestor', gestor_email: 'chefe@x.test', role: 'gestor', locale: null },
  { id: 'a1', nome_completo: 'Ana', email: 'ana@x.test', cargo: 'Professor', gestor_email: 'gina@x.test', role: 'colaborador', perfil_dominante: 'Alto D' },
  { id: 'b1', nome_completo: 'Bia', email: 'bia@x.test', cargo: 'Professor', gestor_email: 'hugo@x.test', role: 'colaborador', perfil_dominante: 'Alto S' },
  { id: 'c1', nome_completo: 'Caio', email: 'caio@x.test', cargo: 'Professor', gestor_email: 'externo@x.test', gestor_nome: 'Externo', role: 'colaborador', perfil_dominante: 'Alto C' },
];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { nome: 'Empresa', segmento: 'educacao', default_locale: defaultLocale } : null),
  lista: (tabela) => {
    if (tabela === 'colaboradores') return COLABS;
    return [];
  },
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { gerarRelatorioGestorCore } from '@/lib/relatorios/gestor-rh-core';

const idiomaDe = (gestorEmail: string) => mocks.chamadas.find((c) => c.user.includes(`(${gestorEmail})`))?.opcoes?.locale;

describe('relatório do gestor: a IA escreve no idioma de quem lê', () => {
  beforeEach(() => { sb.reset(); mocks.chamadas.length = 0; defaultLocale = 'es-ES'; });

  it('cada gestor recebe o idioma dele; sem idioma ou sem cadastro, o da empresa', async () => {
    await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(mocks.chamadas.length).toBe(4); // gina, hugo, externo e chefe (os dois gestores são liderados do chefe)
    expect(idiomaDe('gina@x.test')).toBe('en-US');      // idioma da própria pessoa
    expect(idiomaDe('hugo@x.test')).toBe('es-ES');      // cadastrado, sem idioma: o da empresa
    expect(idiomaDe('externo@x.test')).toBe('es-ES');   // sem cadastro no tenant: o da empresa
    expect(idiomaDe('chefe@x.test')).toBe('es-ES');
  });

  it('sem idioma na pessoa nem na empresa, pt-BR (como sempre foi)', async () => {
    defaultLocale = null;
    await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    expect(idiomaDe('hugo@x.test')).toBe('pt-BR');
    expect(idiomaDe('gina@x.test')).toBe('en-US');
  });

  it('o idioma é o do gestor, não o de quem dispara: a chamada leva `locale` explícito', async () => {
    await gerarRelatorioGestorCore(sb.client as any, EMPRESA, {});
    for (const c of mocks.chamadas) {
      expect(c.opcoes).toMatchObject({ taskKey: 'relatorio_gestor', empresaId: EMPRESA });
      expect(['pt-BR', 'pt-PT', 'es-ES', 'en-US']).toContain(c.opcoes.locale);
    }
  });

  it('a fonte lê o idioma por consultas PRÓPRIAS com o `error` checado (as duas leituras antigas ficam como estavam)', () => {
    const fonte = semComentarios(readFileSync('lib/relatorios/gestor-rh-core.ts', 'utf8'));
    expect(fonte).toContain("select('id, locale').in('id', idsDosGestores)");
    expect(fonte).toContain("select('default_locale').eq('id', empresaId).maybeSingle()");
    expect(fonte).toContain('errIdiomas');
    expect(fonte).toContain('errIdiomaEmpresa');
    expect(fonte).toContain('locale: resolveAppLocale(');
  });
});
