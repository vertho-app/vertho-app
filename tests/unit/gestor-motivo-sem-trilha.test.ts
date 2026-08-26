import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * POR QUE cada liderado está sem trilha — o rótulo tem que apontar a ação certa.
 *
 * "SEM TRILHA" sozinho não diz o que fazer, e as causas pedem coisas opostas:
 * quem não tem perfil precisa fazer o mapeamento comportamental; quem já tem
 * precisa da rodada de avaliação. `Medido em 25/08:` das 313 pessoas sem trilha
 * na base, 177 param na primeira e 133 na segunda.
 *
 * O caso que exige cuidado é o TERCEIRO: perfil feito, avaliação feita, trilha
 * não gerada. São 3 pessoas hoje, e chamá-las de "sem mapeamento" cobraria de
 * quem já fez a parte dela — a pendência ali é nossa. Por isso ele tem rótulo
 * próprio, e por isso a falha de consulta apaga o motivo em vez de chutar.
 *
 * A régua é a do GERADOR: `gerarTemporadaCoreHeadless` recusa com "Colaborador
 * ainda não tem avaliação (descriptor_assessments)". É essa tabela que destrava
 * a trilha — não `respostas`.
 */

const COLABS = [
  { id: 'p1', nome_completo: 'Sem Perfil', cargo: 'Professor(a)', email: 'p1@x.com', perfil_dominante: null, perfil_externo_dados: null, gestor_email: null },
  { id: 'p2', nome_completo: 'Perfil Sem Avaliacao', cargo: 'Professor(a)', email: 'p2@x.com', perfil_dominante: 'D', perfil_externo_dados: null, gestor_email: null },
  { id: 'p3', nome_completo: 'Pronto', cargo: 'Diretor(a)', email: 'p3@x.com', perfil_dominante: 'S', perfil_externo_dados: null, gestor_email: null },
  { id: 'p4', nome_completo: 'Parcial', cargo: 'Professor(a)', email: 'p4@x.com', perfil_dominante: 'I', perfil_externo_dados: null, gestor_email: null },
  { id: 'rh2', nome_completo: 'Outro RH', cargo: 'Analista de RH', email: 'rh2@x.com', perfil_dominante: null, perfil_externo_dados: null, gestor_email: null, role: 'rh' },
];

/** Trilhas do tenant — os testes trocam para exercitar quem JA esta em jornada. */
let TRILHAS: any[] = [];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { sys_config: {} } : null),
  lista: (tabela) => {
    if (tabela === 'colaboradores') return COLABS;
    if (tabela === 'cargos_empresa') return [
      { nome: 'Professor(a)', top5_workshop: ['Didática', 'Planejamento'] },
      { nome: 'Diretor(a)', top5_workshop: ['Liderança'] },
    ];
    // p3 concluiu; p4 tem uma avaliação, mas ainda falta metade do Top 5.
    if (tabela === 'descriptor_assessments') return [
      { colaborador_id: 'p3', competencia: 'Liderança' },
      { colaborador_id: 'p4', competencia: 'Didática' },
    ];
    if (tabela === 'trilhas') return TRILHAS;
    return [];
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/authz', () => ({
  getUserContext: async () => ({
    colaborador: { id: 'rh1', email: 'rh@x.com', empresa_id: 'emp-1' },
    role: 'rh',
    empresaId: 'emp-1',
    isPlatformAdmin: false,
  }),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => 'rh@x.com',
}));

import { getGestorHomeData } from '@/app/dashboard/gestor/actions';

const motivos = async () => {
  const r: any = await getGestorHomeData();
  return Object.fromEntries((r.equipe || []).map((e: any) => [e.colabId, e.motivoSemTrilha]));
};

describe('motivo de estar sem trilha', () => {
  beforeEach(() => { sb.reset(); TRILHAS = []; });

  it('separa as duas pendências DA PESSOA', async () => {
    const m = await motivos();
    expect(m.p1).toBe('sem_perfil');
    expect(m.p2).toBe('sem_mapeamento');
  });

  it('quem já fez as duas partes não é cobrado — a pendência é nossa', async () => {
    const m = await motivos();
    expect(m.p3).toBe('aguardando_geracao');
    expect(m.p3).not.toBe('sem_mapeamento');
  });

  it('uma competência avaliada não transforma mapeamento parcial em concluído', async () => {
    const m = await motivos();
    expect(m.p4).toBe('sem_mapeamento');
    expect(m.p4).not.toBe('aguardando_geracao');
  });

  it('não trata outra conta de RH como participante pendente', async () => {
    const m = await motivos();
    expect(m).not.toHaveProperty('rh2');
  });

  it('consulta indisponível apaga o motivo em vez de acusar', async () => {
    sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'timeout no pool' });
    const m = await motivos();
    // Sem a tabela não dá para distinguir "não avaliou" de "avaliou e falta
    // gerar" — mas a ausência de perfil continua sendo observável.
    expect(m.p1).toBe('sem_perfil');
    expect(m.p2).toBeNull();
    expect(m.p3).toBeNull();
  });

  it('quem JÁ está em trilha não tem motivo — nem vira alerta', async () => {
    // `comAssessment` só é consultado para quem está sem trilha. Sem a guarda,
    // p2 (em jornada) cairia em "sem mapeamento" só por não estar no Set — e o
    // alerta contaria gente que está andando.
    TRILHAS = [{ id: 't1', colaborador_id: 'p2', status: 'ativa', criado_em: '2026-08-01', data_inicio: '2026-08-01' }];
    const r: any = await getGestorHomeData();
    const m = Object.fromEntries((r.equipe || []).map((e: any) => [e.colabId, e.motivoSemTrilha]));
    expect(m.p2).toBeNull();
    // O alerta restante é apenas o p4, que de fato continua parcial; p2 não é
    // contado enquanto já está em jornada.
    expect((r.alertas || []).find((a: any) => a.tipo === 'sem_mapeamento')?.count).toBe(1);
  });

  it('cada alerta conta o MESMO que os rótulos das linhas', async () => {
    const r: any = await getGestorHomeData();
    for (const tipo of ['sem_perfil', 'sem_mapeamento'] as const) {
      const alerta = (r.alertas || []).find((a: any) => a.tipo === tipo);
      const linhas = (r.equipe || []).filter((e: any) => e.motivoSemTrilha === tipo).length;
      expect(alerta?.count ?? 0).toBe(linhas);
    }
  });

  it('o alerta de mapeamento fala "mapeamento de competências", nunca "avaliação"', async () => {
    const r: any = await getGestorHomeData();
    const a = (r.alertas || []).find((x: any) => x.tipo === 'sem_mapeamento');
    expect(a?.mensagem).toContain('mapeamento de competências');
    expect(a?.mensagem).not.toMatch(/avalia/i);
  });
});
