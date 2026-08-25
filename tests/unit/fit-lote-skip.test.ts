import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `calcularFitLote` prometia "· N já existiam" e nunca pulou ninguém.
 *
 * A consulta de skip filtrava `.eq('cargo', …)` em `fit_resultados`, tabela que
 * só tem `cargo_nome` — PostgREST devolve `{ data: null, error: 42703 }`, o
 * `error` não era checado, e o conjunto de "já calculados" saía vazio.
 * `Medido em 25/08/2026` contra o banco: a consulta errada encontra 0, a certa
 * encontra 3 de 3 representantes do acme-demo.
 *
 * Benigno em efeito (recalcular é determinístico e não gasta IA), grave em
 * classe: é a nº 1 do "NÃO fazer" do CLAUDE.md — supabase-js RETORNA o erro, não
 * lança, então quem não olha o retorno transforma falha em "não encontrei nada".
 */

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'cargos_empresa') {
      return { id: 'cargo-1', nome: 'Representante Comercial', gabarito: { tela4: { D: {} } }, fit_perfil_ideal: null, eh_lideranca: false };
    }
    if (tabela === 'colaboradores') return { id: 'c1', nome_completo: 'Fulano', d_natural: 40 };
    return null;
  },
  lista: (tabela) => {
    if (tabela === 'colaboradores') {
      return [
        { id: 'c1', nome_completo: 'Ana', email: 'a@x.com', cargo: 'Representante Comercial' },
        { id: 'c2', nome_completo: 'Bruno', email: 'b@x.com', cargo: 'Representante Comercial' },
        { id: 'c3', nome_completo: 'Célia', email: 'c@x.com', cargo: 'Representante Comercial' },
      ];
    }
    if (tabela === 'fit_resultados') return [{ colaborador_id: 'c1' }, { colaborador_id: 'c2' }];
    return [];
  },
});

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({ email: 'admin@vertho.ai' }) }));
vi.mock('@/actions/ai-client', () => ({ callAI: async () => '' }));
// `excludeInternalEmails` recebe a query e devolve a query — no teste, passa direto.
vi.mock('@/lib/internal-emails', () => ({
  excludeInternalEmails: (q: any) => q,
  isInternalEmail: () => false,
}));
vi.mock('@/lib/scoring/fit-v2-adapter', () => ({
  calcularFitUnificado: () => ({
    fit_final: 80, classificacao: 'Aderência Alta', recomendacao: 'Aderente', score_base: 80,
    fatores: { fator_critico: 1, fator_excesso: 1 },
    blocos: { mapeamento: { score: 80 }, competencias: { score: 80 }, lideranca: null, disc: { score: 80 } },
    leitura_executiva: 'ok',
  }),
}));

import { calcularFitLote } from '@/actions/fit-v2';

describe('calcularFitLote — o skip de quem já tem Fit', () => {
  beforeEach(() => sb.reset());

  it('pergunta por `cargo_nome` (a coluna que existe), nunca por `cargo`', async () => {
    await calcularFitLote('emp-1', 'Representante Comercial');
    expect(sb.usou('fit_resultados', 'eq', 'cargo_nome'), 'deve filtrar por cargo_nome').toBe(true);
    expect(sb.usou('fit_resultados', 'eq', 'cargo'), 'a coluna `cargo` não existe em fit_resultados').toBe(false);
  });

  it('pula quem já tem Fit e calcula só o resto', async () => {
    const r: any = await calcularFitLote('emp-1', 'Representante Comercial');
    expect(r.success).toBe(true);
    expect(r.pulados, '2 dos 3 já tinham Fit').toBe(2);
    expect(r.total, 'só a Célia é calculada').toBe(1);
    expect(r.message).toContain('2 já existiam');
    // E a prova de que o skip não é só cosmético: uma escrita por colaborador
    // calculado, não três.
    expect(sb.escritas.filter((e) => e.tabela === 'fit_resultados' && e.op === 'upsert')).toHaveLength(1);
  });

  it('`forcar` ignora o skip e recalcula todos', async () => {
    const r: any = await calcularFitLote('emp-1', 'Representante Comercial', { forcar: true });
    expect(r.pulados).toBe(0);
    expect(r.total).toBe(3);
  });

  it('🔴 leitura do skip falhando → recalcula TODOS e AVISA (não conta 0 como "ninguém tinha")', async () => {
    sb.falharEm({ tabela: 'fit_resultados', op: 'select', mensagem: 'column fit_resultados.cargo does not exist', code: '42703' });

    const r: any = await calcularFitLote('emp-1', 'Representante Comercial');
    expect(r.success, 'a falha do skip não derruba o lote — o cálculo é determinístico').toBe(true);
    expect(r.total, 'sem saber quem já tinha, recalcula todos').toBe(3);
    expect(r.pulados).toBe(0);
    // O ponto do teste: o retorno DIZ que não conseguiu verificar. Antes, esta
    // mesma falha produzia "0 já existiam" com cara de resultado normal.
    expect(r.aviso, 'a falha precisa aparecer no retorno').toBeTruthy();
    expect(r.aviso).toContain('does not exist');
    expect(r.message).toContain('⚠️');
  });
});
