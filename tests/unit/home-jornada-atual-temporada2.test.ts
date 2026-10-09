import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from './../helpers/supabase-mock';

/**
 * A home de quem entrou na Temporada 2 (Ibipeba, 09/10/2026), pelos loaders reais.
 *
 * O que as duas pessoas viam: a barra em 100% e o botão levando às semanas da
 * jornada 1, porque a home lia "a trilha mais recente da pessoa" e contava TODAS
 * as respostas dela contra o Top 5 novo (só Comunicação). O mapeamento novo só se
 * achava pelo link do WhatsApp.
 */

const MARCO = '2026-10-07T12:22:33Z';
let trilhas: any[] = [];
let respostas: any[] = [];
let pdi: any = null;
let participacoes: any[] = [];

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'cargos_empresa') return { top5_workshop: ['Comunicação'] };
    if (tabela === 'empresas') return { sys_config: {}, is_demo: false };
    if (tabela === 'relatorios') return pdi;
    return null;
  },
  lista: (tabela) => {
    if (tabela === 'turma_membros') return participacoes;
    if (tabela === 'trilhas') return trilhas;
    if (tabela === 'respostas') return respostas;
    if (tabela === 'competencias') return [{ id: 'comp-com', nome: 'Comunicação' }];
    return [];
  },
  contagem: () => 0,
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({ getDashboardView: () => 'colaborador' }));

import { carregarDashboardData, carregarJornada } from '@/lib/home/loaders';

const helmar: any = {
  id: 'helmar', empresa_id: 'ibipeba', nome_completo: 'Helmar', email: 'helmar@exemplo.com',
  cargo: 'Gestão Escolar', escola_id: null, role: 'colaborador', perfil_dominante: 'S',
};

describe('home na Temporada 2 (participação nova com marco)', () => {
  beforeEach(() => {
    sb.reset();
    participacoes = [
      { id: 'p1', turma_id: 't1', colaborador_id: 'helmar', status: 'concluido', created_at: '2026-08-13T03:24:44Z', marco_jornada: null },
      { id: 'p2', turma_id: 't2', colaborador_id: 'helmar', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
    ];
    // Jornada 1 CONCLUÍDA, carimbada com a participação da Turma 1.
    trilhas = [{
      id: 'tr1', criado_em: '2026-07-13T14:00:47Z', turma_membro_id: 'p1', status: 'concluida',
      competencia_foco: 'Planejamento e Organização', numero_temporada: 1, data_inicio: '2026-07-13',
      temporada_plano: [{ semana: 1, tipo: 'conteudo' }], programa_config: { semanas: 9 },
    }];
    respostas = [
      { competencia_id: 'comp-plan', competencia_nome: 'Planejamento e Organização' },
      { competencia_id: 'comp-auto', competencia_nome: 'Autocuidado e resiliência emocional' },
    ];
    pdi = { id: 'pdi-1', gerado_em: '2026-07-07T00:00:00Z' };
  });

  it('o botão principal não aponta a jornada anterior: sem competência foco, o caminho é o mapeamento', async () => {
    const ctx: any = { colaborador: { ...helmar }, role: 'colaborador', isPlatformAdmin: false };
    const data: any = await carregarDashboardData(ctx);
    expect(data.competenciaFoco).toBeNull();
    expect(data.temporada).toBeNull();
    // 0 de 1, e não "2 de 1" (as respostas da jornada 1 são de outras competências)
    expect(data.colaborador.respondidas).toBe(0);
    expect(data.colaborador.totalComp).toBe(1);
    expect(data.cargoSemCompetencias).toBe(false);
  });

  it('a jornada mostra o Mapeamento pendente, sem herdar PDI nem trilha da anterior', async () => {
    const jornada: any = await carregarJornada({ ...helmar });
    const fase = (n: number) => jornada.fases.find((f: any) => f.fase === n);
    expect(fase(2).status).toBe('pending');
    expect(fase(2).descricao).toBe('Competências mapeadas: 0/1');
    expect(fase(3).status).toBe('pending');   // o PDI de julho é da jornada 1
    expect(fase(4).status).toBe('pending');   // a trilha concluída é da jornada 1
    expect(fase(5).status).toBe('pending');
  });

  it('respondido o mapeamento novo, a fase 2 conclui e o PDI segue pendente até ser gerado nesta jornada', async () => {
    respostas.push({ competencia_id: 'comp-com', competencia_nome: 'Comunicação' });
    const jornada: any = await carregarJornada({ ...helmar });
    const fase = (n: number) => jornada.fases.find((f: any) => f.fase === n);
    expect(fase(2).status).toBe('completed');
    expect(fase(3).status).toBe('pending');
    expect(fase(3).descricao).toBe('Aguardando geração do PDI');
  });

  it('sem marco (turma que só continua a jornada), tudo como antes: a trilha mais recente vale', async () => {
    participacoes = participacoes.map((p) => ({ ...p, marco_jornada: null }));
    const ctx: any = { colaborador: { ...helmar }, role: 'colaborador', isPlatformAdmin: false };
    const data: any = await carregarDashboardData(ctx);
    expect(data.competenciaFoco).toBe('Planejamento e Organização');
  });

  it('falha ao ler as participações não vira "sem trilha": a seção cai', async () => {
    sb.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout' });
    await expect(carregarJornada({ ...helmar })).rejects.toThrow(/participações/);
  });
});
