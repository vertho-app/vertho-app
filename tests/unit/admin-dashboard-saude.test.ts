import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';

/**
 * `loadAdminDashboard`: o bloco de saúde e o KPI de PDIs.
 *
 * Até 22/09/2026 a "saúde do sistema" só testava se 6 tabelas respondiam, com
 * "Supabase: conectado" fixo na tela, e o KPI de PDIs repetia a contagem de
 * `respostas` ("proxy"). Aqui se prova que:
 *  - cada modo do health-check mostra a PIOR severidade da última rodada, e
 *    `erro` (o check falhou) vence `critico`;
 *  - modo sem nenhuma linha é `semRun`, não OK nem falha;
 *  - o banco só "respondeu" quando a leitura das rodadas funcionou;
 *  - PDIs = relatórios individuais, contados por empresa, e contagem que falha
 *    vira `null` (a tela diz "indisponível"), nunca um número parcial.
 */

const ULTIMO: Record<string, string | null> = {
  estrutural: '2026-09-22T09:30:00.000Z',
  preflight: null,
  postflight: '2026-09-22T14:45:00.000Z',
  horizonte: '2026-09-22T12:00:00.000Z',
};
const RODADA: Record<string, any[]> = {
  estrutural: [{ severidade: 'ok', total_achados: 0, erro: null }, { severidade: 'aviso', total_achados: 3, erro: null }],
  postflight: [{ severidade: 'critico', total_achados: 1, erro: null }, { severidade: 'ok', total_achados: 0, erro: 'timeout no check' }],
  horizonte: [{ severidade: 'critico', total_achados: 42, erro: null }],
};
const modoDa = (cadeia: Chamada[]) => cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'modo')?.args[1];

let sb = criarSupabaseMock({
  resolver: (t, _c, cadeia) => {
    if (t !== 'pipeline_health_runs') return null;
    const em = ULTIMO[modoDa(cadeia)];
    return em ? { criado_em: em } : null;
  },
  lista: (t, _c, cadeia) => {
    if (t === 'empresas') return [{ id: 'e1', nome: 'A' }, { id: 'e2', nome: 'B' }];
    if (t === 'pipeline_health_runs') return RODADA[modoDa(cadeia)] || [];
    return [];
  },
  contagem: (t) => (t === 'relatorios' ? 3 : t === 'respostas' ? 99 : 0),
});

vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));
vi.mock('@/lib/internal-emails', () => ({ excludeInternalEmails: (q: any) => q }));

import { loadAdminDashboard } from '@/app/admin/dashboard/actions';

describe('loadAdminDashboard: saúde da operação e PDIs', () => {
  beforeEach(() => { sb.reset(); });

  it('cada modo traz a pior severidade da última rodada; erro vence crítico; modo sem linha é semRun', async () => {
    const r: any = await loadAdminDashboard();
    const porModo = Object.fromEntries(r.health.modos.map((m: any) => [m.modo, m]));

    expect(r.health.bancoRespondeu).toBe(true);
    expect(porModo.estrutural).toMatchObject({ status: 'aviso', achados: 3, em: ULTIMO.estrutural });
    expect(porModo.preflight).toMatchObject({ status: 'semRun', em: null });
    expect(porModo.postflight).toMatchObject({ status: 'erro', achados: 1 });
    expect(porModo.horizonte).toMatchObject({ status: 'critico', achados: 42 });
    // A rodada é recortada pelo MODO e pela janela até a última linha.
    expect(sb.usou('pipeline_health_runs', 'eq', 'modo')).toBe(true);
    expect(sb.usou('pipeline_health_runs', 'lte', 'criado_em')).toBe(true);
  });

  it('PDIs = relatórios individuais somados por empresa, não a contagem de respostas', async () => {
    const r: any = await loadAdminDashboard();
    expect(r.totalPDIs).toBe(6);
    expect(r.totalAvaliacoes).toBe(99);
    expect(sb.usou('relatorios', 'eq', 'empresa_id')).toBe(true);
    expect(sb.usou('relatorios', 'eq', 'tipo')).toBe(true);
  });

  it('falha ao ler as rodadas: banco "não respondeu" e nenhum modo aparece como OK', async () => {
    sb.falharEm({ tabela: 'pipeline_health_runs', mensagem: 'connection terminated' });
    const r: any = await loadAdminDashboard();
    expect(r.health.bancoRespondeu).toBe(false);
    expect(r.health.modos.every((m: any) => m.status === 'erro')).toBe(true);
  });

  it('falha em alguma contagem de PDIs: o KPI vira null (indisponível), não um número parcial', async () => {
    sb.falharEm({ tabela: 'relatorios', mensagem: 'statement timeout' });
    const r: any = await loadAdminDashboard();
    expect(r.totalPDIs).toBeNull();
  });
});
