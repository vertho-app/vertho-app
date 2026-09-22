import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Qualidade da evidência na leitura de RH e gestor (decisão de 22/09/2026).
 *
 * O que o dono pediu é estreito: o NÍVEL da reflexão (alta, média, baixa),
 * nunca o texto. Três invariantes:
 *   1. o roll-up pede ao banco só a chave `qualidade_reflexao`, não a coluna
 *      `reflexao` inteira: o texto nem chega ao servidor desta tela;
 *   2. por pessoa vale a reflexão da ETAPA ATUAL (ou da semana filtrada), sem
 *      puxar uma qualidade antiga para a etapa seguinte;
 *   3. a faixa do resumo fecha com "entregaram evidência": semana de missão
 *      (sem classificação) conta como entregue, em "sem classificação", e não
 *      some nem vira um nível inventado.
 */

const PESSOAS = [
  { colaborador_id: 'p1', semana_atual: 2, status: 'ativo', colaboradores: { nome_completo: 'Ana', cargo: 'Professor(a)' } },
  { colaborador_id: 'p2', semana_atual: 2, status: 'ativo', colaboradores: { nome_completo: 'Bia', cargo: 'Professor(a)' } },
  { colaborador_id: 'p3', semana_atual: 4, status: 'ativo', colaboradores: { nome_completo: 'Caio', cargo: 'Professor(a)' } },
  { colaborador_id: 'p4', semana_atual: 1, status: 'ativo', colaboradores: { nome_completo: 'Duda', cargo: 'Professor(a)' } },
];

const PROGRESSO = [
  // Ana: semana 1 baixa, semana 2 alta → sem filtro vale a etapa atual (2).
  { trilha_id: 't1', colaborador_id: 'p1', semana: 1, tipo: 'conteudo', status: 'concluido', qualidade: 'baixa' },
  { trilha_id: 't1', colaborador_id: 'p1', semana: 2, tipo: 'conteudo', status: 'concluido', qualidade: 'alta' },
  // Bia: a semana 1 só libera a etapa atual; a qualidade exibida é a da 2.
  { trilha_id: 't2', colaborador_id: 'p2', semana: 1, tipo: 'conteudo', status: 'concluido', qualidade: 'baixa' },
  { trilha_id: 't2', colaborador_id: 'p2', semana: 2, tipo: 'conteudo', status: 'concluido', qualidade: 'media' },
  // Caio: só missão (aplicação) concluída → entregou, sem classificação.
  { trilha_id: 't3', colaborador_id: 'p3', semana: 1, tipo: 'conteudo', status: 'concluido', qualidade: 'alta' },
  { trilha_id: 't3', colaborador_id: 'p3', semana: 2, tipo: 'conteudo', status: 'concluido', qualidade: 'alta' },
  { trilha_id: 't3', colaborador_id: 'p3', semana: 3, tipo: 'conteudo', status: 'concluido', qualidade: 'alta' },
  { trilha_id: 't3', colaborador_id: 'p3', semana: 4, tipo: 'aplicacao', status: 'concluido', qualidade: null },
  // Duda: reflexão em andamento não é entrega, e a qualidade dela não conta.
  { trilha_id: 't4', colaborador_id: 'p4', semana: 1, tipo: 'conteudo', status: 'em_andamento', qualidade: 'alta' },
];

const PLANO = Array.from({ length: 5 }, (_, i) => ({ semana: i + 1, tipo: i === 3 ? 'aplicacao' : 'conteudo' }));
const TRILHAS = PESSOAS.map((p, i) => ({
  id: `t${i + 1}`,
  colaborador_id: p.colaborador_id,
  numero_temporada: 1,
  temporada_plano: PLANO,
  data_inicio: '2026-01-05',
}));

const COLUNAS_PEDIDAS: string[] = [];

const sb = criarSupabaseMock({
  lista: (tabela, cols) => {
    if (tabela === 'fase4_envios') return PESSOAS;
    if (tabela === 'trilhas') return TRILHAS;
    if (tabela === 'temporada_semana_progresso') {
      COLUNAS_PEDIDAS.push(cols);
      return cols.includes('tipo') ? PROGRESSO : [];
    }
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));

import { rollUpEngajamento } from '@/lib/engajamento/roll-up';

const porNome = (r: any) => Object.fromEntries(r.colaboradores.map((c: any) => [c.nome, c]));

describe('qualidade da evidência no roll-up', () => {
  beforeEach(() => { sb.reset(); COLUNAS_PEDIDAS.length = 0; });

  it('🔴 pede ao banco só o nível, nunca a coluna reflexao inteira', async () => {
    await rollUpEngajamento('emp-1');
    expect(COLUNAS_PEDIDAS.length).toBeGreaterThan(0);
    for (const cols of COLUNAS_PEDIDAS) {
      const campos = cols.split(',').map((c) => c.trim());
      // `reflexao` sozinho (ou `reflexao->...` sem ser a chave do nível) traria o texto.
      expect(campos.filter((c) => /(^|:)reflexao($|->)/.test(c) && !c.endsWith('->>qualidade_reflexao'))).toEqual([]);
    }
    expect(COLUNAS_PEDIDAS.some((c) => c.includes('reflexao->>qualidade_reflexao'))).toBe(true);
  });

  it('sem filtro, a qualidade acompanha a etapa atual da pessoa', async () => {
    const r: any = await rollUpEngajamento('emp-1');
    const p = porNome(r);
    expect(p.Ana.qualidadeEvidencia).toBe('alta');
    expect(p.Bia.qualidadeEvidencia).toBe('media');
  });

  it('com semana filtrada, o nível é o daquela semana', async () => {
    const r: any = await rollUpEngajamento('emp-1', 1);
    expect(porNome(r).Ana.qualidadeEvidencia).toBe('baixa');
  });

  it('🔴 semana de missão entrega sem nível, e reflexão não concluída não entrega', async () => {
    const r: any = await rollUpEngajamento('emp-1');
    const p = porNome(r);
    expect(p.Caio.enviouEvidencia).toBe(true);
    expect(p.Caio.qualidadeEvidencia).toBeNull();
    expect(p.Duda.enviouEvidencia).toBe(false);
    expect(p.Duda.qualidadeEvidencia).toBeNull();
  });

  it('🔴 a faixa do resumo fecha com "entregaram evidência"', async () => {
    const r: any = await rollUpEngajamento('emp-1');
    const q = r.resumo.qualidadeEvidencias;
    expect(q).toEqual({ alta: 1, media: 1, baixa: 0, semClassificacao: 1 });
    expect(q.alta + q.media + q.baixa + q.semClassificacao).toBe(r.resumo.enviaramEvidencia);
  });
});
