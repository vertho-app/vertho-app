import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-67 item 2 (onda D): quem GRAVA o PDF no Storage (os núcleos do PDI, do Relatório do Gestor e do
 * Relatório de RH) renderiza no idioma da PESSOA a quem o relatório pertence e carimba o idioma no
 * nome do arquivo guardado. É o arquivo que o download e o envio reaproveitam, então o idioma tem
 * que nascer certo aqui.
 *
 *  - PDI: o idioma da pessoa do PDI (`colaboradores.locale`, senão o da empresa);
 *  - Relatório do Gestor: o idioma do gestor, e na falta de cadastro dele no tenant, o da empresa;
 *  - Relatório de RH: o da empresa.
 *  - pt-BR segue exatamente como era (caminho sem marca).
 */
const h = vi.hoisted(() => ({
  sb: null as any,
  renders: [] as any[],
  uploads: [] as string[],
  locale: { colab: null as string | null, empresa: null as string | null, gestor: null as string | null },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => JSON.stringify({ achados: [] })), callAIChat: vi.fn() }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => JSON.parse(t) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo', DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/rag', () => ({ retrieveContext: vi.fn(async () => []), formatGroundingBlock: () => '' }));
vi.mock('@react-pdf/renderer', async (original) => ({
  ...(await original<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: async (el: any) => { h.renders.push({ componente: el.type?.name, ...el.props }); return Buffer.from('%PDF-1.7'); },
}));

import { persistRelatorioIndividualFromText } from '@/lib/relatorios/individual-core';
import { buildRelatorioIndividualPrompt } from '@/lib/relatorio-individual-prompt';
import { gerarRelatorioGestorCore, gerarRelatorioRHCore } from '@/lib/relatorios/gestor-rh-core';

const EMPRESA = 'emp-1';
const COMP = 'Escuta ativa';

function montar() {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => {
      if (tabela === 'colaboradores') {
        return {
          id: 'c1', nome_completo: 'Ana Souza', cargo: 'Analista', email: 'ana@acme.com', locale: h.locale.colab,
          programa_modo: null, perfil_dominante: 'C', d_natural: 20, i_natural: 30, s_natural: 60, c_natural: 90,
        };
      }
      if (tabela === 'empresas') return { nome: 'Acme', segmento: 'educacao', sys_config: {}, default_locale: h.locale.empresa };
      if (tabela === 'cargos_empresa') return { top5_workshop: [COMP], competencia_foco: COMP, competencias_foco: [COMP] };
      return null;
    },
    lista: (tabela: string, cols?: string) => {
      if (tabela === 'respostas') {
        return [{
          competencia_nome: COMP, competencia_id: 'k1', colaborador_id: 'c1', cenario_id: null, r1: 'Ouvi antes.', nivel_ia4: 2, nota_ia4: 2.2,
          avaliacao_ia: { consolidacao: { nivel_geral: 2, media_descritores: 2.2 }, feedback: { resumo_geral: 'Ok.' } },
        }];
      }
      // a leitura de "internos @vertho.ai" do RH pede só o `id`: ninguém é interno aqui
      if (tabela === 'colaboradores' && cols === 'id') return [];
      if (tabela === 'colaboradores') {
        return [
          { id: 'g1', nome_completo: 'Gina Gestora', email: 'gina@acme.com', cargo: 'Gerente', gestor_email: null, locale: h.locale.gestor, perfil_dominante: 'D' },
          { id: 'c1', nome_completo: 'Ana Souza', email: 'ana@acme.com', cargo: 'Analista', gestor_email: 'gina@acme.com', gestor_nome: 'Gina Gestora', perfil_dominante: 'C' },
        ];
      }
      if (tabela === 'competencias') return [{ id: 'k1', nome: COMP }];
      return [];
    },
  });
  h.sb.client.storage = {
    from: () => ({ upload: async (path: string) => { h.uploads.push(path); return { error: null }; } }),
  };
}

