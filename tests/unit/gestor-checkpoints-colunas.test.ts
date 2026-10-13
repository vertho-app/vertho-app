import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * 13/10/2026: a home do gestor pedia `criado_em, atualizado_em` de `checkpoints_gestor`, que tem `created_at` e
 * `validado_em`. O Postgres recusa a consulta inteira (42703) e, desde o R-139 (04/10), a home saía "indisponível"
 * para todo gestor com liderados (antes o erro era engolido e o card ficava "em dia"). Os testes de falha de leitura
 * não pegaram porque o fake de Supabase aceita qualquer coluna: quem decide o que existe é o `CREATE TABLE`.
 *
 * Duas provas:
 *  1. CONTRATO: toda coluna pedida no `select` de `checkpoints_gestor` existe no baseline do banco.
 *  2. COMPORTAMENTO: o alerta "checkpoint atrasado" lê a data pela coluna real. Com `cp.criado_em` (indefinida) a conta
 *     dava `NaN > 7`, falso, e o alerta nunca disparava, mesmo com a consulta corrigida.
 */

const h = vi.hoisted(() => ({ sb: null as any, ctx: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }) }));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => h.ctx,
  mesmoEmail: (a: string, b: string) => String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim(),
  canViewColabJourney: () => true,
  findColabByEmail: async () => null,
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => 'gestor@x.com' }));
vi.mock('@/lib/degradacao', async (orig) => ({ ...(await orig<any>()), registrarDegradacao: vi.fn() }));
vi.mock('@/lib/demo/envio-guard', () => ({ isTenantDemo: async () => false }));
vi.mock('@/actions/temporada-concluida', () => ({ loadTemporadaConcluida: vi.fn() }));

import { getGestorHomeData } from '@/app/dashboard/gestor/actions';

const GESTOR = { id: 'g1', email: 'gestor@x.com', empresa_id: 'emp-1' };
const LIDERADOS = [
  { id: 'l1', nome_completo: 'Ana', cargo: 'Professora', email: 'ana@x.com', perfil_dominante: 'S', gestor_email: 'gestor@x.com', role: 'colaborador' },
];
const DIA = 24 * 3600 * 1000;
const haDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

/** Colunas de `checkpoints_gestor` lidas do `CREATE TABLE` do baseline (a única fonte do que o banco tem). */
function colunasDoBaseline(tabela: string): string[] {
  const sql = readFileSync('migrations/000-baseline.sql', 'utf8');
  const bloco = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\."${tabela}" \\(([\\s\\S]*?)\\n\\);`));
  if (!bloco) return [];
  return [...bloco[1].matchAll(/^\s*"([a-z_0-9]+)"\s/gm)].map((m) => m[1]);
}

function montar(checkpoints: any[]) {
  h.ctx = { colaborador: GESTOR, role: 'gestor', empresaId: 'emp-1', isPlatformAdmin: false };
  h.sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { sys_config: {} } : null),
    lista: (tabela) => {
      if (tabela === 'colaboradores') return LIDERADOS;
      if (tabela === 'trilhas') return [{ id: 't1', colaborador_id: 'l1', numero_temporada: 1, status: 'ativa', criado_em: '2026-09-01', data_inicio: '2026-09-01', programa_modo: 'jornada' }];
      if (tabela === 'checkpoints_gestor') return checkpoints;
      return [];
    },
  });
}

const pendente = (idade: number) => ({ id: 'c1', trilha_id: 't1', semana: 5, status: 'pendente', avaliacao_gestor: null, created_at: haDias(idade) });

describe('home do gestor x colunas reais de checkpoints_gestor', () => {
  beforeEach(() => montar([]));

  it('o baseline foi lido (denominador): a tabela tem as colunas esperadas e NÃO tem criado_em/atualizado_em', () => {
    const colunas = colunasDoBaseline('checkpoints_gestor');
    expect(colunas.length).toBeGreaterThanOrEqual(10);
    expect(colunas).toEqual(expect.arrayContaining(['trilha_id', 'status', 'avaliacao_gestor', 'created_at', 'validado_em']));
    expect(colunas).not.toContain('criado_em');
    expect(colunas).not.toContain('atualizado_em');
  });

  it('🔴 toda coluna pedida no select de checkpoints_gestor existe no banco', async () => {
    const r: any = await getGestorHomeData();
    expect(r.ok).toBe(true);
    const selects = h.sb.chamadas.filter((c: any) => c.tabela === 'checkpoints_gestor' && c.metodo === 'select');
    expect(selects.length).toBeGreaterThanOrEqual(1); // sem isto o teste passaria sem olhar nada
    const reais = new Set(colunasDoBaseline('checkpoints_gestor'));
    for (const s of selects) {
      const pedidas = String(s.args[0]).split(',').map((c) => c.trim()).filter(Boolean);
      const inexistentes = pedidas.filter((c) => !reais.has(c));
      expect(inexistentes).toEqual([]);
    }
  });

  it('🔴 checkpoint pendente há 10 dias vira o alerta `checkpoint_atrasado` (a data é lida da coluna real)', async () => {
    montar([pendente(10)]);
    const r: any = await getGestorHomeData();
    expect(r.ok).toBe(true);
    expect(r.alertas).toEqual(expect.arrayContaining([{ tipo: 'checkpoint_atrasado', count: 1 }]));
  });

  it('checkpoint pendente há 1 dia NÃO alerta (o limite é 7 dias)', async () => {
    montar([pendente(1)]);
    const r: any = await getGestorHomeData();
    expect(r.alertas.some((a: any) => a.tipo === 'checkpoint_atrasado')).toBe(false);
  });
});
