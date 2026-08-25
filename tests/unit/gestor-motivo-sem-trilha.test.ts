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
];

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { sys_config: {} } : null),
  lista: (tabela) => {
    if (tabela === 'colaboradores') return COLABS;
    // Só p3 fez a avaliação; ninguém tem trilha.
    if (tabela === 'descriptor_assessments') return [{ colaborador_id: 'p3' }];
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
  beforeEach(() => sb.reset());

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

  it('consulta indisponível apaga o motivo em vez de acusar', async () => {
    sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'timeout no pool' });
    const m = await motivos();
    // Sem a tabela não dá para distinguir "não avaliou" de "avaliou e falta
    // gerar" — mas a ausência de perfil continua sendo observável.
    expect(m.p1).toBe('sem_perfil');
    expect(m.p2).toBeNull();
    expect(m.p3).toBeNull();
  });

  it('o alerta "sem perfil" e os rótulos das linhas contam a MESMA coisa', async () => {
    const r: any = await getGestorHomeData();
    const alerta = (r.alertas || []).find((a: any) => a.tipo === 'sem_perfil');
    const linhas = (r.equipe || []).filter((e: any) => e.motivoSemTrilha === 'sem_perfil').length;
    expect(alerta?.count).toBe(linhas);
  });
});
