import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PROGRAMA_PILOTO } from '@/lib/season-engine/programa-config';
import { PILOTO_SPEC_VERSION } from '@/lib/season-engine/piloto-trava';
import { PROGRESSO } from '@/lib/status';

// ── Mock do Supabase ───────────────────────────────────────────────────────
// Usa `tests/helpers/supabase-mock`, que sabe FALHAR. A versão anterior deste
// arquivo hardcodava `error: null` nos quatro métodos — e o CLAUDE.md apontava
// justamente este arquivo como o modelo a copiar, o que fazia a suíte garantir
// que a classe nº 1 do "NÃO fazer" (não checar o `{ error }` do supabase-js)
// nascesse verde. Medido em 10/08: 31 de 40 arquivos de teste eram assim.
import { criarSupabaseMock } from '../../helpers/supabase-mock';

let resolver: (table: string, cols: string) => any = () => null;
const sb = criarSupabaseMock({ resolver: (t, c) => resolver(t, c) });
const client = sb.client;
/** Compat com as asserções existentes: escritas de update, no formato antigo. */
const updates = sb.escritas;

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => client }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => client, requireEmpresaSupabase: async () => client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({}) }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({ resolverConfigDaTrilha: async () => PROGRAMA_PILOTO }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { gerarEvolutionReportCore } from '@/lib/season-engine/evolution-report-core';
import { gerarAvaliacaoAcumuladaCore } from '@/lib/season-engine/avaliacao-acumulada-core';

beforeEach(() => { sb.reset(); resolver = () => null; });

// Trilha piloto padrão (emp-A) com 2 descritores.
const trilhaPiloto = (empresa = 'emp-A') => ({
  id: 'tr1', empresa_id: empresa, colaborador_id: 'c1',
  competencia_foco: 'Controle', competencias_foco: ['Controle'],
  descritores_selecionados: [{ descritor: 'D1', competencia: 'Controle' }, { descritor: 'D2', competencia: 'Controle' }],
  temporada_plano: [], programa_modo: 'piloto',
});

const prog14 = (avaliacao: any[], spec = PILOTO_SPEC_VERSION, status = PROGRESSO.CONCLUIDO) => ({
  status, feedback: { spec_version: spec, avaliacao_por_descritor: avaliacao, resumo_avaliacao: {}, nota_media_pos: 2.4 },
});

describe('gerarEvolutionReportCore — B4 (não trava por N-1) + B5 (tenant)', () => {
  it('B5: rejeita trilha de OUTRO tenant (opts.empresaId ≠ trilha.empresa_id)', async () => {
    resolver = (t) => (t === 'trilhas' ? trilhaPiloto('emp-A') : null);
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-B' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/outro tenant/i);
    expect(updates.length).toBe(0); // nunca chega a persistir
  });

  it('B4: gera o report com N-1 descritores + flag incompleto (não trava mais a trilha)', async () => {
    resolver = (t, cols) => {
      if (t === 'trilhas') return trilhaPiloto('emp-A');
      if (t === 'temporada_semana_progresso' && cols.includes('reflexao')) return { reflexao: null };
      if (t === 'temporada_semana_progresso' && cols.includes('feedback')) return prog14([{ descritor: 'D1', nota_pos: 2.5, nota_pre: 2.0 }]); // 1 de 2
      return null;
    };
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-A' });
    expect(r.success).toBe(true);
    const er = r.evolution_report as any;
    expect(er.incompleto).toBe(true);
    expect(er.descritores_avaliados).toBe(1);
    expect(er.descritores_esperados).toBe(2);
    expect(updates.some((u) => u.tabela === 'trilhas' && u.payload.status)).toBe(true); // conclui a trilha
  });

  it('B4: completo (2/2) gera sem flag de incompleto', async () => {
    resolver = (t, cols) => {
      if (t === 'trilhas') return trilhaPiloto('emp-A');
      if (t === 'temporada_semana_progresso' && cols.includes('reflexao')) return { reflexao: null };
      if (t === 'temporada_semana_progresso' && cols.includes('feedback')) return prog14([{ descritor: 'D1', nota_pos: 2.5 }, { descritor: 'D2', nota_pos: 3.0 }]);
      return null;
    };
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-A' });
    expect(r.success).toBe(true);
    expect((r.evolution_report as any).incompleto).toBe(false);
  });

  it('B4: ainda BLOQUEIA se a avaliação está VAZIA (guard preservado)', async () => {
    resolver = (t, cols) => {
      if (t === 'trilhas') return trilhaPiloto('emp-A');
      if (t === 'temporada_semana_progresso' && cols.includes('reflexao')) return { reflexao: null };
      if (t === 'temporada_semana_progresso' && cols.includes('feedback')) return prog14([]); // vazio
      return null;
    };
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-A' });
    expect(r.success).toBe(false);
    expect(updates.length).toBe(0);
  });

  it('B4: ainda BLOQUEIA se spec_version do piloto está errada (trava não aplicada)', async () => {
    resolver = (t, cols) => {
      if (t === 'trilhas') return trilhaPiloto('emp-A');
      if (t === 'temporada_semana_progresso' && cols.includes('reflexao')) return { reflexao: null };
      if (t === 'temporada_semana_progresso' && cols.includes('feedback')) return prog14([{ descritor: 'D1', nota_pos: 2.5 }], 'spec-errada');
      return null;
    };
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-A' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/spec_version/i);
  });
});

/**
 * Estes dois casos eram INEXPRIMÍVEIS com o mock anterior — ele devolvia
 * `error: null` sempre. São o motivo de F16 existir: o supabase-js **retorna**
 * `{ error }` em vez de lançar, então um caminho que não olha o retorno some do
 * radar tanto em produção quanto na suíte.
 */
describe('gerarEvolutionReportCore — o que o mock antigo não conseguia exercitar', () => {
  const cenarioCompleto = () => {
    resolver = (t, cols) => {
      if (t === 'trilhas') return trilhaPiloto('emp-A');
      if (t === 'temporada_semana_progresso' && cols.includes('reflexao')) return { reflexao: null };
      if (t === 'temporada_semana_progresso' && cols.includes('feedback')) return prog14([{ descritor: 'D1', nota_pos: 2.5 }, { descritor: 'D2', nota_pos: 3.0 }]);
      return null;
    };
  };

  it('leitura da trilha falhando não vira "trilha não encontrada"', async () => {
    cenarioCompleto();
    sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-A' });

    expect(r.success).toBe(false);
    // A distinção importa para quem lê o erro: "não existe" manda procurar o
    // dado; "o banco falhou" manda tentar de novo. Trocar uma pela outra é o que
    // faz o certificado acusar "participação < 75%" quando o pool estourou (F15).
    expect(r.error, `erro devolvido: ${r.error}`).not.toMatch(/não encontrada|not found/i);
    expect(updates.length).toBe(0);
  });

  it('falha ao PERSISTIR não pode ser reportada como sucesso', async () => {
    cenarioCompleto();
    sb.falharEm({ tabela: 'trilhas', op: 'update', mensagem: 'deadlock detected', code: '40P01' });
    const r = await gerarEvolutionReportCore('tr1', { empresaId: 'emp-A' });

    // Se este teste falhar, o core está devolvendo success:true depois de um
    // update que não gravou — o relatório existe na tela e não existe no banco.
    expect(r.success, 'update falhou e o core reportou sucesso').toBe(false);
  });
});

describe('gerarAvaliacaoAcumuladaCore — B5 (tenant)', () => {
  it('B5: rejeita trilha de outro tenant antes de qualquer IA', async () => {
    resolver = (t) => (t === 'trilhas' ? trilhaPiloto('emp-A') : null);
    const r: any = await gerarAvaliacaoAcumuladaCore('tr1', { empresaId: 'emp-B' });
    expect(r.error).toMatch(/outro tenant/i);
  });
});
