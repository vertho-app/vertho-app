import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const TOP5 = ['C1', 'C2', 'C3', 'C4', 'C5'];
let temPdi = false;

const sb = criarSupabaseMock({
  resolver: (tabela, cols) => {
    if (tabela === 'cargos_empresa') return { top5_workshop: TOP5 };
    if (tabela === 'empresas') return { sys_config: {} };
    if (tabela === 'relatorios' && temPdi) return { id: 'pdi-1', gerado_em: '2026-08-25T12:00:00Z' };
    return null;
  },
  contagem: (tabela) => tabela === 'respostas' ? 5 : null,
  lista: () => [],
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({ getDashboardView: () => 'colaborador' }));

import { carregarDashboardData, carregarJornada } from '@/lib/home/loaders';

const colaborador: any = {
  id: 'bruna', empresa_id: 'emp-1', nome_completo: 'Bruna Costa',
  email: 'bruna@demo', cargo: 'Vendas', role: 'colaborador', perfil_dominante: 'CS',
};

describe('consistência do funil na home do colaborador', () => {
  beforeEach(() => { sb.reset(); temPdi = false; });

  it('mede o progresso contra o Top 5 do cargo — 5/5 é 100%', async () => {
    const ctx: any = { colaborador: { ...colaborador }, role: 'colaborador', isPlatformAdmin: false };
    const data: any = await carregarDashboardData(ctx, { trilha: null, sysConfig: {} });
    expect(data.colaborador.totalComp).toBe(5);
    expect(data.colaborador.respondidas).toBe(5);
    expect(data.colaborador.progresso).toBe(100);
    expect(data.cargoSemCompetencias).toBe(false);
    expect(sb.usou('competencias', 'select')).toBe(false);
  });

  it('mostra um PDI existente como concluído mesmo antes de existir trilha', async () => {
    temPdi = true;
    const jornada: any = await carregarJornada(colaborador, { trilha: null, sysConfig: {}, respostasCount: 5 });
    const fasePdi = jornada.fases.find((fase: any) => fase.fase === 3);
    const faseTrilha = jornada.fases.find((fase: any) => fase.fase === 4);
    expect(fasePdi).toMatchObject({ status: 'completed', bloqueado: false });
    expect(faseTrilha.status).toBe('pending');
  });
});