beforeEach(() => {
  h.renders = [];
  h.uploads = [];
  h.locale = { colab: null, empresa: null, gestor: null };
  montar();
});

const PDI_TEXTO = JSON.stringify({
  acolhimento: 'Ana, este plano é seu.',
  perfil_comportamental: { descricao: 'Perfil.' },
  competencias: [{ nome: COMP, feedback: 'Bom.' }],
  resumo_desempenho: [{ competencia: COMP, leitura: 'Ouviu antes.' }],
});

async function gerarPdi() {
  const built: any = await buildRelatorioIndividualPrompt(h.sb.client as any, { empresaId: EMPRESA, colaboradorId: 'c1' });
  expect(built.error, built.error).toBeUndefined();
  const r = await persistRelatorioIndividualFromText(h.sb.client as any, { empresaId: EMPRESA, colaboradorId: 'c1', texto: PDI_TEXTO, built });
  expect(r.success, r.error).toBe(true);
  return r;
}
const pdfPathGravado = () => h.sb.escritas.find((e: any) => e.tabela === 'relatorios')?.payload?.pdf_path;

describe('PDI: o idioma da pessoa do PDI', () => {
  it('pessoa com idioma próprio: renderiza nele e o arquivo guardado leva a marca', async () => {
    h.locale.colab = 'es-ES';
    h.locale.empresa = 'en-US';
    montar();
    await gerarPdi();
    expect(h.renders).toHaveLength(1);
    expect(h.renders[0].locale).toBe('es-ES');
    expect(h.uploads[0]).toMatch(/^emp-1\/individual-.+-\d+\.es-ES\.pdf$/);
    expect(pdfPathGravado()).toBe(h.uploads[0]);
  });

  it('sem idioma na pessoa: o da empresa', async () => {
    h.locale.empresa = 'pt-PT';
    montar();
    await gerarPdi();
    expect(h.renders[0].locale).toBe('pt-PT');
    expect(h.uploads[0]).toMatch(/\.pt-PT\.pdf$/);
  });

  it('pt-BR (ou nenhum idioma): o caminho é o formato de sempre, sem marca', async () => {
    await gerarPdi();
    expect(h.renders[0].locale).toBe('pt-BR');
    expect(h.uploads[0]).toMatch(/^emp-1\/individual-.+-\d+\.pdf$/);
    expect(h.uploads[0]).not.toMatch(/\.(pt-BR|pt-PT|es-ES|en-US)\.pdf$/);
  });
});

describe('Relatório de RH: o idioma da empresa', () => {
  it('renderiza no idioma da empresa e carimba o arquivo', async () => {
    h.locale.empresa = 'en-US';
    montar();
    const r = await gerarRelatorioRHCore(h.sb.client as any, EMPRESA);
    expect(r.success, r.error).toBe(true);
    expect(h.renders[0].locale).toBe('en-US');
    expect(h.uploads[0]).toMatch(/^emp-1\/rh-.+-\d+\.en-US\.pdf$/);
  });
});

describe('Relatório do Gestor: o idioma do gestor', () => {
  // o resolver devolve a MESMA linha para a leitura do idioma; o locale que vale é o do gestor
  it('renderiza no idioma do gestor (cadastrado no tenant) e carimba o arquivo', async () => {
    h.locale.colab = 'es-ES'; // `maybeSingle` de colaboradores devolve esta linha na leitura do idioma
    h.locale.empresa = 'en-US';
    montar();
    const r = await gerarRelatorioGestorCore(h.sb.client as any, EMPRESA);
    expect(r.success, r.error).toBe(true);
    expect(h.renders).toHaveLength(1);
    expect(h.renders[0].locale).toBe('es-ES');
    expect(h.uploads[0]).toMatch(/^emp-1\/gestor-.+-\d+\.es-ES\.pdf$/);
  });
});
