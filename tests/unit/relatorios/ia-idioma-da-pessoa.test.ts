import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Onda E (04/10/2026): os prompts recebem o idioma de quem LÊ. Este arquivo prova, nos núcleos que escrevem os
 * documentos da pessoa e da empresa, que o idioma chega ao `callAI` como opção EXPLÍCITA, e não como o cookie de
 * quem disparou a geração (a operação da Vertho, em pt-BR):
 *
 *  - PDI (`pdi_individual`) e blueprint (`blueprint_gerar`): o idioma da PESSOA, no síncrono e na request do lote;
 *  - relatório de RH (`relatorio_rh`): o idioma da EMPRESA;
 *  - as auditorias (`pdi_check`) NÃO recebem idioma: julgam o documento, não escrevem para ninguém.
 *
 * Regra do valor: `colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR.
 */
const h = vi.hoisted(() => ({
  sb: null as any,
  chamadas: [] as Array<{ taskKey: string | undefined; opcoes: any }>,
  locale: { colab: null as string | null, empresa: null as string | null },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_s: string, _u: string, _c: any, _m: number, opcoes: any) => {
    h.chamadas.push({ taskKey: opcoes?.taskKey, opcoes });
    if (opcoes?.taskKey === 'pdi_check') return JSON.stringify({ achados: [] });
    if (opcoes?.taskKey === 'blueprint_gerar') return JSON.stringify({ competencias: [{ nome: 'Escuta ativa' }], trilha: { semanas: [{ semana: 1, conexao_com_pdi: ['o1'] }] } });
    if (opcoes?.taskKey === 'relatorio_rh') return JSON.stringify({ resumo: 'ok' });
    return JSON.stringify({
      acolhimento: 'Olá.', perfil_comportamental: { descricao: 'Perfil.' },
      competencias: [{ nome: 'Escuta ativa', feedback: 'Bom.' }], resumo_desempenho: [{ competencia: 'Escuta ativa', leitura: 'Ok.' }],
    });
  }),
  callAIChat: vi.fn(),
}));
vi.mock('@/actions/utils', () => ({ extractJSON: async (t: string) => JSON.parse(t) }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo', DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/rag', () => ({ retrieveContext: vi.fn(async () => []), formatGroundingBlock: () => '' }));
vi.mock('@react-pdf/renderer', async (original) => ({
  ...(await original<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: async () => Buffer.from('%PDF-1.7'),
}));

import { buildRelatorioIndividualReq, gerarRelatorioIndividualCore } from '@/lib/relatorios/individual-core';
import { buildBlueprintReq, gerarBlueprintCore } from '@/lib/blueprint/core';
import { gerarRelatorioRHCore } from '@/lib/relatorios/gestor-rh-core';

const EMPRESA = 'emp-1';
const COMP = 'Escuta ativa';

function montar() {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => {
      if (tabela === 'colaboradores') {
        return {
          id: 'c1', empresa_id: EMPRESA, nome_completo: 'Ana Souza', cargo: 'Analista', email: 'ana@acme.com', locale: h.locale.colab,
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
      if (tabela === 'descriptor_assessments') return [{ descritor: 'D1', nota: 2.2 }, { descritor: 'D2', nota: 2.0 }];
      if (tabela === 'colaboradores' && cols === 'id') return [];
      if (tabela === 'colaboradores') {
        return [
          { id: 'g1', nome_completo: 'Gina Gestora', email: 'gina@acme.com', cargo: 'Gerente', gestor_email: null, perfil_dominante: 'D' },
          { id: 'c1', nome_completo: 'Ana Souza', email: 'ana@acme.com', cargo: 'Analista', gestor_email: 'gina@acme.com', perfil_dominante: 'C' },
        ];
      }
      if (tabela === 'competencias') return [{ id: 'k1', nome: COMP }];
      return [];
    },
  });
  h.sb.client.storage = { from: () => ({ upload: async () => ({ error: null }) }) };
}

beforeEach(() => {
  h.chamadas = [];
  h.locale = { colab: null, empresa: null };
  montar();
});

const daTarefa = (taskKey: string) => h.chamadas.filter((c) => c.taskKey === taskKey);

describe('PDI: o texto sai no idioma da pessoa', () => {
  it('síncrono: o `callAI` recebe o idioma da pessoa, e a auditoria não recebe idioma nenhum', async () => {
    h.locale.colab = 'es-ES';
    h.locale.empresa = 'en-US';
    montar();
    const r = await gerarRelatorioIndividualCore(h.sb.client as any, EMPRESA, 'c1');
    expect(r.success, r.error).toBe(true);
    expect(daTarefa('pdi_individual')).toHaveLength(1);
    expect(daTarefa('pdi_individual')[0].opcoes.locale).toBe('es-ES');
    expect(daTarefa('pdi_check').length).toBeGreaterThan(0);
    for (const c of daTarefa('pdi_check')) expect(c.opcoes).not.toHaveProperty('locale');
  });

  it('pessoa sem idioma: o da empresa; sem idioma nenhum, pt-BR (explícito, não o cookie)', async () => {
    h.locale.empresa = 'pt-PT';
    montar();
    await gerarRelatorioIndividualCore(h.sb.client as any, EMPRESA, 'c1');
    expect(daTarefa('pdi_individual')[0].opcoes.locale).toBe('pt-PT');

    h.chamadas = [];
    h.locale.empresa = null;
    montar();
    await gerarRelatorioIndividualCore(h.sb.client as any, EMPRESA, 'c1');
    expect(daTarefa('pdi_individual')[0].opcoes.locale).toBe('pt-BR');
  });

  it('lote: a request do PDI carrega o idioma da pessoa (vai em `BatchReq.locale`)', async () => {
    h.locale.colab = 'en-US';
    montar();
    const req: any = await buildRelatorioIndividualReq(h.sb.client as any, { empresaId: EMPRESA, colaboradorId: 'c1' });
    expect(req.error, req.error).toBeUndefined();
    expect(req.locale).toBe('en-US');
    expect(req.customId).toBe('c1');
  });
});

describe('blueprint: o texto sai no idioma da pessoa', () => {
  it('síncrono: o `callAI` recebe o idioma da pessoa', async () => {
    h.locale.colab = 'en-US';
    montar();
    const r: any = await gerarBlueprintCore(h.sb.client as any, { colaboradorId: 'c1', dryRun: true });
    expect(r.error, r.error).toBeUndefined();
    expect(daTarefa('blueprint_gerar')).toHaveLength(1);
    expect(daTarefa('blueprint_gerar')[0].opcoes.locale).toBe('en-US');
  });

  it('lote: a request do blueprint carrega o idioma da pessoa; sem idioma, o da empresa', async () => {
    h.locale.colab = null;
    h.locale.empresa = 'es-ES';
    montar();
    const req: any = await buildBlueprintReq(h.sb.client as any, { colaboradorId: 'c1' });
    expect(req.error, req.error).toBeUndefined();
    expect(req.locale).toBe('es-ES');
  });
});

describe('relatório de RH: o texto sai no idioma da empresa', () => {
  it('o `callAI` recebe `empresas.default_locale`', async () => {
    h.locale.empresa = 'en-US';
    montar();
    const r = await gerarRelatorioRHCore(h.sb.client as any, EMPRESA);
    expect(r.success, r.error).toBe(true);
    expect(daTarefa('relatorio_rh')).toHaveLength(1);
    expect(daTarefa('relatorio_rh')[0].opcoes.locale).toBe('en-US');
  });

  it('empresa sem idioma: pt-BR explícito', async () => {
    const r = await gerarRelatorioRHCore(h.sb.client as any, EMPRESA);
    expect(r.success, r.error).toBe(true);
    expect(daTarefa('relatorio_rh')[0].opcoes.locale).toBe('pt-BR');
  });
});
