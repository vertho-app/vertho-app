import { describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * PDI de quem tem competência PRÓPRIA (mig 287, Amazon Bowling 15/10/2026). Duas decisões do dono no mesmo dia:
 * a trilha é a competência de MENOR nota da pessoa, e, com o prazo encerrado, "todos entram" com o que responderam.
 * Então, para essa pessoa, o PDI (1) põe a competência dela na frente, mesmo com o cargo sem foco, e (2) não exige o
 * Top 5 inteiro, só que tudo o que ela respondeu esteja avaliado.
 */
const h = vi.hoisted(() => ({ sb: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'modelo', DEFAULT_TASK_MODELS: {} }));

import { buildRelatorioIndividualPrompt } from '@/lib/relatorio-individual-prompt';

const TOP5 = ['Foco no cliente', 'Rotina', 'Simplicidade'];
const resposta = (competencia_nome: string, avaliada = true) => ({
  competencia_nome, colaborador_id: 'c1', cenario_id: null, r1: 'Resposta.',
  avaliacao_ia: avaliada ? { consolidacao: { nivel_geral: 2, media_descritores: 2.1 }, feedback: { resumo_geral: 'ok' } } : null,
  nivel_ia4: avaliada ? 2 : null, nota_ia4: avaliada ? 2.1 : null,
});

function montar(focoIndividual: string[] | null, respostas: any[], focoCargo: string[] = []) {
  h.sb = criarSupabaseMock({
    resolver: (tabela: string) => ({
      colaboradores: { id: 'c1', nome_completo: 'Ana', cargo: 'CAIXA', email: 'ana@x.com', programa_modo: null, foco_individual: focoIndividual },
      empresas: { nome: 'Empresa', segmento: 'servicos', sys_config: { programa_modo: 'jornada' } },
      cargos_empresa: { top5_workshop: TOP5, competencias_foco: focoCargo, competencia_foco: focoCargo[0] ?? null },
    } as Record<string, any>)[tabela] ?? null,
    lista: (tabela: string) => (tabela === 'respostas' ? respostas : []),
  });
  return buildRelatorioIndividualPrompt(h.sb.client, { empresaId: 'e1', colaboradorId: 'c1' });
}

describe('PDI com a competência de cada pessoa', () => {
  it('com competência própria, 2 de 3 do Top 5 respondidas e avaliadas: o PDI sai, mesmo com o cargo SEM foco', async () => {
    const r: any = await montar(['Rotina'], [resposta('Foco no cliente'), resposta('Rotina')]);
    expect(r.error).toBeUndefined();
  });

  it('a competência própria vem na frente das demais avaliadas', async () => {
    const r: any = await montar(['Rotina'], [resposta('Foco no cliente'), resposta('Rotina')], ['Foco no cliente']);
    expect(r.error).toBeUndefined();
    const texto = JSON.stringify(r);
    expect(texto.indexOf('Rotina')).toBeGreaterThan(-1);
    expect(texto.indexOf('Rotina')).toBeLessThan(texto.indexOf('Foco no cliente'));
  });

  it('com competência própria, uma resposta ainda sem avaliação segura o PDI', async () => {
    const r: any = await montar(['Rotina'], [resposta('Foco no cliente'), resposta('Rotina', false)]);
    expect(r.error).toMatch(/Avaliação incompleta: 1\/2 respostas avaliadas/);
  });

  it('SEM competência própria, a régua de antes segue: 2 de 3 do Top 5 é incompleto', async () => {
    const r: any = await montar(null, [resposta('Foco no cliente'), resposta('Rotina')], ['Rotina']);
    expect(r.error).toMatch(/Avaliação incompleta: 2\/3 competências avaliadas/);
  });

  it('sem competência própria e com o cargo sem foco, o PDI recusa pedindo o foco', async () => {
    const r: any = await montar(null, TOP5.map((c) => resposta(c)));
    expect(r.error).toMatch(/competências foco/);
  });
});
