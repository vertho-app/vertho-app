import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PROGRAMA_PILOTO } from '@/lib/season-engine/programa-config';
import { PILOTO_SPEC_VERSION } from '@/lib/season-engine/piloto-trava';
import { PROGRESSO } from '@/lib/status';

// ── Mock do Supabase (cliente encadeável) ──────────────────────────────────
// `resolver(table, selectCols)` devolve o `data` de cada .maybeSingle()/.single().
let resolver: (table: string, cols: string) => any = () => null;
const updates: any[] = [];

function makeClient() {
  const from = (table: string) => {
    let cols = '';
    const b: any = {
      select: (c = '') => { cols = c; return b; },
      eq: () => b, is: () => b, not: () => b, or: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => ({ data: resolver(table, cols), error: null }),
      single: async () => ({ data: resolver(table, cols), error: null }),
      update: (payload: any) => ({ eq: async () => { updates.push({ table, payload }); return { error: null }; } }),
      insert: (payload: any) => ({ select: () => ({ single: async () => ({ data: { id: 'new-id' }, error: null }) }) }),
    };
    return b;
  };
  return { from };
}
const client = makeClient();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => client }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => client, requireEmpresaSupabase: async () => client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({}) }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({ resolverConfigDaTrilha: async () => PROGRAMA_PILOTO }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { gerarEvolutionReportCore } from '@/lib/season-engine/evolution-report-core';
import { gerarAvaliacaoAcumuladaCore } from '@/lib/season-engine/avaliacao-acumulada-core';

beforeEach(() => { updates.length = 0; resolver = () => null; });

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
    expect(updates.some((u) => u.table === 'trilhas' && u.payload.status)).toBe(true); // conclui a trilha
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

describe('gerarAvaliacaoAcumuladaCore — B5 (tenant)', () => {
  it('B5: rejeita trilha de outro tenant antes de qualquer IA', async () => {
    resolver = (t) => (t === 'trilhas' ? trilhaPiloto('emp-A') : null);
    const r: any = await gerarAvaliacaoAcumuladaCore('tr1', { empresaId: 'emp-B' });
    expect(r.error).toMatch(/outro tenant/i);
  });
});
